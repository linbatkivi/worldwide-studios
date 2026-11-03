'use strict';
// Forbindelsen mellem et spil i launcheren og launcheren selv: spillet kan bede om at blive lukket (Afslut spil).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('WWHost', { quit: () => ipcRenderer.send('ww:game-quit') });
