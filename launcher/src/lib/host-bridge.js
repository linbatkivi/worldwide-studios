'use strict';
// Spil der vises i et vindue fra launcheren kan lukke sig selv med window.WWHost.quit() (se game-preload.js).
const { ipcMain } = require('electron');
const path = require('path');

const PRELOAD = path.join(__dirname, '..', 'game-preload.js');

// Lukker vinduet pænt (spillet får lov at sende fremgang), når spillets egen side beder om det. Returnerer en funktion der fjerner lytteren.
function attachQuit(win) {
  const on = e => { if (!win.isDestroyed() && e.sender === win.webContents) win.close(); };
  ipcMain.on('ww:game-quit', on);
  return () => ipcMain.removeListener('ww:game-quit', on);
}

module.exports = { PRELOAD, attachQuit };
