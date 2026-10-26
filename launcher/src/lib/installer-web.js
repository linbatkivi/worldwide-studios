'use strict';
// Installation af spil der leveres som et manifest med enkeltfiler (White Dust).
// Manifest: { game, commit, raw, lfs, files: { "public/js/app.js": [sha256, bytes, lfs?] } }
// Kun filer med et nyt fingeraftryk hentes. Alt hentes først til .stage og flyttes ind til sidst, så et afbrudt
// download aldrig efterlader et spil i stykker.
const fs = require('fs');
const path = require('path');
const { getJson, downloadFile } = require('./net');
const { readJson, writeJson, safeJoin, sha256File, freeBytes, rmrf, abortError, speedMeter } = require('./util');

const ALLOWED = /^(public\/|shared\/[^/]+\.js$|server\.js$)/;       // det er alt White Dust har brug for

function validate(man) {
  if (!man || typeof man.files !== 'object' || !man.game || !man.raw) throw new Error('manifestet er ugyldigt');
  for (const [rel, e] of Object.entries(man.files)) {
    if (!ALLOWED.test(rel) || rel.includes('..')) throw new Error('manifestet peger på en ukendt fil: ' + rel);
    if (!Array.isArray(e) || !/^[0-9a-f]{64}$/.test(e[0]) || !Number.isFinite(e[1])) throw new Error('manifestet har en ugyldig post for ' + rel);
  }
  return man;
}

const urlOf = (man, rel, e) => e[2] ? man.lfs + e[0] + '.bin' : man.raw + rel.split('/').map(encodeURIComponent).join('/');

function readInstalled(dir) { return readJson(path.join(dir, 'installed.json')); }

// Hvad skal hentes for at komme fra det installerede til manifestet?
async function plan(manifestUrl, dir, { signal } = {}) {
  const man = validate(await getJson(manifestUrl + (manifestUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal }));
  const inst = readInstalled(dir), filesDir = path.join(dir, 'files');
  const need = []; let bytes = 0, total = 0;
  for (const [rel, e] of Object.entries(man.files)) {
    total += e[1];
    const cur = inst && inst.files && inst.files[rel];
    let ok = false;
    if (cur && cur[0] === e[0]) { try { ok = fs.statSync(path.join(filesDir, rel)).size === e[1]; } catch (er) { ok = false; } }
    if (!ok) { need.push(rel); bytes += e[1]; }
  }
  return { man, need, bytes, total, upToDate: !!inst && inst.game === man.game && need.length === 0 };
}

async function apply(p, dir, { onProgress, signal, workers = 6 } = {}) {
  const { man, need } = p;
  const filesDir = path.join(dir, 'files'), stage = path.join(dir, '.stage');
  const free = await freeBytes(dir);
  if (free < p.bytes * 1.1 + 50e6) throw Object.assign(new Error('Der er ikke plads nok på disken'), { code: 'no_space', needed: p.bytes });
  fs.mkdirSync(stage, { recursive: true });

  let done = 0, filesDone = 0;
  const meter = speedMeter();
  const emit = () => onProgress && onProgress({ phase: 'download', done: Math.max(0, done), total: p.bytes, speed: meter.perSecond(), files: { done: filesDone, total: need.length } });
  const bump = n => { done += n; if (n > 0) meter.add(n); emit(); };
  emit();

  const queue = need.slice(); let failure = null;
  async function worker() {
    while (queue.length && !failure) {
      if (signal && signal.aborted) throw abortError();
      const rel = queue.shift(), e = man.files[rel], dst = safeJoin(stage, rel);
      try {
        // allerede hentet ved et afbrudt forsøg?
        if (fs.existsSync(dst) && fs.statSync(dst).size === e[1] && await sha256File(dst) === e[0]) { bump(e[1]); filesDone++; continue; }
        await downloadFile(urlOf(man, rel, e), dst, { sha256: e[0], size: e[1], onBytes: bump, signal });
        filesDone++; emit();
      } catch (er) { failure = er; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, Math.max(1, need.length)) }, worker));
  if (signal && signal.aborted) throw abortError();
  if (failure) throw failure;

  // Alt er hentet. Nu flyttes filerne på plads, og det der ikke længere hører til, fjernes.
  onProgress && onProgress({ phase: 'finalize', done: p.bytes, total: p.bytes, speed: 0, files: { done: need.length, total: need.length } });
  for (const rel of need) {
    const from = safeJoin(stage, rel), to = safeJoin(filesDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }
  const keep = new Set(Object.keys(man.files));
  (function clean(d, prefix) {
    for (const ent of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      const rel = prefix + ent.name, full = path.join(d, ent.name);
      if (ent.isDirectory()) { clean(full, rel + '/'); try { fs.rmdirSync(full); } catch (er) {} }
      else if (!keep.has(rel)) fs.rmSync(full, { force: true });
    }
  })(filesDir, '');
  rmrf(stage);
  const inst = { game: man.game, commit: man.commit || null, files: man.files, at: new Date().toISOString() };
  writeJson(path.join(dir, 'installed.json'), inst);
  return inst;
}

// Tjek alle filer mod fingeraftrykket. Bruges af "Reparér".
async function verify(dir) {
  const inst = readInstalled(dir); if (!inst) return { ok: false, bad: ['(intet installeret)'] };
  const bad = [];
  for (const [rel, e] of Object.entries(inst.files)) {
    const f = path.join(dir, 'files', rel);
    try { if (fs.statSync(f).size !== e[1] || await sha256File(f) !== e[0]) bad.push(rel); } catch (er) { bad.push(rel); }
  }
  return { ok: !bad.length, bad };
}

function invalidate(dir, rels) {          // fjerner fingeraftrykket for ødelagte filer, så næste opdatering henter dem igen
  const inst = readInstalled(dir); if (!inst) return;
  for (const r of rels) { delete inst.files[r]; try { fs.rmSync(path.join(dir, 'files', r), { force: true }); } catch (e) {} }
  inst.game = null; writeJson(path.join(dir, 'installed.json'), inst);
}

module.exports = { plan, apply, verify, invalidate, readInstalled, validate, urlOf };
