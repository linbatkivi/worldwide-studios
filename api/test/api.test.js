'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../src/config');
const { createServer } = require('../src/index');

async function boot(env = {}) {
  const config = load({ DB_PATH: ':memory:', SCRYPT_COST: '10', MAIL_MODE: 'console', LIMIT_LOGIN_FAILS: '4', ...env });
  const s = createServer(config, { quiet: true });
  await new Promise(r => s.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + s.server.address().port;
  const call = async (method, path, { body, token, raw } = {}) => {
    const r = await fetch(base + path, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
  };
  return { ...s, call };
}

const ME = { email: 'Linus@Example.com', password: 'hemmelig-kode-1', displayName: 'Linus' };

test('health', async t => {
  const s = await boot(); t.after(() => s.close());
  const r = await s.call('GET', '/v1/health');
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.features.passwordReset, true);
});

test('CORS preflight og sikkerhedsheadere', async t => {
  const s = await boot(); t.after(() => s.close());
  const r = await fetch(`http://127.0.0.1:${s.server.address().port}/v1/login`, { method: 'OPTIONS' });
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('opret konto, hent profil, log ind igen', async t => {
  const s = await boot(); t.after(() => s.close());
  const reg = await s.call('POST', '/v1/register', { body: ME });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, 'linus@example.com');            // e-mail gemmes med små bogstaver
  assert.match(reg.body.session.token, /^wws_/);
  assert.equal(reg.body.user.password, undefined);

  const me = await s.call('GET', '/v1/me', { token: reg.body.session.token });
  assert.equal(me.status, 200); assert.equal(me.body.user.displayName, 'Linus'); assert.equal(me.body.kind, 'session');

  const login = await s.call('POST', '/v1/login', { body: { email: 'LINUS@example.com', password: ME.password } });
  assert.equal(login.status, 200); assert.notEqual(login.body.session.token, reg.body.session.token);
});

test('adgangskoden gemmes aldrig i klartekst', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.call('POST', '/v1/register', { body: ME });
  const row = s.db.prepare('SELECT pw_hash FROM users').get();
  assert.match(row.pw_hash, /^scrypt\$10\$8\$1\$/); assert.ok(!row.pw_hash.includes(ME.password));
  const tok = s.db.prepare('SELECT id FROM sessions').get();
  assert.match(tok.id, /^[0-9a-f]{64}$/);                            // kun sha256 af tokenet
});

test('validering af e-mail, adgangskode og navn', async t => {
  const s = await boot({ LIMIT_REGISTER: '100' }); t.after(() => s.close());
  const cases = [
    [{ ...ME, email: 'ikke-en-mail' }, 'invalid_email'],
    [{ ...ME, password: 'kort' }, 'weak_password'],
    [{ ...ME, password: 'aaaaaaaaaa' }, 'weak_password'],
    [{ ...ME, displayName: 'x' }, 'invalid_name'],
    [{ ...ME, displayName: 'navn<script>' }, 'invalid_name'],
    [{ ...ME, displayName: 'altformegetlangtnavn' }, 'invalid_name']
  ];
  for (const [body, code] of cases) { const r = await s.call('POST', '/v1/register', { body }); assert.equal(r.status, 400); assert.equal(r.body.error.code, code); }
  const ok = await s.call('POST', '/v1/register', { body: { ...ME, displayName: 'Søren Åbo' } });
  assert.equal(ok.status, 201); assert.equal(ok.body.user.displayName, 'Søren Åbo');
});

test('samme e-mail kan ikke oprettes to gange', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.call('POST', '/v1/register', { body: ME });
  const r = await s.call('POST', '/v1/register', { body: { ...ME, email: 'linus@EXAMPLE.com' } });
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'email_taken');
});

test('forkert adgangskode og ukendt konto giver samme svar', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.call('POST', '/v1/register', { body: ME });
  const a = await s.call('POST', '/v1/login', { body: { email: ME.email, password: 'forkert-kode-1' } });
  const b = await s.call('POST', '/v1/login', { body: { email: 'ingen@example.com', password: 'forkert-kode-1' } });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
});

