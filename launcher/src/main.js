'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, net, safeStorage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const wd = require('./lib/runtime-white-dust');
wd.registerScheme();                                  // skal ske før appen er klar

// Test: WW_USERDATA giver en helt ren kopi, WW_PROFILE en ekstra kopi ved siden af (to spillere på én maskine).
if (process.env.WW_USERDATA) app.setPath('userData', path.resolve(process.env.WW_USERDATA));
else if (process.env.WW_PROFILE) app.setPath('userData', path.join(app.getPath('appData'), 'Worldwide ' + process.env.WW_PROFILE));
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');     // White Dust: peer-to-peer med rigtige lokale adresser

const WW = require('./shared/worldwide');
const { useFetch } = require('./lib/net');
const { createStore } = require('./lib/store');
const { createSecureStore } = require('./lib/secure');
const { Auth } = require('./lib/auth');
const { createCatalog } = require('./lib/catalog');
const { GameManager } = require('./lib/games');
const { createSelfUpdater } = require('./lib/self-update');
const { safeJoin } = require('./lib/util');

const mac = process.platform === 'darwin';
const isDev = !app.isPackaged;
let win = null, ctx = null;

function log(...a) {
  const line = `${new Date().toISOString()} ${a.map(x => typeof x === 'string' ? x : (x && x.stack) || JSON.stringify(x)).join(' ')}`;
  console.log(line);
  try {
    const dir = path.join(app.getPath('userData'), 'logs'), f = path.join(dir, 'launcher.log');
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(f) && fs.statSync(f).size > 1e6) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, line + '\n');
  } catch (e) { /* loggen må aldrig vælte appen */ }
}

// ---- IPC: ét svar-format, så vinduet altid ved hvad der gik galt ------------------------------------------------------
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents) return { ok: false, error: { code: 'forbidden', message: 'forbidden' } };
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) {
      if (!(e && e.code && typeof e.code === 'string')) log('[ipc]', channel, e);
      return { ok: false, error: { code: (e && e.code) || 'error', message: (e && e.message) || String(e), retryAfter: e && e.retryAfter } };
    }
  });
}
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

