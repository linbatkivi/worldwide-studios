'use strict';
// Installationen af spil: henter kun det der er ændret, tjekker fingeraftryk og lader ingen sti slippe ud af mappen.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const web = require('../src/lib/installer-web');
const { safeJoin } = require('../src/lib/util');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ww-test-'));

// en lille server der spiller GitHub: /raw/<fil> og /lfs/<sha>.bin
async function origin(files) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(req.url);
    const m = /^\/raw\/(.+)$/.exec(decodeURIComponent(req.url)) || /^\/lfs\/([0-9a-f]+)\.bin$/.exec(req.url);
    const body = m && (files[m[1]] !== undefined ? files[m[1]] : Object.values(files).find(b => sha(b) === m[1]));
    if (body === undefined) { res.writeHead(404); return res.end(); }
    res.writeHead(200); res.end(body);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  return { base, hits, close: () => new Promise(r => srv.close(r)), manifest: (game, lfs = []) => ({
    game, commit: 'abc', raw: base + '/raw/', lfs: base + '/lfs/',
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, lfs.includes(k) ? [sha(v), v.length, 1] : [sha(v), v.length]]))
  }) };
}
function manifestServer(getManifest) {
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(getManifest())); });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + srv.address().port + '/m.json', close: () => new Promise(x => srv.close(x)) })));
}

test('første installation henter alt, også store filer fra LFS-stedet', async t => {
  const files = { 'server.js': Buffer.from('console.log(1)'), 'shared/wd.js': Buffer.from('x'), 'public/index.html': Buffer.from('<html>'), 'public/assets/map.bin': Buffer.alloc(5000, 7) };
  const o = await origin(files); t.after(o.close);
  const m = o.manifest('v1', ['public/assets/map.bin']);
  const ms = await manifestServer(() => m); t.after(ms.close);
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const plan = await web.plan(ms.url, dir);
  assert.equal(plan.need.length, 4); assert.equal(plan.upToDate, false);
  const seen = [];
  await web.apply(plan, dir, { onProgress: p => seen.push(p) });
  assert.equal(fs.readFileSync(path.join(dir, 'files/public/index.html'), 'utf8'), '<html>');
  assert.equal(fs.readFileSync(path.join(dir, 'files/public/assets/map.bin')).length, 5000);
  assert.ok(o.hits.some(h => h.startsWith('/lfs/')), 'LFS-filen skal hentes fra release-stedet');
  assert.ok(seen.some(p => p.phase === 'download' && p.done > 0) && seen.at(-1).phase === 'finalize');
  assert.equal(fs.existsSync(path.join(dir, '.stage')), false);
  assert.equal(web.readInstalled(dir).game, 'v1');
  assert.equal((await web.plan(ms.url, dir)).upToDate, true);
});

test('en opdatering henter kun de ændrede filer og fjerner dem der er væk', async t => {
  const files = { 'server.js': Buffer.from('a'), 'public/a.js': Buffer.from('one'), 'public/b.js': Buffer.from('two') };
  const o = await origin(files); t.after(o.close);
  let man = o.manifest('v1');
  const ms = await manifestServer(() => man); t.after(ms.close);
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await web.apply(await web.plan(ms.url, dir), dir);

  files['public/a.js'] = Buffer.from('one changed'); delete files['public/b.js']; files['public/c.js'] = Buffer.from('three');
  man = o.manifest('v2'); o.hits.length = 0;
  const plan = await web.plan(ms.url, dir);
  assert.deepEqual(plan.need.sort(), ['public/a.js', 'public/c.js']);
  await web.apply(plan, dir);
  assert.equal(o.hits.length, 2, 'kun to filer skal hentes');
  assert.equal(fs.readFileSync(path.join(dir, 'files/public/a.js'), 'utf8'), 'one changed');
  assert.equal(fs.existsSync(path.join(dir, 'files/public/b.js')), false);
  assert.equal(web.readInstalled(dir).game, 'v2');
});

test('en fil med forkert fingeraftryk afvises, og intet er installeret bagefter', async t => {
  const files = { 'server.js': Buffer.from('ok') };
  const o = await origin(files); t.after(o.close);
  const m = o.manifest('v1'); m.files['server.js'][0] = sha('noget andet');
  const ms = await manifestServer(() => m); t.after(ms.close);
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plan = await web.plan(ms.url, dir);
  await assert.rejects(() => web.apply(plan, dir, {}), /fingeraftryk/);
  assert.equal(web.readInstalled(dir), null);
  assert.equal(fs.existsSync(path.join(dir, 'files/server.js')), false);
});

test('et manifest med stier der prøver at slippe ud, eller ukendte filer, afvises', async () => {
  const bad = rel => ({ game: 'x', raw: 'http://x/', files: { [rel]: [sha('a'), 1] } });
  for (const rel of ['../../etc/passwd', 'public/../../x', '/etc/passwd', 'evil.sh', 'shared/sub/x.js', 'node_modules/ws/index.js']) assert.throws(() => web.validate(bad(rel)), /ukendt fil|ugyldig/, rel);
  assert.doesNotThrow(() => web.validate(bad('public/js/app.js')));
});

test('safeJoin holder sig inden for mappen', () => {
  const base = path.resolve('/tmp/ww-base');
  assert.equal(safeJoin(base, 'a/b.txt'), path.join(base, 'a', 'b.txt'));
  for (const rel of ['../x', 'a/../../x', '/abs', 'C:\\x', '']) assert.throws(() => safeJoin(base, rel), undefined, rel);
});

test('afbrudt installation efterlader ingen halve filer', async t => {
  const files = { 'server.js': Buffer.alloc(200000, 1) };
  const o = await origin(files); t.after(o.close);
  const ms = await manifestServer(() => o.manifest('v1')); t.after(ms.close);
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ctl = new AbortController(); ctl.abort();
  const plan = await web.plan(ms.url, dir);
  await assert.rejects(() => web.apply(plan, dir, { signal: ctl.signal }), e => e.name === 'AbortError');
  assert.equal(web.readInstalled(dir), null);
});

test('reparér: ødelagte filer findes og hentes igen', async t => {
  const files = { 'server.js': Buffer.from('rigtig'), 'public/x.js': Buffer.from('fin') };
  const o = await origin(files); t.after(o.close);
  const ms = await manifestServer(() => o.manifest('v1')); t.after(ms.close);
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await web.apply(await web.plan(ms.url, dir), dir);
  assert.equal((await web.verify(dir)).ok, true);
  fs.writeFileSync(path.join(dir, 'files/public/x.js'), 'ødelagt');
  const v = await web.verify(dir); assert.deepEqual(v.bad, ['public/x.js']);
  web.invalidate(dir, v.bad);
  const plan = await web.plan(ms.url, dir); assert.deepEqual(plan.need, ['public/x.js']);
  await web.apply(plan, dir);
  assert.equal((await web.verify(dir)).ok, true);
});