test('for mange mislykkede logins låser kontoen en tid, selv med rigtig kode', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.call('POST', '/v1/register', { body: ME });
  for (let i = 0; i < 4; i++) assert.equal((await s.call('POST', '/v1/login', { body: { email: ME.email, password: 'forkert-kode-1' } })).status, 401);
  const r = await s.call('POST', '/v1/login', { body: { email: ME.email, password: ME.password } });
  assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
});

test('registrering er begrænset pr. adresse', async t => {
  const s = await boot({ LIMIT_REGISTER: '2' }); t.after(() => s.close());
  for (let i = 0; i < 2; i++) assert.equal((await s.call('POST', '/v1/register', { body: { ...ME, email: `a${i}@example.com` } })).status, 201);
  assert.equal((await s.call('POST', '/v1/register', { body: { ...ME, email: 'a9@example.com' } })).status, 429);
});

test('uden token, med forkert token og efter logout får man 401', async t => {
  const s = await boot(); t.after(() => s.close());
  assert.equal((await s.call('GET', '/v1/me')).status, 401);
  assert.equal((await s.call('GET', '/v1/me', { token: 'wws_noget' })).status, 401);
  const { body } = await s.call('POST', '/v1/register', { body: ME });
  assert.equal((await s.call('POST', '/v1/logout', { token: body.session.token })).status, 204);
  assert.equal((await s.call('GET', '/v1/me', { token: body.session.token })).status, 401);
});

test('udløbne sessioner afvises', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body } = await s.call('POST', '/v1/register', { body: ME });
  s.db.exec('UPDATE sessions SET expires_at = 1');
  assert.equal((await s.call('GET', '/v1/me', { token: body.session.token })).status, 401);
});

test('spil-token: kan hente navn og gemme sit eget spil, intet andet', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  const gt = await s.call('POST', '/v1/game-token', { token: reg.session.token, body: { game: 'white-dust' } });
  assert.equal(gt.status, 201); assert.match(gt.body.token, /^wwg_/); assert.equal(gt.body.user.email, undefined);
  const g = gt.body.token;

  const me = await s.call('GET', '/v1/me', { token: g });
  assert.equal(me.body.kind, 'game'); assert.equal(me.body.user.email, undefined); assert.equal(me.body.user.displayName, 'Linus');

  assert.equal((await s.call('PUT', '/v1/saves/white-dust', { token: g, body: { data: { xp: 5 } } })).status, 200);
  assert.equal((await s.call('PUT', '/v1/saves/complex', { token: g, body: { data: { xp: 5 } } })).status, 403);     // andet spil
  assert.equal((await s.call('PATCH', '/v1/me', { token: g, body: { displayName: 'Hacker' } })).status, 403);         // kræver rigtigt login
  assert.equal((await s.call('POST', '/v1/game-token', { token: g, body: { game: 'complex' } })).status, 403);
  assert.equal((await s.call('DELETE', '/v1/me', { token: g, body: { password: ME.password } })).status, 403);
  assert.equal((await s.call('GET', '/v1/me/export', { token: g })).status, 403);
});

test('ukendt spil afvises', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body } = await s.call('POST', '/v1/register', { body: ME });
  assert.equal((await s.call('POST', '/v1/game-token', { token: body.session.token, body: { game: 'findes-ikke' } })).status, 404);
  assert.equal((await s.call('GET', '/v1/saves/__proto__', { token: body.session.token })).status, 404);
});

test('gemte spil: tomt, gem, hent, og konflikt mellem to enheder', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  const token = reg.session.token;
  const empty = await s.call('GET', '/v1/saves/white-dust', { token });
  assert.deepEqual(empty.body, { rev: 0, updatedAt: null, data: null });

  const a = await s.call('PUT', '/v1/saves/white-dust', { token, body: { baseRev: 0, data: { xp: 100 } } });
  assert.equal(a.body.rev, 1);
  const b = await s.call('PUT', '/v1/saves/white-dust', { token, body: { baseRev: 1, data: { xp: 200 } } });
  assert.equal(b.body.rev, 2);

  const stale = await s.call('PUT', '/v1/saves/white-dust', { token, body: { baseRev: 1, data: { xp: 150 } } });
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'conflict'); assert.equal(stale.body.current.rev, 2); assert.equal(stale.body.current.data.xp, 200);

  const got = await s.call('GET', '/v1/saves/white-dust', { token });
  assert.equal(got.body.data.xp, 200);
  const forced = await s.call('PUT', '/v1/saves/white-dust', { token, body: { data: { xp: 1 } } });   // uden baseRev overskrives
  assert.equal(forced.body.rev, 3);
});

