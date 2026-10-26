'use strict';
const crypto = require('crypto');

// ---- adgangskoder: scrypt med unikt salt ------------------------------------------------------------------------
// Format: scrypt$<log2 N>$<r>$<p>$<salt b64>$<hash b64>. Parametrene ligger i hashen, så de kan hæves senere uden at
// gamle konti går i stykker (needsRehash).
const R = 8, P = 1, KEYLEN = 32;

// Hver hash bruger 32 MB. Højst to ad gangen, så en bølge af logins ikke æder al hukommelse.
let running = 0; const waiting = [];
const MAX_PARALLEL = 2;
function slot() {
  return new Promise(res => { const go = () => { running++; res(() => { running--; const n = waiting.shift(); if (n) n(); }); }; if (running < MAX_PARALLEL) go(); else waiting.push(go); });
}
function scrypt(pw, salt, logN, r, p) {
  return new Promise((res, rej) => crypto.scrypt(pw, salt, KEYLEN, { N: 2 ** logN, r, p, maxmem: 2 ** logN * r * 256 }, (e, k) => e ? rej(e) : res(k)));
}

async function hashPassword(pw, pepper, logN) {
  const release = await slot();
  try {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(pw + pepper, salt, logN, R, P);
    return ['scrypt', logN, R, P, salt.toString('base64'), key.toString('base64')].join('$');
  } finally { release(); }
}

async function verifyPassword(pw, stored, pepper) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, logN, r, p, salt, hash] = parts;
  const release = await slot();
  try {
    const key = await scrypt(pw + pepper, Buffer.from(salt, 'base64'), +logN, +r, +p);
    const want = Buffer.from(hash, 'base64');
    return key.length === want.length && crypto.timingSafeEqual(key, want);
  } catch (e) { return false; } finally { release(); }
}

const needsRehash = (stored, logN) => { const p = String(stored).split('$'); return p[0] !== 'scrypt' || +p[1] < logN; };

// ---- tokens ---------------------------------------------------------------------------------------------------
// Klienten får et tilfældigt token. Databasen gemmer kun dets sha256, så et læk af databasen ikke giver adgang.
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = prefix => prefix + crypto.randomBytes(32).toString('base64url');
const BASE32 = 'abcdefghjkmnpqrstuvwxyz23456789';
function newId(prefix, len = 12) {
  const b = crypto.randomBytes(len); let s = '';
  for (let i = 0; i < len; i++) s += BASE32[b[i] % BASE32.length];
  return prefix + s;
}
const sixDigits = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = { hashPassword, verifyPassword, needsRehash, sha256, newToken, newId, sixDigits, safeEqual };
