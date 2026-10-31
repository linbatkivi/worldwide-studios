// Spillerkontoen: navnet kommer fra launcheren (WW_SESSION), tiderne går til ranglisten på kontoserveren.
// Uden forbindelse (eller uden konto) gemmes tiderne på maskinen og sendes næste gang det kan lade sig gøre.
const GAME = 'flugt';

export const fmt = ms => {
  ms = Math.max(0, Math.floor(ms));
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export class Account {
  constructor(session) {
    this.session = session && session.user ? session : null;
    this.uid = this.session ? this.session.user.id : 'gaest';
    this.name = this.session ? this.session.user.displayName : 'Gæst';
    this.client = null;
    if (this.session && this.session.token && this.session.api && window.WW && !this.session.offline) {
      this.client = window.WW.createClient({ api: this.session.api, token: this.session.token, timeout: 8000 });
    }
    this.status = this.session ? (this.client ? 'online' : 'offline') : 'guest';   // online | offline | guest | expired
    this.kLocal = `flugt.local.${this.uid}`; this.kPending = `flugt.pending.${this.uid}`;
    this.local = read(this.kLocal, { best: 0, runs: [] });
    this.flush();
  }

  get best() { return this.local.best; }

  // Gemmer runden på maskinen og melder den til serveren, hvis det kan lade sig gøre.
  // Svar: { saved: 'online'|'local', rank, total, ms, improved }
  async submit(ms) {
    ms = Math.floor(ms);
    const improvedLocal = ms > this.local.best;
    this.local.best = Math.max(this.local.best, ms);
    this.local.runs = [ms, ...this.local.runs].slice(0, 30);
    write(this.kLocal, this.local);
    const res = { saved: 'local', ms, improved: improvedLocal, rank: null, total: null };
    if (!this.client) return res;
    try {
      const r = await this.client.submitScore(GAME, ms);
      this.status = 'online';
      write(this.kPending, null);
      return { saved: 'online', ms, improved: r.improved, rank: r.rank, total: r.total, best: r.ms };
    } catch (e) {
      if (e.status === 401) this.status = 'expired';
      else if (e.status === 404) this.status = 'offline';             // serveren kender ikke ranglisten endnu
      else if (e.status === 400) return res;                           // tiden blev afvist: ingen grund til at prøve igen
      const p = read(this.kPending, null);
      if (!p || ms > p.ms) write(this.kPending, { ms, at: Date.now() });
      return res;
    }
  }

  // Send en tid, der blev gemt, mens der ikke var forbindelse
  async flush() {
    const p = read(this.kPending, null);
    if (!p || !this.client) return;
    try { await this.client.submitScore(GAME, p.ms); write(this.kPending, null); }
    catch (e) { if (e.status && e.status !== 401 && e.status < 500) write(this.kPending, null); }
  }

  // Tavlen: { source: 'online'|'local', rows: [{ rank, name, ms, me }], total, me }
  async board(limit = 12) {
    if (this.client) {
      try {
        const r = await this.client.leaderboard(GAME, limit);
        this.status = 'online';
        return { source: 'online', rows: r.top, total: r.total, me: r.me };
      } catch (e) { if (e.status === 401) this.status = 'expired'; }
    } else if (this.session && this.session.api && window.WW) {         // uden token kan man stadig se listen
      try {
        const r = await window.WW.createClient({ api: this.session.api, timeout: 8000 }).leaderboard(GAME, limit);
        return { source: 'online', rows: r.top, total: r.total, me: null };
      } catch (e) { /* ingen forbindelse: vis den lokale */ }
    }
    const rows = [...this.local.runs].sort((a, b) => b - a).slice(0, limit).map((ms, i) => ({ rank: i + 1, name: this.name, ms, me: true }));
    return { source: 'local', rows, total: rows.length, me: null };
  }
}
