'use strict';
// Spilstyringen: status, installation, start, opdatering og afinstallation, med falske runtimes i stedet for rigtige spil.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { GameManager } = require('../src/lib/games');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ww-gm-'));

async function origin(files, game) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url);
    if (u.startsWith('/manifest.json')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(manifest())); }
    const rel = u.replace(/^\/raw\//, '');
    if (files[rel] === undefined) { res.writeHead(404); return res.end(); }
    res.writeHead(200); res.end(files[rel]);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const manifest = () => ({ game: game.v, commit: 'c', raw: base + '/raw/', lfs: base + '/lfs/', files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [sha(v), v.length]])) });
  return { url: base + '/manifest.json', close: () => new Promise(r => srv.close(r)) };
}

function setup({ games, account = { api: 'http://x', token: 'wwg_t', offline: false, user: { id: 'u_1', displayName: 'Tester' } }, settings = {}, spawnImpl } = {}) {
  const dir = tmp();
  const catalog = { get: () => ({ games }), game: id => games.find(g => g.id === id) || null };
  const state = { installs: {}, stats: {}, settings: { autoUpdate: false, gamesDir: null, dev: { enabled: false, links: {}, godot: '' }, ...settings } };
  const store = { get: () => state, save() {} };
  const launches = [];
  const runtime = { async launch(o) { launches.push(o); const h = { stop: () => o.onExit('stopped') }; return h; } };
  const auth = { state: { status: 'signed-in' }, gameAccount: async () => account };
  const gm = new GameManager({ catalog, auth, store, defaultDir: dir, appVersion: '9.9.9', runtimes: { 'white-dust': runtime }, spawnImpl });
  return { gm, dir, launches, state, runtime };
}
const WEB = (url) => ({ id: 'white-dust', name: 'WD', package: { kind: 'web-manifest', runtime: 'white-dust', manifest: url } });
const waitFor = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 15)); } throw new Error('tidsfrist'); };