async function boot() {
  const userData = app.getPath('userData');
  useFetch((url, opts) => net.fetch(url, opts));
  const store = createStore(path.join(userData, 'state.json'));
  // macOS-nøgleringen binder en post til appens signatur. Appen har kun en ad hoc-signatur, der skifter ved hver ny udgave,
  // og så ville man blive logget ud efter hver opdatering. Derfor bruges en fil kun brugeren kan læse på Mac,
  // indtil appen signeres med et Apple Developer ID. Windows (DPAPI) og Linux (libsecret) bruger systemets nøglering.
  const secure = createSecureStore(path.join(userData, 'secrets.json'), process.platform === 'darwin' ? null : safeStorage);
  const secureReady = secure.init();             // kan tage et øjeblik første gang (nøgleringen), så vinduet venter ikke på det
  const catalog = createCatalog({ userData, log });
  const api = (process.env.WW_API || catalog.get().api).replace(/\/+$/, '');
  const device = `Worldwide ${app.getVersion()} · ${{ darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform] || process.platform}`;

  const auth = new Auth({ WW, api, secure, device, log });
  auth.setFetch((url, opts) => net.fetch(url, opts));
  auth.on('change', s => send('auth:change', s));

  const games = new GameManager({
    catalog, auth, store, defaultDir: path.join(userData, 'games'), appVersion: app.getVersion(),
    runtimes: { 'white-dust': wd }, log
  });
  games.on('state', e => send('games:state', e));
  games.on('progress', p => send('games:progress', p));

  const updater = createSelfUpdater({
    releasesUrl: `https://github.com/${catalog.get().launcher.repo}/releases/latest`, repo: catalog.get().launcher.repo,
    canRestart: () => Object.keys(games.running).length === 0,
    send: s => send('app:update', s), log
  });
  ctx = { store, secure, catalog, auth, games, updater, api, userData };

  // ---- konto
  handle('auth:state', () => auth.snapshot());
  handle('auth:login', (email, password) => auth.login(email, password));
  handle('auth:register', (email, password, name) => auth.register(email, password, name));
  handle('auth:logout', () => auth.logout());
  handle('auth:forgot', email => auth.forgot(email));
  handle('auth:reset', (email, code, password) => auth.reset(email, code, password));
  handle('auth:rename', name => auth.rename(name));
  handle('auth:password', (cur, next) => auth.changePassword(cur, next));
  handle('auth:remove', password => auth.remove(password));
  handle('auth:export', async () => {
    const data = await auth.exportData();
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), 'worldwide-mine-data.json'), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return true;
  });

  // ---- katalog og spil
  handle('catalog:get', () => catalog.get());
  handle('catalog:refresh', async () => { const r = await catalog.refresh(); if (r.changed) send('catalog:change', r.catalog); return r.catalog; });
  handle('games:list', () => games.list());
  handle('games:install', id => { games.install(id).catch(e => log('[install]', e)); });     // svarer straks, fremgangen kommer som events
  handle('games:cancel', id => games.cancel(id));
  handle('games:play', id => games.play(id));
  handle('games:uninstall', id => games.uninstall(id));
  handle('games:repair', id => { games.repair(id).catch(e => log('[repair]', e)); });
  handle('games:check', async () => { const r = await catalog.refresh(); if (r.changed) send('catalog:change', r.catalog); return games.checkUpdates(); });
  handle('games:reveal', id => { const e = games.entry(id); if (e && e.dir) shell.showItemInFolder(e.dir); });

  // ---- indstillinger
  handle('settings:get', () => store.get().settings);
  handle('settings:set', patch => {
    const s = store.get().settings;
    for (const k of ['lang', 'autoUpdate', 'gamesDir']) if (k in patch) s[k] = patch[k];
    if (patch.dev) s.dev = { ...s.dev, ...patch.dev };
    store.save(); catalog.get().games.forEach(g => games._emit(g.id));
    return s;
  });
  handle('settings:pickDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  // ---- app
  handle('app:info', async () => { await secureReady; return { version: app.getVersion(), platform: process.platform, arch: process.arch, locale: app.getLocale(), api, secureStorage: secure.encrypted(), dev: isDev, userData }; });
  handle('app:openExternal', url => { if (/^https:\/\//.test(url) || /^mailto:/.test(url)) return shell.openExternal(url); });
  handle('app:update:state', () => updater.state());
  handle('app:update:apply', () => updater.apply());

  await secureReady;
  await auth.restore();
  catalog.refresh().then(r => { if (r.changed) send('catalog:change', r.catalog); }).then(() => games.checkUpdates()).catch(() => {});
  setInterval(() => catalog.refresh().then(r => { if (r.changed) send('catalog:change', r.catalog); }).then(() => games.checkUpdates()).catch(() => {}), 30 * 60e3).unref();
  updater.start();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 780, minWidth: 980, minHeight: 640, title: 'Worldwide', backgroundColor: '#09090a', show: false,
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    ...(mac ? { trafficLightPosition: { x: 20, y: 19 } } : { titleBarOverlay: { color: '#09090a', symbolColor: '#ecebe4', height: 44 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && (isDev || process.env.WW_DEVTOOLS) && (i.control || i.meta) && i.shift && i.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

if (!process.env.WW_PROFILE && !process.env.WW_USERDATA && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(mac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
    createWindow();
    await boot();
  }).catch(e => { log('[start]', e); dialog.showErrorBox('Worldwide kunne ikke starte', String(e && e.message || e)); app.quit(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  app.on('window-all-closed', () => { if (ctx) ctx.games.stopAll(); app.quit(); });
  app.on('before-quit', () => { if (ctx) ctx.games.stopAll(); });
}
