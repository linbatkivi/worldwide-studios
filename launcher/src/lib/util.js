'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// JSON-fil der skrives atomisk: først en midlertidig fil, så omdøbes den. Et nedbrud midt i giver aldrig en halv fil.
function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// Sti fra et manifest eller en zip må aldrig komme ud af mappen den hører til.
function safeJoin(base, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error('ugyldig sti: ' + rel);
  const full = path.resolve(base, ...rel.split('/'));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('sti uden for mappen: ' + rel);
  return full;
}

const sha256File = file => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

async function freeBytes(dir) {
  try {
    let d = dir;
    while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
    const s = await fs.promises.statfs(d);
    return s.bavail * s.bsize;
  } catch (e) { return Infinity; }
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(abortError()); }, { once: true });
});
function abortError() { const e = new Error('afbrudt'); e.name = 'AbortError'; return e; }

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function dirSize(dir) {
  let n = 0;
  const walk = d => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else try { n += fs.statSync(p).size; } catch (er) {} } };
  walk(dir); return n;
}

// Gennemsnit over de seneste sekunder, så hastigheden ikke hopper.
function speedMeter(windowMs = 3000) {
  const samples = [];
  return {
    add(bytes) { const now = Date.now(); samples.push([now, bytes]); while (samples.length && now - samples[0][0] > windowMs) samples.shift(); },
    perSecond() { if (samples.length < 2) return 0; const span = (samples[samples.length - 1][0] - samples[0][0]) / 1000; return span > 0 ? samples.reduce((a, s) => a + s[1], 0) / span : 0; }
  };
}

module.exports = { readJson, writeJson, safeJoin, sha256File, freeBytes, sleep, abortError, rmrf, dirSize, speedMeter };
