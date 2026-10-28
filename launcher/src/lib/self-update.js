'use strict';
// Launcheren opdaterer sig selv, uden at man skal gøre noget: den tjekker ved start og hver time, henter i baggrunden
// og genstarter, når ingen spil kører. Kører et spil, venter den til det er lukket (eller man trykker på bjælken).
//   Windows og Linux: electron-updater.   macOS: lib/mac-update.js (appen er ikke signeret hos Apple).
const { app, shell } = require('electron');
const path = require('path');

function createSelfUpdater({ releasesUrl, repo, send, log, canRestart = () => true }) {
  let state = { state: 'idle' }, autoUpdater = null, mac = null, timer = null;
  const set = s => { state = s; send(state); if (s.state === 'ready') tryRestart(); };
  const isMac = process.platform === 'darwin';

  function tryRestart() { if (state.state === 'ready' && canRestart()) restart(); else if (state.state === 'ready' && !timer) timer = setInterval(() => { if (canRestart()) { clearInterval(timer); timer = null; restart(); } }, 15000); }
  function restart() { if (isMac) { if (mac.apply()) app.quit(); } else if (autoUpdater) autoUpdater.quitAndInstall(); }

  async function checkMac() {
    try {
      const u = await mac.check(); if (!u) return;
      if (!mac.writable()) return set({ state: 'manual', version: u.version });
      set({ state: 'downloading', version: u.version });
      await mac.download(u);
      set({ state: 'ready', version: u.version });
    } catch (e) { log('[opdatering] fejl:', e.message); if (state.state === 'downloading') set({ state: 'idle' }); }
  }

  function start() {
    if (!app.isPackaged) return;
    if (isMac) {
      const { createMacUpdater } = require('./mac-update');
      mac = createMacUpdater({ repo, version: app.getVersion(), workDir: path.join(app.getPath('userData'), 'update'), appPath: path.resolve(app.getPath('exe'), '..', '..', '..'), log });
      checkMac(); setInterval(checkMac, 3600e3).unref();
      return;
    }
    try { ({ autoUpdater } = require('electron-updater')); } catch (e) { log('[opdatering] electron-updater mangler:', e.message); return; }
    autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: m => log('[opdatering]', m), warn: m => log('[opdatering]', m), error: m => log('[opdatering]', m), debug() {} };
    autoUpdater.on('update-available', i => set({ state: 'downloading', version: i.version }));
    autoUpdater.on('update-downloaded', i => set({ state: 'ready', version: i.version }));
    autoUpdater.on('error', e => log('[opdatering] fejl:', e && e.message));
    const run = () => autoUpdater.checkForUpdates().catch(() => {});
    run(); setInterval(run, 3600e3).unref();
  }
  return { start, state: () => state, apply() { if (state.state === 'ready') restart(); else if (state.state === 'manual') shell.openExternal(releasesUrl); } };
}

module.exports = { createSelfUpdater };
