'use strict';
// Kører White Dust inde i launcheren. Samme opskrift som spillets egen desktop-app (wd/desktop/main.js):
//   · spillets filer vises via wd://game/ i et eget vindue
//   · spillets server (server.js) kører i en egen proces på 127.0.0.1
//   · den der laver et party er vært, vennerne forbinder peer-to-peer (public/js/p2p.js)
// Forskellen er kontoen: config.js får et spil-token med, så spillet kan hente navn og gemme fremgang i skyen.
const { app, BrowserWindow, protocol, session, shell, utilityProcess } = require('electron');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeJoin } = require('./util');

const PARTITION = 'persist:white-dust';          // eget lager (localStorage m.m.), adskilt fra launcherens eget
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream',
  '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.webp': 'image/webp'
};

// Skal kaldes før appen er klar
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'wd', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
  ]);
}

// Fingeraftryk af shared/ – serveren regner det samme ud og afviser spillere med en anden udgave
function buildId(dir) {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
    h.update(f);
    h.update(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 16);
}

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const waitHealthy = (port, ms) => new Promise(res => {
  const end = Date.now() + ms;
  const poll = () => http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 1000 }, r => { r.resume(); res(true); })
    .on('error', () => (Date.now() < end ? setTimeout(poll, 250) : res(false)));
  poll();
});

const nodeModulesDir = () => app.isPackaged ? path.join(process.resourcesPath, 'runtime', 'node_modules') : path.join(app.getAppPath(), 'node_modules');

/**
 * @param {object} o
 * @param {string} o.root       mappen med spillets filer (indeholder public/, shared/ og server.js)
 * @param {string} o.version    spiludgaven (vises i spillet)
 * @param {object|null} o.account  { api, token, user:{id, displayName}, offline } eller null
 * @param {(code:string)=>void} o.onExit
 */
async function launch({ root, version, account, appVersion, onExit, log = () => {} }) {
  if (!fs.existsSync(path.join(root, 'server.js'))) throw new Error('server.js mangler i ' + root);
  const port = await freePort();
  const build = buildId(path.join(root, 'shared'));
  let proc = null, win = null, closed = false;

  const stop = code => {
    if (closed) return; closed = true;
    try { proc && proc.kill(); } catch (e) {}
    try { win && !win.isDestroyed() && win.destroy(); } catch (e) {}
    onExit && onExit(code || 'closed');
  };

  proc = utilityProcess.fork(path.join(root, 'server.js'), [], {
    serviceName: 'White Dust server', stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), NODE_PATH: nodeModulesDir() }
  });
  proc.stdout && proc.stdout.on('data', d => log('[wd-server] ' + String(d).trimEnd()));
  proc.stderr && proc.stderr.on('data', d => log('[wd-server!] ' + String(d).trimEnd()));
  proc.on('exit', code => { if (!closed) { log('[wd-server] stoppede, kode ' + code); stop('server-exit'); } });
  if (!(await waitHealthy(port, 20000))) { stop('server-failed'); throw new Error('Spilserveren startede ikke'); }

  const ses = session.fromPartition(PARTITION);
  ses.protocol.handle('wd', async req => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url).pathname); } catch (e) { return new Response('', { status: 400 }); }
    if (rel === '/config.js') {
      const g = {
        WD_SERVER: '127.0.0.1:' + port, WD_APP: 'worldwide-' + appVersion, WD_BUILD: build, WD_GAME: version, WD_P2P: true,
        WW_SESSION: account || null
      };
      const js = Object.entries(g).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('');
      return new Response(js, { headers: { 'content-type': MIME['.js'], 'cache-control': 'no-store' } });
    }
    if (rel === '/') rel = '/index.html';
    const norm = path.posix.normalize(rel);
    if (norm.includes('..')) return new Response('', { status: 403 });
    let file;
    try { file = safeJoin(root, norm.startsWith('/shared/') ? norm.slice(1) : 'public' + norm); } catch (e) { return new Response('', { status: 403 }); }
    try {
      const buf = await fs.promises.readFile(file);
      return new Response(buf, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) { return new Response('', { status: 404 }); }
  });

  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600, title: 'White Dust', backgroundColor: '#f4f4f2',
    autoHideMenuBar: true, show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.show(); win.setFullScreen(true); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('wd://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, i) => {      // F11 fuldskærm · Ctrl/Cmd+R genindlæs · Ctrl/Cmd+Shift+I udviklerværktøjer
    if (i.type !== 'keyDown') return;
    const mod = i.control || i.meta;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (mod && !i.shift && i.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
    else if (mod && i.shift && i.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // Luk ikke før fremgangen er sendt til kontoen (højst et par sekunder, ingen ventetid uden forbindelse)
  let flushing = false;
  win.on('close', e => {
    if (flushing || closed) return;
    flushing = true; e.preventDefault();
    Promise.race([
      win.webContents.executeJavaScript('window.WWAccount && window.WWAccount.flush ? window.WWAccount.flush() : 0').catch(() => {}),
      new Promise(r => setTimeout(r, 3500))
    ]).finally(() => { try { win.destroy(); } catch (er) {} });
  });
  win.on('closed', () => stop('closed'));
  win.loadURL('wd://game/');
  return { stop, window: win, port };
}

module.exports = { launch, registerScheme, buildId, PARTITION };
