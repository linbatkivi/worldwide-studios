/* Worldwide ID – klient til kontosystemet.
   Samme fil bruges af hjemmesiden, launcheren og spillene (browser: <script src="worldwide.js">, Node/Electron: require).
   Ingen afhængigheder. Kræver fetch (alle moderne browsere og Node 18+).

     const ww = WW.createClient({ api: 'https://…' });
     const { user, session } = await ww.login({ email, password });
     const sync = ww.gameSync({ game: 'white-dust', token: session.token });
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WW = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class WWError extends Error {
    constructor(status, code, message, extra) { super(message || code); this.name = 'WWError'; this.status = status; this.code = code; Object.assign(this, extra); }
  }

  // Tekster til brugeren, fordi API'et kun lover en kode. Klienter kan selv overskrive dem.
  const MESSAGES = {
    da: {
      network: 'Kan ikke nå kontoserveren. Tjek dit internet.',
      timeout: 'Kontoserveren svarede ikke. Prøv igen.',
      invalid_email: 'E-mailen ser ikke rigtig ud.',
      invalid_password: 'Skriv en adgangskode.',
      weak_password: 'Adgangskoden skal være mindst 8 tegn.',
      invalid_name: 'Navnet skal være 2–14 tegn: bogstaver, tal, mellemrum, _ - og .',
      invalid_code: 'Koden er forkert eller udløbet.',
      email_taken: 'Der findes allerede en konto med den e-mail.',
      invalid_credentials: 'Forkert e-mail eller adgangskode.',
      unauthorized: 'Du er logget ud. Log ind igen.',
      forbidden: 'Det har du ikke adgang til.',
      rate_limited: 'For mange forsøg. Vent lidt og prøv igen.',
      reset_unavailable: 'Nulstilling på mail er ikke slået til endnu.',
      conflict: 'Dine data er ændret et andet sted.',
      internal: 'Noget gik galt hos os. Prøv igen om lidt.'
    },
    en: {
      network: 'Cannot reach the account server. Check your connection.',
      timeout: 'The account server did not answer. Try again.',
      invalid_email: 'That email does not look right.',
      invalid_password: 'Enter a password.',
      weak_password: 'The password needs at least 8 characters.',
      invalid_name: 'The name must be 2–14 characters: letters, numbers, spaces, _ - and .',
      invalid_code: 'The code is wrong or has expired.',
      email_taken: 'An account with that email already exists.',
      invalid_credentials: 'Wrong email or password.',
      unauthorized: 'You have been signed out. Sign in again.',
      forbidden: 'You do not have access to that.',
      rate_limited: 'Too many attempts. Wait a bit and try again.',
      reset_unavailable: 'Password reset by email is not switched on yet.',
      conflict: 'Your data was changed somewhere else.',
      internal: 'Something went wrong on our side. Try again shortly.'
    }
  };
  const explain = (err, lang) => (MESSAGES[lang || 'da'] || MESSAGES.da)[err && err.code] || (err && err.message) || 'Ukendt fejl';

  function createClient(opts) {
    const api = String(opts.api || '').replace(/\/+$/, '');
    if (!api) throw new Error('WW: api mangler');
    const doFetch = opts.fetch || ((...a) => fetch(...a));
    const timeout = opts.timeout || 12000;
    let token = opts.token || null;

    async function call(method, path, { body, auth = true, tokenOverride } = {}) {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const t = tokenOverride || token;
      if (auth && t) headers.Authorization = 'Bearer ' + t;
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
      let res;
      try {
        res = await doFetch(api + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined });
      } catch (e) {
        throw new WWError(0, e && e.name === 'AbortError' ? 'timeout' : 'network', e && e.message);
      } finally { if (timer) clearTimeout(timer); }
      if (res.status === 204) return null;
      let data = null;
      try { data = await res.json(); } catch (e) { /* tomt eller ikke JSON */ }
      if (!res.ok) {
        const er = (data && data.error) || {};
        throw new WWError(res.status, er.code || 'internal', er.message, { retryAfter: er.retryAfter, current: data && data.current });
      }
      return data;
    }

    const api_ = {
      api,
      explain,
      setToken(t) { token = t || null; },
      getToken() { return token; },
      health: () => call('GET', '/v1/health', { auth: false }),
      async register({ email, password, displayName, device }) {
        const r = await call('POST', '/v1/register', { auth: false, body: { email, password, displayName, device } });
        token = r.session.token; return r;
      },
      async login({ email, password, device }) {
        const r = await call('POST', '/v1/login', { auth: false, body: { email, password, device } });
        token = r.session.token; return r;
      },
      async logout() { try { await call('POST', '/v1/logout'); } finally { token = null; } },
      logoutAll: () => call('POST', '/v1/logout-all'),
      me: () => call('GET', '/v1/me'),
      rename: displayName => call('PATCH', '/v1/me', { body: { displayName } }),
      changePassword: (current, next) => call('POST', '/v1/me/password', { body: { current, next } }),
      deleteAccount: password => call('DELETE', '/v1/me', { body: { password } }),
      exportData: () => call('GET', '/v1/me/export'),
      forgot: email => call('POST', '/v1/password/forgot', { auth: false, body: { email } }),
      reset: ({ email, code, password }) => call('POST', '/v1/password/reset', { auth: false, body: { email, code, password } }),
      gameToken: game => call('POST', '/v1/game-token', { body: { game } }),
      getSave: game => call('GET', '/v1/saves/' + encodeURIComponent(game)),
      putSave: (game, data, baseRev) => call('PUT', '/v1/saves/' + encodeURIComponent(game), { body: { data, baseRev } })
    };

    // Til spil: holder styr på revisionen og samler mange ændringer til ét kald. Ved en konflikt (en anden enhed har
    // gemt) kaldes merge(serverData, minData) og resultatet gemmes oven på serverens udgave.
    api_.gameSync = function ({ game, token: gt, merge, delay = 4000 }) {
      const c = createClient({ api, fetch: doFetch, timeout, token: gt });
      let rev = 0, pending = null, timer = null, busy = null, dead = false;
      async function pull() { const r = await c.getSave(game); rev = r.rev; return r; }
      async function flush() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (busy) { await busy.catch(() => {}); }
        if (pending === null || dead) return;
        const mine = pending; pending = null;
        busy = (async () => {
          try { const r = await c.putSave(game, mine, rev); rev = r.rev; }
          catch (e) {
            if (e.code === 'conflict' && e.current) {
              const merged = merge ? merge(e.current.data, mine) : mine;
              const r = await c.putSave(game, merged, e.current.rev); rev = r.rev;
            } else if (e.status === 401) { dead = true; throw e; }
            else { pending = pending === null ? mine : pending; throw e; }     // netværksfejl: prøv igen ved næste flush
          }
        })();
        try { await busy; } finally { busy = null; }
      }
      function push(data) { pending = data; if (!timer) timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, delay); }
      return { pull, push, flush, me: () => c.me(), get rev() { return rev; }, get dead() { return dead; } };
    };
    return api_;
  }

  return { createClient, WWError, MESSAGES, explain };
});
