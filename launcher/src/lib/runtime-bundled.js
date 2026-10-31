'use strict';
// Kører spil der følger med selve launcheren (src/games/<mappe>): ingen download, ingen opdatering, altid klar.
// Spillets filer vises via flugt://game/ i et eget vindue. Kontoen sendes med i /config.js, så spillet kan hente navn og melde tider.
const { BrowserWindow, protocol, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { safeJoin } = require('./util');

const PARTITION = 'persist:flugt';             // eget lager (indstillinger, lokale tider), adskilt fra launcherens
const SCHEME = 'flugt';
const GAMES_DIR = path.join(__dirname, '..', 'games');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

// Skal kaldes før appen er klar
function registerScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
}

const rootOf = dir => { if (!/^[a-z0-9-]+$/.test(dir || '')) throw new Error('ugyldig spilmappe'); return path.join(GAMES_DIR, dir); };

/**
 * @param {object} o
 * @param {string} o.dir        spillets mappe under src/games
 * @param {string} o.title      vinduets titel
 * @param {object|null} o.account  { api, token, user:{id, displayName}, offline } eller null
 * @param {(code:string)=>void} o.onExit
 */
async function launch({ dir, title, account, appVersion, onExit, log = () => {} }) {
  const root = rootOf(dir);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Spillet mangler i launcheren: ' + dir);
  let win = null, closed = false;
  const stop = code => {
    if (closed) return; closed = true;
    try { win && !win.isDestroyed() && win.destroy(); } catch (e) {}
    onExit && onExit(code || 'closed');
  };

  const ses = session.fromPartition(PARTITION);
  ses.protocol.handle(SCHEME, async req => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url).pathname); } catch (e) { return new Response('', { status: 400 }); }
    if (rel === '/config.js') {
      const g = { WW_SESSION: account || null, WW_LAUNCHER: appVersion, WW_DEBUG: !!process.env.FLUGT_DEBUG };
      const js = Object.entries(g).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('');
      return new Response(js, { headers: { 'content-type': MIME['.js'], 'cache-control': 'no-store' } });
    }
    if (rel === '/') rel = '/index.html';
    let file;
    try { file = safeJoin(root, path.posix.normalize(rel).replace(/^\/+/, '')); } catch (e) { return new Response('', { status: 403 }); }
    try {
      const buf = await fs.promises.readFile(file);
      return new Response(buf, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) { return new Response('', { status: 404 }); }
  });

  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, title: title || 'Flugt', backgroundColor: '#12102a',
    autoHideMenuBar: true, show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.show(); if (!process.env.FLUGT_WINDOWED) win.setFullScreen(true); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(SCHEME + '://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, i) => {        // F11 fuldskærm · Ctrl/Cmd+R genindlæs · Ctrl/Cmd+Shift+I udviklerværktøjer
    if (i.type !== 'keyDown') return;
    const mod = i.control || i.meta;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (mod && !i.shift && i.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
    else if (mod && i.shift && i.key.toLowerCase() === 'i' && (process.env.FLUGT_DEBUG || process.env.WW_DEVTOOLS)) { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  win.on('closed', () => stop('closed'));
  win.loadURL(`${SCHEME}://game/`);
  return { stop, window: win };
}

module.exports = { launch, registerScheme, rootOf, PARTITION };