test('gemte spil: kun objekter og med en størrelsesgrænse', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  const token = reg.session.token;
  assert.equal((await s.call('PUT', '/v1/saves/white-dust', { token, body: { data: [1, 2] } })).status, 400);
  assert.equal((await s.call('PUT', '/v1/saves/white-dust', { token, body: { data: 'tekst' } })).status, 400);
  assert.equal((await s.call('PUT', '/v1/saves/white-dust', { token, raw: '{ikke json' })).status, 400);
  const big = await s.call('PUT', '/v1/saves/white-dust', { token, body: { data: { x: 'a'.repeat(300 * 1024) } } });
  assert.equal(big.status, 413);
});

test('gemte spil er adskilt mellem konti', async t => {
  const s = await boot(); t.after(() => s.close());
  const a = (await s.call('POST', '/v1/register', { body: ME })).body.session.token;
  const b = (await s.call('POST', '/v1/register', { body: { ...ME, email: 'anden@example.com', displayName: 'Anden' } })).body.session.token;
  await s.call('PUT', '/v1/saves/white-dust', { token: a, body: { data: { xp: 999 } } });
  assert.equal((await s.call('GET', '/v1/saves/white-dust', { token: b })).body.data, null);
});

test('skift navn og adgangskode', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  const t1 = reg.session.token;
  const t2 = (await s.call('POST', '/v1/login', { body: { email: ME.email, password: ME.password } })).body.session.token;
  assert.equal((await s.call('PATCH', '/v1/me', { token: t1, body: { displayName: 'Nyt Navn' } })).body.user.displayName, 'Nyt Navn');
  assert.equal((await s.call('POST', '/v1/me/password', { token: t1, body: { current: 'forkert-kode-1', next: 'ny-hemmelig-2' } })).status, 403);
  assert.equal((await s.call('POST', '/v1/me/password', { token: t1, body: { current: ME.password, next: 'ny-hemmelig-2' } })).status, 204);
  assert.equal((await s.call('GET', '/v1/me', { token: t1 })).status, 200);            // den aktive session overlever
  assert.equal((await s.call('GET', '/v1/me', { token: t2 })).status, 401);            // de andre logges ud
  assert.equal((await s.call('POST', '/v1/login', { body: { email: ME.email, password: ME.password } })).status, 401);
  assert.equal((await s.call('POST', '/v1/login', { body: { email: ME.email, password: 'ny-hemmelig-2' } })).status, 200);
});

test('slet konto fjerner alt', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  const token = reg.session.token;
  await s.call('PUT', '/v1/saves/white-dust', { token, body: { data: { xp: 1 } } });
  assert.equal((await s.call('DELETE', '/v1/me', { token, body: { password: 'forkert-kode-1' } })).status, 403);
  assert.equal((await s.call('DELETE', '/v1/me', { token, body: { password: ME.password } })).status, 204);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal((await s.call('POST', '/v1/login', { body: { email: ME.email, password: ME.password } })).status, 401);
});

test('eksport giver kontoen og alle gemte spil', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  await s.call('PUT', '/v1/saves/white-dust', { token: reg.session.token, body: { data: { xp: 7 } } });
  const r = await s.call('GET', '/v1/me/export', { token: reg.session.token });
  assert.equal(r.body.user.email, 'linus@example.com'); assert.equal(r.body.saves['white-dust'].data.xp, 7);
});

