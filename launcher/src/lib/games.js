'use strict';
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const web = require('./installer-web');
const native = require('./installer-native');
const { rmrf, dirSize } = require('./util');

const isAbort = e => e && (e.name === 'AbortError' || /afbrudt|aborted/i.test(e.message || ''));

// Alt om spillene: hvad er installeret, hvad sker der lige nu, og hvordan startes de.
class GameManager extends EventEmitter {
  constructor({ catalog, auth, store, defaultDir, appVersion, runtimes = {}, log = () => {}, spawnImpl = spawn }) {
    super();
    Object.assign(this, { catalog, auth, store, defaultDir, appVersion, runtimes, log, spawnImpl });
    this.busy = {};       // id -> { kind, controller, progress }
    this.running = {};    // id -> { handle, startedAt }
    this.errors = {};     // id -> { code, message }
    this.latest = {};     // id -> { version, bytes } når der findes en nyere udgave
    this._bundledSize = {};
  }

  // ---- hjælpere -------------------------------------------------------------------------------------------------
  get settings() { return this.store.get().settings; }
  _dev(id) { const d = this.settings.dev; return d && d.enabled && d.links && d.links[id] ? d.links[id] : null; }
  _dirFor(id) {
    const st = this.store.get();
    return (st.installs[id] && st.installs[id].dir) || path.join(this.settings.gamesDir || this.defaultDir, id);
  }
  _installed(id, g) {
    if (g.package.kind === 'bundled') {                    // følger med launcheren: altid installeret, opdateres sammen med den
      const rt = this.runtimes[g.package.runtime];
      if (!rt) return null;
      if (this._bundledSize[id] === undefined) { try { this._bundledSize[id] = dirSize(rt.rootOf(g.package.dir)); } catch (e) { this._bundledSize[id] = 0; } }
      return { version: g.package.version, size: this._bundledSize[id], dir: null, bundled: true };
    }
    const dir = this._dirFor(id);
    if (g.package.kind === 'web-manifest') {
      const inst = web.readInstalled(dir);
      return inst ? { version: inst.game, size: Object.values(inst.files).reduce((a, e) => a + e[1], 0), dir } : null;
    }
    const inst = native.readInstalled(dir);
    return inst && fs.existsSync(native.execPath(dir, inst)) ? { version: inst.version, size: inst.size || 0, dir, inst } : null;
  }
  _installable(g) {
    if (g.package.kind === 'bundled') return !!this.runtimes[g.package.runtime];
    if (g.package.kind === 'web-manifest') return !!g.package.manifest;
    return !!native.buildFor(g.package);
  }

  entry(id) {
    const g = this.catalog.game(id); if (!g) return null;
    const inst = this._installed(id, g), job = this.busy[id], run = this.running[id], dev = this._dev(id);
    const stats = this.store.get().stats[id] || {};
    const latest = this.latest[id];
    const update = !!(inst && latest && latest.version && latest.version !== inst.version);
    let status;
    if (job) status = job.kind;
    else if (run) status = 'running';
    else if (dev) status = 'ready';
    else if (inst) status = update ? 'update' : 'ready';
    else status = this._installable(g) ? 'not-installed' : 'unavailable';
    return {
      id, status, installed: !!inst || !!dev, dev: !!dev, bundled: !!(inst && inst.bundled), version: dev ? 'dev' : inst ? inst.version : null, size: inst ? inst.size : 0,
      dir: inst ? inst.dir : null, update: update ? { version: latest.version, bytes: latest.bytes || 0 } : null,
      progress: job ? job.progress : null, error: this.errors[id] || null,
      lastPlayed: stats.lastPlayed || null, playSeconds: Math.round(stats.playSeconds || 0)
    };
  }
  list() { return this.catalog.get().games.map(g => this.entry(g.id)); }
  _emit(id) { this.emit('state', this.entry(id)); }

