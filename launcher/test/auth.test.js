'use strict';
// Launcherens login mod den rigtige konto-server (kørt i samme proces, med en database i hukommelsen).
const test = require('node:test');
const assert = require('node:assert/strict');
const WW = require('../../sdk/js/worldwide.js');
const { Auth } = require('../src/lib/auth');
const { load } = require('../../api/src/config');
const { createServer } = require('../../api/src/index');

async function boot() {
  const s = createServer(load({ DB_PATH: ':memory:', SCRYPT_COST: '10', MAIL_MODE: 'off' }), { quiet: true });
  await new Promise(r => s.server.listen(0, '127.0.0.1', r));
  return { ...s, api: 'http://127.0.0.1:' + s.server.address().port };
}
// nøgleringen: en almindelig Map, så testen kan se hvad der bliver gemt
const vault = () => { const m = new Map(); return { m, encrypted: () => true, get: async k => m.get(k) || null, set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, delete: async k => { m.delete(k); } }; };
const make = (api, secure) => new Auth({ WW, api, secure, device: 'test' });
const ME = ['launcher@example.com', 'launcher-kode-1', 'Launcher'];

test('opret konto gemmer login, og et nyt start finder det igen', async t => {
  const s = await boot(); t.after(() => s.close());
  const secure = vault();
  const a = make(s.api, secure);
  const st = await a.register(...ME);
  assert.equal(st.status, 'signed-in'); assert.equal(st.user.displayName, 'Launcher');
  assert.match(secure.m.get('session').token, /^wws_/);

  const b = make(s.api, secure);                      // "launcheren startes igen"
  const again = await b.restore();
  assert.equal(again.status, 'signed-in'); assert.equal(again.user.email, 'launcher@example.com'); assert.equal(again.offline, false);
});

test('forkert adgangskode logger ikke ind', async t => {
  const s = await boot(); t.after(() => s.close());
  const a = make(s.api, vault()); await a.register(...ME); await a.logout();
  await assert.rejects(() => a.login(ME[0], 'forkert-kode-1'), e => e.code === 'invalid_credentials');
  assert.equal(a.state.status, 'signed-out');
  assert.equal((await a.login(ME[0], ME[1])).status, 'signed-in');
});

test('et tilbagekaldt login giver login-skærmen og sletter det gemte', async t => {
  const s = await boot(); t.after(() => s.close());
  const secure = vault(); await make(s.api, secure).register(...ME);
  s.db.exec('DELETE FROM sessions');
  const b = make(s.api, secure);
  assert.equal((await b.restore()).status, 'signed-out');
  assert.equal(secure.m.has('session'), false);
});

test('uden forbindelse åbnes launcheren stadig med det gemte login', async t => {
  const s = await boot();
  const secure = vault(); await make(s.api, secure).register(...ME);
  await s.close();                                    // serveren er væk
  const b = make(s.api, secure);
  const st = await b.restore();
  assert.equal(st.status, 'signed-in'); assert.equal(st.offline, true); assert.equal(st.user.displayName, 'Launcher');
  const acc = await b.gameAccount('white-dust');      // spillet kan stadig startes, uden token
  assert.equal(acc.offline, true); assert.equal(acc.token, null); assert.equal(acc.user.displayName, 'Launcher');
});

test('spil-tokenet gælder kun ét spil og viser ikke e-mailen', async t => {
  const s = await boot(); t.after(() => s.close());
  const a = make(s.api, vault()); await a.register(...ME);
  const acc = await a.gameAccount('white-dust');
  assert.match(acc.token, /^wwg_/); assert.equal(acc.offline, false); assert.equal(acc.user.email, undefined);
  const game = WW.createClient({ api: s.api, token: acc.token });
  assert.equal((await game.me()).user.displayName, 'Launcher');
  await assert.rejects(() => game.getSave('complex'), e => e.status === 403);
  await assert.rejects(() => game.rename('Hacker'), e => e.status === 403);
});

test('ikke logget ind giver ingen spilkonto', async t => {
  const s = await boot(); t.after(() => s.close());
  assert.equal(await make(s.api, vault()).gameAccount('white-dust'), null);
});

test('skift navn og log ud rydder op', async t => {
  const s = await boot(); t.after(() => s.close());
  const secure = vault(); const a = make(s.api, secure); await a.register(...ME);
  await a.rename('Nyt Navn');
  assert.equal(secure.m.get('session').user.displayName, 'Nyt Navn');
  await a.logout();
  assert.equal(a.state.status, 'signed-out'); assert.equal(secure.m.has('session'), false);
});

test('slet konto logger ud og fjerner den på serveren', async t => {
  const s = await boot(); t.after(() => s.close());
  const a = make(s.api, vault()); await a.register(...ME);
  await assert.rejects(() => a.remove('forkert-kode-1'), e => e.code === 'invalid_credentials');
  await a.remove(ME[1]);
  assert.equal(a.state.status, 'signed-out');
  await assert.rejects(() => make(s.api, vault()).login(...ME.slice(0, 2)), e => e.code === 'invalid_credentials');
});
