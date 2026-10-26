'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { abortError, sleep } = require('./util');

// I appen bruges Chromiums netværkslag (kender systemets proxy). I test og scripts falder vi tilbage på Nodes fetch.
let impl = (...a) => fetch(...a);
function useFetch(f) { impl = f; }

const UA = 'WorldwideLauncher';
async function request(url, { signal, timeout = 20000, headers } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) throw abortError(); signal.addEventListener('abort', onAbort, { once: true }); }
  const timer = setTimeout(() => ctl.abort(new Error('timeout')), timeout);
  try {
    const res = await impl(url, { signal: ctl.signal, headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' });
    return res;
  } catch (e) {
    if (signal && signal.aborted) throw abortError();
    throw e;
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
}

async function getJson(url, opts) {
  const res = await request(url, { ...opts, headers: { 'Cache-Control': 'no-cache', ...(opts && opts.headers) } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

// Henter en fil til disk og tjekker sha256 undervejs. onBytes kaldes for hver bid, så fremgangen er jævn.
async function downloadFile(url, dest, { sha256, size, onBytes, signal, tries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const tmp = dest + '.part';
    let counted = 0;
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const res = await request(url, { signal, timeout: 30000 });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const hash = crypto.createHash('sha256');
      const src = Readable.fromWeb(res.body);
      src.on('data', d => { hash.update(d); counted += d.length; if (onBytes) onBytes(d.length); });
      if (signal) signal.addEventListener('abort', () => src.destroy(abortError()), { once: true });
      await pipeline(src, fs.createWriteStream(tmp));
      if (size !== undefined && counted !== size) throw new Error(`forkert størrelse (${counted} af ${size} bytes)`);
      if (sha256 && hash.digest('hex') !== sha256) throw new Error('forkert fingeraftryk');
      fs.renameSync(tmp, dest);
      return;
    } catch (e) {
      lastErr = e;
      try { fs.rmSync(tmp, { force: true }); } catch (er) {}
      if (onBytes && counted) onBytes(-counted);                    // fremgangen rulles tilbage, så den ikke tæller dobbelt
      if (e.name === 'AbortError' || (signal && signal.aborted)) throw abortError();
      if (attempt < tries) await sleep(600 * attempt, signal);
    }
  }
  throw new Error(`${url}: ${lastErr && lastErr.message}`);
}

module.exports = { useFetch, getJson, downloadFile, request };