test('nulstil adgangskode med kode på mail', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });

  const unknown = await s.call('POST', '/v1/password/forgot', { body: { email: 'ingen@example.com' } });
  assert.equal(unknown.status, 202); assert.equal(s.app.mailer.outbox.length, 0);          // ingen mail, men samme svar

  assert.equal((await s.call('POST', '/v1/password/forgot', { body: { email: ME.email } })).status, 202);
  const code = /er (\d{6})\./.exec(s.app.mailer.outbox[0].text)[1];
  assert.equal(s.app.mailer.outbox[0].to, 'linus@example.com');

  const wrong = await s.call('POST', '/v1/password/reset', { body: { email: ME.email, code: code === '000000' ? '111111' : '000000', password: 'helt-ny-kode-3' } });
  assert.equal(wrong.status, 400); assert.equal(wrong.body.error.code, 'invalid_code');
  const ok = await s.call('POST', '/v1/password/reset', { body: { email: ME.email, code, password: 'helt-ny-kode-3' } });
  assert.equal(ok.status, 200);
  assert.equal((await s.call('GET', '/v1/me', { token: reg.session.token })).status, 401);   // gamle sessioner er væk
  assert.equal((await s.call('POST', '/v1/login', { body: { email: ME.email, password: 'helt-ny-kode-3' } })).status, 200);
  const again = await s.call('POST', '/v1/password/reset', { body: { email: ME.email, code, password: 'endnu-en-kode-4' } });
  assert.equal(again.status, 400);                                                           // koden kan kun bruges én gang
});

test('nulstillingskoden dør efter fem forkerte forsøg', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.call('POST', '/v1/register', { body: ME });
  await s.call('POST', '/v1/password/forgot', { body: { email: ME.email } });
  const code = /er (\d{6})\./.exec(s.app.mailer.outbox[0].text)[1];
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await s.call('POST', '/v1/password/reset', { body: { email: ME.email, code: wrong, password: 'helt-ny-kode-3' } });
  const r = await s.call('POST', '/v1/password/reset', { body: { email: ME.email, code, password: 'helt-ny-kode-3' } });
  assert.equal(r.status, 400);
});

test('nulstilling er slået fra uden mail-opsætning', async t => {
  const s = await boot({ MAIL_MODE: 'off' }); t.after(() => s.close());
  assert.equal((await s.call('GET', '/v1/health')).body.features.passwordReset, false);
  assert.equal((await s.call('POST', '/v1/password/forgot', { body: { email: ME.email } })).status, 501);
});

test('ukendt sti og forkert metode', async t => {
  const s = await boot(); t.after(() => s.close());
  assert.equal((await s.call('GET', '/v1/findes-ikke')).status, 404);
  assert.equal((await s.call('GET', '/v1/login')).status, 405);
});

test('forespørgsler over grænsen afvises', async t => {
  const s = await boot(); t.after(() => s.close());
  const r = await s.call('POST', '/v1/register', { raw: JSON.stringify({ email: 'a@b.dk', pad: 'x'.repeat(40000) }), body: undefined });
  assert.equal(r.status, 413);
});

test('rangliste: kun et spil-token kan melde en tid, og tiden kan ikke være længere end sessionen', async t => {
  const s = await boot(); t.after(() => s.close());
  const { body: reg } = await s.call('POST', '/v1/register', { body: ME });
  const gt = (await s.call('POST', '/v1/game-token', { token: reg.session.token, body: { game: 'flugt' } })).body.token;
  assert.equal((await s.call('POST', '/v1/scores/flugt', { token: reg.session.token, body: { ms: 1000 } })).status, 403);      // launcherens login
  assert.equal((await s.call('POST', '/v1/scores/flugt', { body: { ms: 1000 } })).status, 401);
  assert.equal((await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: 1.5 } })).status, 400);
  assert.equal((await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: -4 } })).status, 400);
  assert.equal((await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: '9' } })).status, 400);
  assert.equal((await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: 3600e3 } })).status, 400);                      // tokenet er et sekund gammelt
  const ok = await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: 800 } });
  assert.equal(ok.status, 200); assert.equal(ok.body.rank, 1); assert.equal(ok.body.improved, true); assert.equal(ok.body.ms, 800);
  // et gammelt token må gerne melde en lang tid
  s.db.prepare('UPDATE sessions SET created_at = created_at - 7200000 WHERE kind = ?').run('game');
  assert.equal((await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: 3600e3 } })).body.ms, 3600e3);
});