test('et web-spil: ikke installeret → installerer → klar → kører → klar igen med spilletid', async t => {
  const files = { 'server.js': Buffer.from('1'), 'public/index.html': Buffer.from('<html>') };
  const v = { v: 'v1' }; const o = await origin(files, v); t.after(o.close);
  const { gm, dir, launches } = setup({ games: [WEB(o.url)] }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(gm.entry('white-dust').status, 'not-installed');
  const events = []; gm.on('state', e => events.push(e.status));
  await gm.install('white-dust');
  const e = gm.entry('white-dust');
  assert.equal(e.status, 'ready'); assert.equal(e.version, 'v1'); assert.ok(e.size > 0);
  assert.ok(events.includes('installing'));

  await gm.play('white-dust');
  assert.equal(gm.entry('white-dust').status, 'running');
  const call = launches[0];
  assert.equal(call.account.token, 'wwg_t'); assert.equal(call.version, 'v1'); assert.equal(call.appVersion, '9.9.9');
  assert.equal(call.root, path.join(dir, 'white-dust', 'files'));
  assert.equal(call.moduleLink, path.join(dir, 'white-dust', 'node_modules'));
  await gm.play('white-dust'); assert.equal(launches.length, 1, 'to starter må ikke ske');

  call.onExit('closed');
  const after = gm.entry('white-dust');
  assert.equal(after.status, 'ready'); assert.ok(after.lastPlayed > 0);
});

test('en nyere udgave vises som opdatering, og afinstallation virker først når spillet er lukket', async t => {
  const files = { 'server.js': Buffer.from('1') };
  const v = { v: 'v1' }; const o = await origin(files, v); t.after(o.close);
  const { gm, dir, launches } = setup({ games: [WEB(o.url)] }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await gm.install('white-dust');

  v.v = 'v2'; files['server.js'] = Buffer.from('2');
  await gm.checkUpdates();
  let e = gm.entry('white-dust'); assert.equal(e.status, 'update'); assert.equal(e.update.version, 'v2');

  await gm.install('white-dust');
  e = gm.entry('white-dust'); assert.equal(e.status, 'ready'); assert.equal(e.version, 'v2'); assert.equal(e.update, null);

  await gm.play('white-dust');
  await assert.rejects(() => gm.uninstall('white-dust'), /i gang/);
  launches[0].onExit('closed');
  await gm.uninstall('white-dust');
  assert.equal(gm.entry('white-dust').status, 'not-installed'); assert.equal(fs.existsSync(path.join(dir, 'white-dust')), false);
});

test('automatisk opdatering henter den nye udgave uden at man trykker', async t => {
  const files = { 'server.js': Buffer.from('1') };
  const v = { v: 'v1' }; const o = await origin(files, v); t.after(o.close);
  const { gm, dir } = setup({ games: [WEB(o.url)], settings: { autoUpdate: true } }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await gm.install('white-dust');
  v.v = 'v2'; files['server.js'] = Buffer.from('2');
  await gm.checkUpdates();
  await waitFor(() => gm.entry('white-dust').version === 'v2' && gm.entry('white-dust').status === 'ready');
});

test('en fejl under installation vises, og et afbrudt forsøg gør ikke', async t => {
  const files = { 'server.js': Buffer.from('1') };
  const v = { v: 'v1' }; const o = await origin(files, v);
  const { gm, dir } = setup({ games: [WEB(o.url)] }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await o.close();                                     // serveren er væk
  await gm.install('white-dust');
  const e = gm.entry('white-dust'); assert.equal(e.status, 'not-installed'); assert.ok(e.error && e.error.message);
  assert.equal(fs.existsSync(path.join(dir, 'white-dust')), false, 'ingen halv installation');
});

test('et native spil uden build til maskinen kan ikke installeres', () => {
  const games = [{ id: 'complex', name: 'Complex', package: { kind: 'native', version: null, builds: {} } }];
  const { gm, dir } = setup({ games }); fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(gm.entry('complex').status, 'unavailable');
  return assert.rejects(() => gm.install('complex'), e => e.code === 'no_build');
});

test('et native spil startes med kontoen i miljøvariabler', async t => {
  const plat = { darwin: 'darwin', win32: 'win32-x64', linux: 'linux-x64' }[process.platform];
  const exec = process.platform === 'win32' ? 'Complex.exe' : 'Complex.bin';
  const games = [{ id: 'complex', name: 'Complex', package: { kind: 'native', version: '0.1.0', builds: { [plat]: { url: 'http://x/c.zip', sha256: 'a'.repeat(64), size: 1, exec } } } }];
  const spawned = [];
  const spawnImpl = (cmd, args, opts) => { const c = new EventEmitter(); c.kill = () => c.emit('exit', 0); c.pid = 4242; spawned.push({ cmd, args, opts, c }); return c; };
  const { gm, dir, state } = setup({ games, spawnImpl }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // en færdig installation lægges på plads
  const idir = path.join(dir, 'complex'); fs.mkdirSync(path.join(idir, '0.1.0'), { recursive: true });
  fs.writeFileSync(path.join(idir, '0.1.0', exec), 'x'); fs.writeFileSync(path.join(idir, 'installed.json'), JSON.stringify({ version: '0.1.0', exec, size: 1 }));
  state.installs.complex = { dir: idir };

  assert.equal(gm.entry('complex').status, 'ready');
  await gm.play('complex');
  const s = spawned[0];
  assert.equal(s.cmd, path.join(idir, '0.1.0', exec));
  assert.equal(s.opts.env.WW_TOKEN, 'wwg_t'); assert.equal(s.opts.env.WW_USER_NAME, 'Tester'); assert.equal(s.opts.env.WW_USER_ID, 'u_1');
  assert.equal(s.opts.env.WW_API, 'http://x'); assert.equal(s.opts.env.WW_GAME, 'complex');
  assert.equal(gm.entry('complex').status, 'running');
  s.c.emit('exit', 0);
  assert.equal(gm.entry('complex').status, 'ready');
});

test('udviklertilstand starter spillet fra projektmappen', async t => {
  const games = [{ id: 'complex', name: 'Complex', package: { kind: 'native', version: null, builds: {} } }];
  const spawned = [];
  const spawnImpl = (cmd, args, opts) => { const c = new EventEmitter(); c.kill = () => {}; spawned.push({ cmd, args, opts }); return c; };
  const { gm, dir } = setup({ games, spawnImpl, settings: { dev: { enabled: true, links: { complex: '/proj/Complex/game' }, godot: '/opt/godot' } } });
  fs.rmSync(dir, { recursive: true, force: true });
  const e = gm.entry('complex'); assert.equal(e.dev, true); assert.equal(e.status, 'ready'); assert.equal(e.version, 'dev');
  await gm.play('complex');
  assert.equal(spawned[0].cmd, '/opt/godot'); assert.deepEqual(spawned[0].args, ['--path', '/proj/Complex/game']);
});

test('uden login startes intet', async t => {
  const files = { 'server.js': Buffer.from('1') };
  const o = await origin(files, { v: 'v1' }); t.after(o.close);
  const { gm, dir } = setup({ games: [WEB(o.url)], account: null }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await gm.install('white-dust');
  gm.auth.state = { status: 'signed-out' };
  await assert.rejects(() => gm.play('white-dust'), e => e.code === 'unauthorized');
  assert.equal(gm.entry('white-dust').status, 'ready');
});

test('Spil opdaterer først, hvis der er en nyere udgave, og starter så den nye', async t => {
  const files = { 'server.js': Buffer.from('1') };
  const v = { v: 'v1' }; const o = await origin(files, v); t.after(o.close);
  const { gm, dir, launches } = setup({ games: [WEB(o.url)] }); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await gm.install('white-dust');
  v.v = 'v2'; files['server.js'] = Buffer.from('2');          // udgivet, mens launcheren var åben, uden tjek imellem
  await gm.play('white-dust');
  assert.equal(launches.length, 1); assert.equal(launches[0].version, 'v2');
});
