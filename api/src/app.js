'use strict';
const { tx } = require('./db');
const S = require('./secure');
const V = require('./validate');
const GAMES = require('./games');
const { createLimiter } = require('./ratelimit');
const { createMailer } = require('./mail');
const { ApiError } = V;

const DAY = 86400e3, MIN = 60e3, HOUR = 3600e3;
const GAME_TOKEN_MAX_AGE = 3 * DAY;          // et spil-token kan højst leve så længe, uanset hvor ofte det bruges
const MAX_SESSIONS = 20;
const VERSION = require('../package.json').version;

function createApp({ config, db, log = () => {} }) {
  const limiter = createLimiter();
  const mailer = createMailer(config.mail, log);
  let dummyHash = null;                                   // bruges så et login med ukendt e-mail tager lige lang tid
  const getDummy = async () => dummyHash || (dummyHash = await S.hashPassword('dummy-password', config.pepper, config.scryptCost));

  // ---- forespørgsler -------------------------------------------------------------------------------------------
  const Q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, pw_hash, display_name, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    setLogin: db.prepare('UPDATE users SET last_login_at = ?, pw_hash = ? WHERE id = ?'),
    setName: db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?'),
    setPw: db.prepare('UPDATE users SET pw_hash = ?, updated_at = ? WHERE id = ?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (id, user_id, kind, game, created_at, expires_at, last_used_at, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    session: db.prepare('SELECT s.*, u.email, u.display_name, u.created_at AS user_created FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?'),
    delSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?'),
    trimSessions: db.prepare(`DELETE FROM sessions WHERE user_id = ? AND kind = 'session' AND id NOT IN
                              (SELECT id FROM sessions WHERE user_id = ? AND kind = 'session' ORDER BY last_used_at DESC LIMIT ${MAX_SESSIONS})`),
    getSave: db.prepare('SELECT rev, data, updated_at FROM saves WHERE user_id = ? AND game = ?'),
    putSave: db.prepare(`INSERT INTO saves (user_id, game, rev, data, updated_at) VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(user_id, game) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated_at = excluded.updated_at`),
    allSaves: db.prepare('SELECT game, rev, data, updated_at FROM saves WHERE user_id = ?'),
    putReset: db.prepare(`INSERT INTO resets (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
                          ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`),
    getReset: db.prepare('SELECT * FROM resets WHERE user_id = ?'),
    bumpReset: db.prepare('UPDATE resets SET attempts = attempts + 1 WHERE user_id = ?'),
    delReset: db.prepare('DELETE FROM resets WHERE user_id = ?'),
    gcSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    gcResets: db.prepare('DELETE FROM resets WHERE expires_at < ?'),
    counts: db.prepare('SELECT (SELECT COUNT(*) FROM users) AS users')
  };
  const gc = setInterval(() => { const now = Date.now(); try { Q.gcSessions.run(now); Q.gcResets.run(now); } catch (e) { log('gc_error', { e: e.message }); } }, HOUR);
  gc.unref();

  // ---- hjælpere -----------------------------------------------------------------------------------------------
  const ipOf = req => {
    if (config.ipHeader) { const h = req.headers[config.ipHeader]; if (h) return String(h).split(',')[0].trim(); }
    return req.socket.remoteAddress || 'unknown';
  };
  const limit = (key, max, windowMs) => { const wait = limiter.hit(key, max, windowMs); if (wait) throw new ApiError(429, 'rate_limited', 'For mange forsøg. Prøv igen om lidt.', { retryAfter: wait }); };

  async function readJson(req, max = 16 * 1024) {
    const chunks = []; let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > max) throw new ApiError(413, 'payload_too_large', 'Forespørgslen er for stor');
      chunks.push(c);
    }
    if (!size) return {};
    try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (v === null || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; }
    catch (e) { throw new ApiError(400, 'invalid_json', 'Forventede et JSON-objekt'); }
  }

  const userJson = (u, withEmail) => { const o = { id: u.id, displayName: u.display_name, createdAt: u.created_at }; if (withEmail) o.email = u.email; return o; };

  function createSession(userId, kind, game, label) {
    const now = Date.now();
    const token = S.newToken(kind === 'game' ? 'wwg_' : 'wws_');
    const expires = kind === 'game' ? now + config.gameTokenHours * HOUR : now + config.sessionDays * DAY;
    Q.insertSession.run(S.sha256(token), userId, kind, game || null, now, expires, now, label ? String(label).slice(0, 60) : null);
    if (kind === 'session') Q.trimSessions.run(userId, userId);
    return { token, expiresAt: expires };
  }

  // Finder sessionen bag Authorization: Bearer … og forlænger den, hvis den er i brug.
  function auth(req, { game, sessionOnly } = {}) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!m) throw new ApiError(401, 'unauthorized', 'Log ind først');
    const id = S.sha256(m[1]), row = Q.session.get(id), now = Date.now();
    if (!row || row.expires_at < now) { if (row) Q.delSession.run(id); throw new ApiError(401, 'unauthorized', 'Sessionen er udløbet'); }
    if (sessionOnly && row.kind !== 'session') throw new ApiError(403, 'forbidden', 'Det her kræver et rigtigt login');
    if (game && row.kind === 'game' && row.game !== game) throw new ApiError(403, 'forbidden', 'Tokenet gælder et andet spil');
    if (now - row.last_used_at > 5 * MIN) {
      const ttl = row.kind === 'game' ? Math.min(now + config.gameTokenHours * HOUR, row.created_at + GAME_TOKEN_MAX_AGE) : now + config.sessionDays * DAY;
      Q.touchSession.run(now, ttl, id);
    }
    return { id, kind: row.kind, game: row.game, user: { id: row.user_id, email: row.email, display_name: row.display_name, created_at: row.user_created } };
  }

  function knownGame(g) { if (!Object.prototype.hasOwnProperty.call(GAMES, g)) throw new ApiError(404, 'unknown_game', 'Ukendt spil'); return GAMES[g]; }

  // ---- ruter --------------------------------------------------------------------------------------------------
  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  route('GET', '/v1/health', async () => ({ body: { ok: true, name: 'worldwide-id', version: VERSION, features: { passwordReset: mailer.enabled } } }));

  route('POST', '/v1/register', async ({ req }) => {
    limit('reg:' + ipOf(req), config.limits.registerPerHour, HOUR);
    const b = await readJson(req);
    const email = V.email(b.email), name = V.displayName(b.displayName);
    V.password(b.password, email);
    if (Q.userByEmail.get(email)) throw new ApiError(409, 'email_taken', 'Der findes allerede en konto med den e-mail');
    const hash = await S.hashPassword(b.password, config.pepper, config.scryptCost);
    const now = Date.now(), id = S.newId('u_');
    try { Q.insertUser.run(id, email, hash, name, now, now, now); }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new ApiError(409, 'email_taken', 'Der findes allerede en konto med den e-mail'); throw e; }
    const session = createSession(id, 'session', null, b.device);
    log('register', { user: id });
    return { status: 201, body: { user: userJson({ id, email, display_name: name, created_at: now }, true), session } };
  });

  route('POST', '/v1/login', async ({ req }) => {
    const ip = ipOf(req);
    limit('login:' + ip, config.limits.loginPer15Min, 15 * MIN);
    const b = await readJson(req);
    const email = V.email(b.email);
    if (typeof b.password !== 'string' || !b.password || b.password.length > 200) throw new ApiError(401, 'invalid_credentials', 'Forkert e-mail eller adgangskode');
    const failKey = 'fail:' + email;
    const wait = limiter.peek(failKey, config.limits.loginFailsPer15Min, 15 * MIN);
    if (wait) throw new ApiError(429, 'rate_limited', 'For mange mislykkede forsøg. Prøv igen om lidt.', { retryAfter: wait });
    const u = Q.userByEmail.get(email);
    const ok = await S.verifyPassword(b.password, u ? u.pw_hash : await getDummy(), config.pepper);
    if (!u || !ok) { limiter.add(failKey, 15 * MIN); throw new ApiError(401, 'invalid_credentials', 'Forkert e-mail eller adgangskode'); }
    limiter.clear(failKey);
    const rehash = S.needsRehash(u.pw_hash, config.scryptCost) ? await S.hashPassword(b.password, config.pepper, config.scryptCost) : u.pw_hash;
    Q.setLogin.run(Date.now(), rehash, u.id);
    return { body: { user: userJson(u, true), session: createSession(u.id, 'session', null, b.device) } };
  });

  route('POST', '/v1/logout', async ({ req }) => { const a = auth(req); Q.delSession.run(a.id); return { status: 204 }; });

  route('POST', '/v1/logout-all', async ({ req }) => { const a = auth(req, { sessionOnly: true }); Q.delUserSessions.run(a.user.id); return { status: 204 }; });

  route('GET', '/v1/me', async ({ req }) => {
    const a = auth(req);
    return { body: { user: userJson(a.user, a.kind === 'session'), kind: a.kind, game: a.game } };    // spil ser aldrig e-mailen
  });

  route('PATCH', '/v1/me', async ({ req }) => {
    const a = auth(req, { sessionOnly: true }), b = await readJson(req);
    const name = V.displayName(b.displayName);
    Q.setName.run(name, Date.now(), a.user.id);
    return { body: { user: userJson({ ...a.user, display_name: name }, true) } };
  });

  route('POST', '/v1/me/password', async ({ req }) => {
    const a = auth(req, { sessionOnly: true }), b = await readJson(req);
    const u = Q.userById.get(a.user.id);
    if (!(await S.verifyPassword(String(b.current || ''), u.pw_hash, config.pepper))) throw new ApiError(403, 'invalid_credentials', 'Den nuværende adgangskode er forkert');
    V.password(b.next, u.email);
    Q.setPw.run(await S.hashPassword(b.next, config.pepper, config.scryptCost), Date.now(), u.id);
    Q.delOtherSessions.run(u.id, a.id);                                    // andre enheder og spil skal logge ind igen
    return { status: 204 };
  });

  route('DELETE', '/v1/me', async ({ req }) => {
    const a = auth(req, { sessionOnly: true }), b = await readJson(req);
    const u = Q.userById.get(a.user.id);
    if (!(await S.verifyPassword(String(b.password || ''), u.pw_hash, config.pepper))) throw new ApiError(403, 'invalid_credentials', 'Adgangskoden er forkert');
    Q.delUser.run(u.id);                                                   // sessioner, gemte spil og nulstillinger følger med (ON DELETE CASCADE)
    log('delete_account', { user: u.id });
    return { status: 204 };
  });

  route('GET', '/v1/me/export', async ({ req }) => {
    const a = auth(req, { sessionOnly: true });
    const saves = {};
    for (const s of Q.allSaves.all(a.user.id)) saves[s.game] = { rev: s.rev, updatedAt: s.updated_at, data: JSON.parse(s.data) };
    return { body: { user: userJson(a.user, true), saves, exportedAt: Date.now() } };
  });

  // Launcheren bytter sit login til et spil-token. Spillet får aldrig adgang til e-mail, adgangskode eller andre spil.
  route('POST', '/v1/game-token', async ({ req }) => {
    const a = auth(req, { sessionOnly: true }), b = await readJson(req);
    knownGame(b.game);
    const t = createSession(a.user.id, 'game', b.game);
    return { status: 201, body: { ...t, game: b.game, user: userJson(a.user, false) } };
  });

  route('GET', '/v1/saves/:game', async ({ req, params }) => {
    knownGame(params.game);
    const a = auth(req, { game: params.game });
    const s = Q.getSave.get(a.user.id, params.game);
    return { body: s ? { rev: s.rev, updatedAt: s.updated_at, data: JSON.parse(s.data) } : { rev: 0, updatedAt: null, data: null } };
  });

  route('PUT', '/v1/saves/:game', async ({ req, params }) => {
    const g = knownGame(params.game);
    const a = auth(req, { game: params.game });
    limit('save:' + a.user.id, 120, HOUR);
    const b = await readJson(req, g.maxSaveBytes + 1024);
    if (b.data === null || typeof b.data !== 'object' || Array.isArray(b.data)) throw new ApiError(400, 'invalid_save', 'data skal være et objekt');
    const text = JSON.stringify(b.data);
    if (Buffer.byteLength(text) > g.maxSaveBytes) throw new ApiError(413, 'save_too_large', 'Gemt data er for stor');
    return tx(db, () => {
      const cur = Q.getSave.get(a.user.id, params.game), curRev = cur ? cur.rev : 0;
      // baseRev = den udgave klienten byggede videre på. Passer den ikke, har en anden enhed gemt i mellemtiden.
      if (b.baseRev !== undefined && b.baseRev !== null && b.baseRev !== curRev)
        throw new ApiError(409, 'conflict', 'En nyere udgave findes', { current: { rev: curRev, updatedAt: cur ? cur.updated_at : null, data: cur ? JSON.parse(cur.data) : null } });
      const now = Date.now();
      Q.putSave.run(a.user.id, params.game, curRev + 1, text, now);
      return { body: { rev: curRev + 1, updatedAt: now } };
    });
  });

  route('POST', '/v1/password/forgot', async ({ req }) => {
    if (!mailer.enabled) throw new ApiError(501, 'reset_unavailable', 'Nulstilling pr. e-mail er ikke slået til endnu');
    limit('forgot:' + ipOf(req), config.limits.forgotPerHour, HOUR);
    const email = V.email((await readJson(req)).email);
    limit('forgot-mail:' + email, 3, HOUR);
    const u = Q.userByEmail.get(email);
    if (u) {
      const code = S.sixDigits();
      Q.putReset.run(u.id, S.sha256(code + ':' + u.id), Date.now() + 15 * MIN);
      try { await mailer.sendResetCode(email, u.display_name, code); } catch (e) { log('mail_error', { e: e.message }); }
    }
    return { status: 202, body: { ok: true } };                           // samme svar, om kontoen findes eller ej
  });

  route('POST', '/v1/password/reset', async ({ req }) => {
    limit('reset:' + ipOf(req), 20, HOUR);
    const b = await readJson(req);
    const email = V.email(b.email), code = V.code6(b.code);
    V.password(b.password, email);
    const u = Q.userByEmail.get(email), r = u && Q.getReset.get(u.id);
    const fail = () => new ApiError(400, 'invalid_code', 'Koden er forkert eller udløbet');
    if (!r || r.expires_at < Date.now()) throw fail();
    if (r.attempts >= 5) { Q.delReset.run(u.id); throw fail(); }
    if (!S.safeEqual(S.sha256(code + ':' + u.id), r.code_hash)) { Q.bumpReset.run(u.id); throw fail(); }
    Q.setPw.run(await S.hashPassword(b.password, config.pepper, config.scryptCost), Date.now(), u.id);
    Q.delReset.run(u.id);
    Q.delUserSessions.run(u.id);
    return { body: { ok: true } };
  });

  // ---- HTTP-lag ------------------------------------------------------------------------------------------------
  const BASE_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'retry-after',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
  function send(res, status, body, extra) {
    const headers = { ...BASE_HEADERS, ...extra };
    if (body === undefined) { res.writeHead(status, headers); return res.end(); }
    headers['Content-Type'] = 'application/json; charset=utf-8';
    res.writeHead(status, headers); res.end(JSON.stringify(body));
  }

  async function handler(req, res) {
    const t0 = Date.now();
    let status = 500;
    try {
      if (req.method === 'OPTIONS') { status = 204; return send(res, 204); }
      const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
      if (path === '/') { status = 200; res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Worldwide ID\n'); }
      let hit = null, pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (r.method === req.method) { hit = { r, params: m.groups || {} }; break; }
      }
      if (!hit) throw pathMatched ? new ApiError(405, 'method_not_allowed', 'Metoden er ikke tilladt her') : new ApiError(404, 'not_found', 'Findes ikke');
      const out = await hit.r.fn({ req, params: hit.params });
      status = out.status || 200;
      send(res, status, out.body);
    } catch (e) {
      if (e instanceof ApiError) {
        status = e.status;
        const extra = e.extra && e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : undefined;
        const body = { error: { code: e.code, message: e.message } };
        if (e.extra && e.extra.current) body.current = e.extra.current;
        if (e.extra && e.extra.retryAfter) body.error.retryAfter = e.extra.retryAfter;
        send(res, status, body, extra);
      } else {
        status = 500; log('error', { path: req.url, e: e && e.stack || String(e) });
        send(res, 500, { error: { code: 'internal', message: 'Noget gik galt hos os' } });
      }
    } finally {
      log('req', { m: req.method, p: String(req.url).split('?')[0], s: status, ms: Date.now() - t0 });
    }
  }

  return { handler, mailer, stats: () => Q.counts.get(), close() { clearInterval(gc); limiter.stop(); } };
}

module.exports = { createApp };