test('rangliste: bedste tid tæller, sortering, egen plads og kun spil med rangliste', async t => {
  const s = await boot(); t.after(() => s.close());
  const mk = async (email, name, ms) => {
    const { body: reg } = await s.call('POST', '/v1/register', { body: { email, password: 'hemmelig-kode-1', displayName: name } });
    const gt = (await s.call('POST', '/v1/game-token', { token: reg.session.token, body: { game: 'flugt' } })).body.token;
    s.db.prepare('UPDATE sessions SET created_at = created_at - 7200000 WHERE kind = ?').run('game');
    for (const m of ms) await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: m } });
    return gt;
  };
  const a = await mk('a@example.com', 'Anna', [30000, 90000, 45000]);
  await mk('b@example.com', 'Bo', [120000]);
  const c = await mk('c@example.com', 'Cæsar', [10000]);
  const open = await s.call('GET', '/v1/leaderboard/flugt');
  assert.equal(open.status, 200); assert.equal(open.body.total, 3); assert.equal(open.body.me, null);
  assert.deepEqual(open.body.top.map(r => [r.rank, r.name, r.ms]), [[1, 'Bo', 120000], [2, 'Anna', 90000], [3, 'Cæsar', 10000]]);
  assert.ok(open.body.top.every(r => r.me === false && Object.keys(r).sort().join() === 'at,me,ms,name,rank'));      // ingen id'er eller e-mails
  const mine = await s.call('GET', '/v1/leaderboard/flugt?limit=2', { token: c });
  assert.equal(mine.body.top.length, 2); assert.equal(mine.body.me.rank, 3); assert.equal(mine.body.me.ms, 10000);
  assert.equal((await s.call('GET', '/v1/leaderboard/flugt', { token: a })).body.top.find(r => r.me).name, 'Anna');
  assert.equal((await s.call('GET', '/v1/leaderboard/flugt', { token: 'wwg_forkert' })).status, 200);             // ugyldigt token vælter ikke listen
  const worse = await s.call('POST', '/v1/scores/flugt', { token: a, body: { ms: 1000 } });
  assert.equal(worse.body.improved, false); assert.equal(worse.body.ms, 90000); assert.equal(worse.body.runs, 4);
  assert.equal((await s.call('GET', '/v1/leaderboard/white-dust')).status, 404);                                     // spil uden rangliste
  assert.equal((await s.call('GET', '/v1/leaderboard/__proto__')).status, 404);
});

test('rangliste: ens tid, den der kom først står øverst. Sletning af konto fjerner tiden', async t => {
  const s = await boot(); t.after(() => s.close());
  const mk = async (email, name, at) => {
    const { body: reg } = await s.call('POST', '/v1/register', { body: { email, password: 'hemmelig-kode-1', displayName: name } });
    const gt = (await s.call('POST', '/v1/game-token', { token: reg.session.token, body: { game: 'flugt' } })).body.token;
    s.db.prepare('UPDATE sessions SET created_at = created_at - 7200000 WHERE kind = ?').run('game');
    await s.call('POST', '/v1/scores/flugt', { token: gt, body: { ms: 50000 } });
    s.db.prepare('UPDATE scores SET updated_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(at, email);
    return reg.session.token;
  };
  await mk('late@example.com', 'Sen', 2000);
  const early = await mk('early@example.com', 'Tidlig', 1000);
  assert.deepEqual((await s.call('GET', '/v1/leaderboard/flugt')).body.top.map(r => r.name), ['Tidlig', 'Sen']);
  assert.equal((await s.call('DELETE', '/v1/me', { token: early, body: { password: 'hemmelig-kode-1' } })).status, 204);
  assert.deepEqual((await s.call('GET', '/v1/leaderboard/flugt')).body.top.map(r => r.name), ['Sen']);
});