  // ---- installation -----------------------------------------------------------------------------------------------
  async install(id) {
    const g = this.catalog.game(id); if (!g) throw new Error('ukendt spil');
    if (this.busy[id] || this.running[id] || g.package.kind === 'bundled') return;
    if (!this._installable(g)) throw Object.assign(new Error('Der findes ingen udgave til din computer endnu'), { code: 'no_build' });
    const had = !!this._installed(id, g);
    const dir = this._dirFor(id), controller = new AbortController();
    const job = this.busy[id] = { kind: had ? 'updating' : 'installing', controller, progress: { phase: 'prepare', done: 0, total: 0, speed: 0 } };
    delete this.errors[id]; this._emit(id);
    let last = 0;
    const onProgress = p => { job.progress = p; const n = Date.now(); if (n - last > 120 || p.phase !== 'download') { last = n; this.emit('progress', { id, ...p }); } };
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (g.package.kind === 'web-manifest') {
        const plan = await web.plan(g.package.manifest, dir, { signal: controller.signal });
        if (!plan.upToDate) await web.apply(plan, dir, { onProgress, signal: controller.signal });
      } else {
        await native.install(g.package, dir, { onProgress, signal: controller.signal });
      }
      const st = this.store.get(); st.installs[id] = { dir }; this.store.save();
      delete this.latest[id];
    } catch (e) {
      if (!isAbort(e)) { this.errors[id] = { code: e.code || 'install_failed', message: e.message }; this.log('[installation]', id, e.message); }
      if (!had) { try { if (!this._installed(id, g)) rmrf(dir); } catch (er) {} }
    } finally { delete this.busy[id]; this._emit(id); }
  }

  cancel(id) { const j = this.busy[id]; if (j) j.controller.abort(); }

  async uninstall(id) {
    const g = this.catalog.game(id);
    if (g && g.package.kind === 'bundled') return;          // kan ikke fjernes, det er en del af launcheren
    if (this.busy[id] || this.running[id]) throw new Error('Spillet er i gang. Luk det først.');
    const st = this.store.get(), dir = st.installs[id] && st.installs[id].dir;
    if (dir) rmrf(dir);
    delete st.installs[id]; this.store.save(); delete this.errors[id]; delete this.latest[id];
    this._emit(id);
  }

  async repair(id) {
    const g = this.catalog.game(id);
    if (!g || g.package.kind !== 'web-manifest' || this.busy[id] || this.running[id]) return;
    const dir = this._dirFor(id), controller = new AbortController();
    this.busy[id] = { kind: 'repairing', controller, progress: { phase: 'verify', done: 0, total: 0, speed: 0 } };
    delete this.errors[id]; this._emit(id);
    try {
      const v = await web.verify(dir);
      if (!v.ok) web.invalidate(dir, v.bad);
    } finally { delete this.busy[id]; }
    return this.install(id);
  }

  // ---- opdateringer ---------------------------------------------------------------------------------------------
  async checkOne(id) {
    const g = this.catalog.game(id); if (!g || this.busy[id] || this.running[id] || g.package.kind === 'bundled') return;
    const inst = this._installed(id, g); if (!inst) return;
    try {
      if (g.package.kind === 'web-manifest') {
        const p = await web.plan(g.package.manifest, inst.dir);
        if (p.upToDate) delete this.latest[id]; else this.latest[id] = { version: p.man.game, bytes: p.bytes };
      } else if (g.package.version && g.package.version !== inst.version) this.latest[id] = { version: g.package.version, bytes: (native.buildFor(g.package) || {}).size || 0 };
      else delete this.latest[id];
    } catch (e) { this.log('[opdatering] tjek fejlede for', id, e.message); }
    this._emit(id);
  }

  async checkUpdates() {
    for (const g of this.catalog.get().games) {
      const id = g.id;
      await this.checkOne(id);
      if (this.latest[id] && this.settings.autoUpdate && !this.running[id] && !this.busy[id]) this.install(id);
    }
  }

  // ---- start -------------------------------------------------------------------------------------------------------
  async play(id) {
    const g = this.catalog.game(id); if (!g) throw new Error('ukendt spil');
    if (this.running[id]) { const h = this.running[id].handle; try { h.window && h.window.focus(); } catch (e) {} return; }
    if (this.busy[id]) throw new Error('Spillet bliver installeret');
    if (!this._dev(id) && g.package.kind !== 'bundled' && this._installed(id, g)) {      // altid den nyeste udgave: opdatér først, start så
      await this.checkOne(id);
      if (this.latest[id]) { await this.install(id); if (this.errors[id]) this.log('[start] opdateringen fejlede, starter den udgave der er installeret'); }
    }
    const dev = this._dev(id), inst = dev ? null : this._installed(id, g);
    if (!dev && !inst) throw new Error('Spillet er ikke installeret');
    const account = await this.auth.gameAccount(id);
    if (!account && this.auth.state.status !== 'signed-in') throw Object.assign(new Error('Log ind først'), { code: 'unauthorized' });

    const startedAt = Date.now();
    const onExit = code => {
      if (!this.running[id]) return;
      delete this.running[id];
      const st = this.store.get(), s = st.stats[id] = st.stats[id] || { playSeconds: 0 };
      s.playSeconds = (s.playSeconds || 0) + (Date.now() - startedAt) / 1000; s.lastPlayed = Date.now();
      this.store.save(); this.log('[spil]', id, 'lukket', code); this._emit(id);
    };
    delete this.errors[id];
    this.running[id] = { handle: {}, startedAt };           // markeres straks, så man ikke kan starte to gange
    this._emit(id);
    try {
      let handle;
      if (g.package.kind === 'bundled') {
        const rt = this.runtimes[g.package.runtime];
        if (!rt) throw new Error('Ukendt runtime: ' + g.package.runtime);
        handle = await rt.launch({ dir: g.package.dir, title: g.name, account, appVersion: this.appVersion, onExit, log: this.log });
      } else if (g.package.kind === 'web-manifest') {
        const rt = this.runtimes[g.package.runtime];
        if (!rt) throw new Error('Ukendt runtime: ' + g.package.runtime);
        handle = await rt.launch({ root: dev || path.join(inst.dir, 'files'), version: dev ? 'dev' : inst.version, account, appVersion: this.appVersion, onExit, moduleLink: dev ? null : path.join(inst.dir, 'node_modules'), log: this.log });
      } else handle = this._spawnNative(id, g, inst, dev, account, onExit);
      this.running[id].handle = handle;
    } catch (e) {
      delete this.running[id]; this.errors[id] = { code: e.code || 'launch_failed', message: e.message }; this._emit(id); throw e;
    }
    this._emit(id);
  }

  _spawnNative(id, g, inst, dev, account, onExit) {
    const env = { ...process.env, WW_LAUNCHER: this.appVersion, WW_GAME: id };
    if (account) Object.assign(env, { WW_API: account.api, WW_USER_ID: account.user.id, WW_USER_NAME: account.user.displayName, WW_TOKEN: account.token || '', WW_OFFLINE: account.offline ? '1' : '' });
    let cmd, args = [], cwd;
    if (dev) {
      cmd = this.settings.dev.godot || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot');
      args = ['--path', dev]; cwd = dev;
    } else { cmd = native.execPath(inst.dir, inst.inst); args = inst.inst.args || []; cwd = path.dirname(cmd); }
    const child = this.spawnImpl(cmd, args, { env, cwd, stdio: 'ignore', detached: false });
    child.once('error', e => { this.errors[id] = { code: 'launch_failed', message: e.message }; onExit('error'); });
    child.once('exit', code => onExit(code));
    return { stop: () => { try { child.kill(); } catch (e) {} }, pid: child.pid };
  }

  stopAll() { for (const r of Object.values(this.running)) try { r.handle.stop && r.handle.stop(); } catch (e) {} }
}

module.exports = { GameManager };
