'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Vinduet får kun de her funktioner. Alt går gennem hovedprocessen, som ejer login og filer.
async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw Object.assign(new Error(r.error.message), r.error);
  return r.data;
}
const on = (channel, cb) => { const f = (_e, p) => cb(p); ipcRenderer.on(channel, f); return () => ipcRenderer.removeListener(channel, f); };

contextBridge.exposeInMainWorld('ww', {
  platform: process.platform,
  app: {
    info: () => call('app:info'),
    openExternal: url => call('app:openExternal', url),
    updateState: () => call('app:update:state'),
    applyUpdate: () => call('app:update:apply'),
    onUpdate: cb => on('app:update', cb)
  },
  auth: {
    state: () => call('auth:state'),
    login: (email, password) => call('auth:login', email, password),
    register: (email, password, name) => call('auth:register', email, password, name),
    logout: () => call('auth:logout'),
    forgot: email => call('auth:forgot', email),
    reset: (email, code, password) => call('auth:reset', email, code, password),
    rename: name => call('auth:rename', name),
    changePassword: (current, next) => call('auth:password', current, next),
    remove: password => call('auth:remove', password),
    exportData: () => call('auth:export'),
    onChange: cb => on('auth:change', cb)
  },
  catalog: {
    get: () => call('catalog:get'),
    refresh: () => call('catalog:refresh'),
    onChange: cb => on('catalog:change', cb)
  },
  games: {
    list: () => call('games:list'),
    install: id => call('games:install', id),
    cancel: id => call('games:cancel', id),
    play: id => call('games:play', id),
    uninstall: id => call('games:uninstall', id),
    repair: id => call('games:repair', id),
    reveal: id => call('games:reveal', id),
    check: () => call('games:check'),
    onState: cb => on('games:state', cb),
    onProgress: cb => on('games:progress', cb)
  },
  settings: {
    get: () => call('settings:get'),
    set: patch => call('settings:set', patch),
    pickDir: () => call('settings:pickDir')
  }
});
