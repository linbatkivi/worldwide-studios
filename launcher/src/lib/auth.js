'use strict';
const { EventEmitter } = require('events');

// Holder styr på hvem der er logget ind. Tokenet ligger kun her i hovedprocessen; vinduet får aldrig fat i det.
class Auth extends EventEmitter {
  constructor({ WW, api, secure, device, log = () => {} }) {
    super();
    this.WW = WW; this.api = api; this.secure = secure; this.device = device; this.log = log;
    this.client = WW.createClient({ api, fetch: (...a) => this._fetch(...a) });
    this.state = { status: 'loading', user: null, offline: false };
    this.features = { passwordReset: false };
  }
  setFetch(f) { this._f = f; }
  _fetch(...a) { return (this._f || fetch)(...a); }

  _set(patch) { this.state = { ...this.state, ...patch }; this.emit('change', this.snapshot()); }
  snapshot() { return { ...this.state, api: this.api, features: this.features, secureStorage: this.secure.encrypted() }; }

  _persist(token, user) { return this.secure.set('session', { token, user }); }

  async probe() {                       // hvad kan serveren? (bl.a. om nulstilling pr. mail er slået til)
    try { const h = await this.client.health(); this.features = h.features || this.features; } catch (e) { /* offline */ }
  }

  async restore() {
    this.probe().then(() => this.emit('change', this.snapshot()));
    const s = await this.secure.get('session');
    if (!s || !s.token) { this._set({ status: 'signed-out', user: null, offline: false }); return this.snapshot(); }
    this.client.setToken(s.token);
    try {
      const r = await this.client.me();
      await this._persist(s.token, r.user);
      this._set({ status: 'signed-in', user: r.user, offline: false });
    } catch (e) {
      if (e.status === 401) { await this.secure.delete('session'); this.client.setToken(null); this._set({ status: 'signed-out', user: null, offline: false }); }
      else { this.log('[konto] ingen forbindelse, bruger gemt login:', e.message); this._set({ status: 'signed-in', user: s.user, offline: true }); }
    }
    return this.snapshot();
  }

  async _enter(r) {
    await this._persist(r.session.token, r.user);
    this._set({ status: 'signed-in', user: r.user, offline: false });
    return this.snapshot();
  }
  async login(email, password) { return this._enter(await this.client.login({ email, password, device: this.device })); }
  async register(email, password, displayName) { return this._enter(await this.client.register({ email, password, displayName, device: this.device })); }

  async logout() {
    try { await this.client.logout(); } catch (e) { /* også uden forbindelse skal man kunne logge ud */ }
    this.client.setToken(null); await this.secure.delete('session');
    this._set({ status: 'signed-out', user: null, offline: false });
    return this.snapshot();
  }

  forgot(email) { return this.client.forgot(email); }
  reset(email, code, password) { return this.client.reset({ email, code, password }); }

  async rename(name) {
    const r = await this.client.rename(name);
    await this._persist(this.client.getToken(), r.user); this._set({ user: r.user });
    return this.snapshot();
  }
  async changePassword(current, next) { await this.client.changePassword(current, next); return true; }
  async remove(password) {
    await this.client.deleteAccount(password);
    this.client.setToken(null); await this.secure.delete('session');
    this._set({ status: 'signed-out', user: null, offline: false });
    return this.snapshot();
  }
  exportData() { return this.client.exportData(); }

  // Det et spil får med sig: adresse, et token der kun gælder dét spil, og spillerens id og navn.
  async gameAccount(game) {
    if (this.state.status !== 'signed-in') return null;
    const offline = () => ({ api: this.api, token: null, offline: true, game, user: { id: this.state.user.id, displayName: this.state.user.displayName } });
    try {
      const t = await this.client.gameToken(game);
      if (this.state.offline) this._set({ offline: false });
      return { api: this.api, token: t.token, expiresAt: t.expiresAt, offline: false, game, user: t.user };
    } catch (e) {
      if (e.status === 401) { await this.logout(); return null; }
      this.log('[konto] spil-token kunne ikke hentes:', e.message);
      this._set({ offline: true });
      return offline();
    }
  }
}

module.exports = { Auth };
