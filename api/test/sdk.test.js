'use strict';
// Kontrakten mellem SDK'et (bruges af hjemmeside, launcher og spil) og serveren.
const test = require('node:test');
const assert = require('node:assert/strict');
const WW = require('../../sdk/js/worldwide.js');
const { load } = require('../src/config');
const { createServer } = require('../src/index');

async function boot() {
  const s = createServer(load({ DB_PATH: ':memory:', SCRYPT_COST: '10', MAIL_MODE: 'console' }), { quiet: true });
  await new Promise(r => s.server.listen(0, '127.0.0.1', r));
  const ww = WW.createClient({ api: 'http://127.0.0.1:' + s.server.address().port });
  return { ...s, ww };
}
const ME = { email: 'sdk@example.com', password: 'sdk-kode-1234', displayName: 'SdkTest' };

test('registrer, log ind, skift navn, log ud', async t => {
  const s = await boot(); t.after(() => s.close());
  const r = await s.ww.register(ME);
  assert.equal(r.user.displayName, 'SdkTest'); assert.ok(s.ww.getToken());
  assert.equal((await s.ww.rename('Nyt Navn')).user.displayName, 'Nyt Navn');
  await s.ww.logout(); assert.equal(s.ww.getToken(), null);
  await assert.rejects(() => s.ww.me(), e => e.code === 'unauthorized' && e.status === 401);
  const l = await s.ww.login({ email: ME.email, password: ME.password });
  assert.equal(l.user.displayName, 'Nyt Navn');
});

test('fejl får kode og tekst på dansk og engelsk', async t => {
  const s = await boot(); t.after(() => s.close());
  await assert.rejects(() => s.ww.login({ email: ME.email, password: 'forkert-kode' }), e => {
    assert.ok(e instanceof WW.WWError); assert.equal(e.code, 'invalid_credentials');
    assert.equal(WW.explain(e, 'da'), 'Forkert e-mail eller adgangskode.'); assert.equal(WW.explain(e, 'en'), 'Wrong email or password.');
    return true;
  });
});

test('ingen forbindelse giver koden network, ikke et nedbrud', async () => {
  const ww = WW.createClient({ api: 'http://127.0.0.1:1', timeout: 500 });
  await assert.rejects(() => ww.health(), e => e.code === 'network' || e.code === 'timeout');
});

test('gameSync: henter, samler skrivninger og løser konflikter', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.ww.register(ME);
  const gt = await s.ww.gameToken('white-dust');
  const merge = (server, mine) => ({ xp: Math.max(server.xp, mine.xp), coins: (server.coins || 0) + (mine.coins || 0) });

  const a = s.ww.gameSync({ game: 'white-dust', token: gt.token, merge, delay: 20 });
  assert.equal((await a.pull()).data, null);
  a.push({ xp: 10 }); a.push({ xp: 20 });                         // to ændringer bliver til ét kald
  await a.flush();
  assert.equal(a.rev, 1);

  // en anden enhed gemmer imellem
  const gt2 = await s.ww.gameToken('white-dust');
  const b = s.ww.gameSync({ game: 'white-dust', token: gt2.token, merge, delay: 20 });
  await b.pull(); b.push({ xp: 50, coins: 5 }); await b.flush();

  a.push({ xp: 30, coins: 7 }); await a.flush();                  // a bygger på rev 1, serveren er på 2 → merge
  const final = await s.ww.getSave('white-dust');
  assert.equal(final.data.xp, 50); assert.equal(final.data.coins, 12); assert.equal(final.rev, 3);
});

test('gameSync stopper stille, når tokenet er udløbet', async t => {
  const s = await boot(); t.after(() => s.close());
  await s.ww.register(ME);
  const gt = await s.ww.gameToken('white-dust');
  const a = s.ww.gameSync({ game: 'white-dust', token: gt.token, delay: 20 });
  await a.pull();
  s.db.exec('DELETE FROM sessions WHERE kind = \'game\'');
  a.push({ xp: 1 });
  await assert.rejects(() => a.flush(), e => e.status === 401);
  assert.equal(a.dead, true);
});
