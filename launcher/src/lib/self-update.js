'use strict';
// Launcheren opdaterer sig selv fra GitHub Releases. Windows og Linux henter og installerer selv.
// Mac-appen er ikke signeret med et Apple-certifikat og kan ikke erstatte sig selv, så der peges på download-siden.
const { app, shell } = require('electron');

function createSelfUpdater({ releasesUrl, send, log }) {
  let autoUpdater = null, state = { state: 'idle' };
  const set = s => { state = s; send(state); };
  const mac = process.platform === 'darwin';

  function start() {
    if (!app.isPackaged) return;
    try { ({ autoUpdater } = require('electron-updater')); } catch (e) { log('[opdatering] electron-updater mangler:', e.message); return; }
    autoUpdater.autoDownload = !mac;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: m => log('[opdatering]', m), warn: m => log('[opdatering]', m), error: m => log('[opdatering]', m), debug() {} };
    autoUpdater.on('update-available', i => set({ state: mac ? 'manual' : 'downloading', version: i.version }));
    autoUpdater.on('update-downloaded', i => set({ state: 'ready', version: i.version }));
    autoUpdater.on('error', e => log('[opdatering] fejl:', e && e.message));
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600e3).unref();
  }
  return {
    start,
    state: () => state,
    apply() {
      if (state.state === 'ready' && autoUpdater) autoUpdater.quitAndInstall();
      else if (state.state === 'manual') shell.openExternal(releasesUrl);
    }
  };
}

module.exports = { createSelfUpdater };
