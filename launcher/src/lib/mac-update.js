'use strict';
// Selvopdatering på macOS. Appen er ikke signeret hos Apple, så electron-updater kan ikke erstatte den.
// I stedet: hent latest-mac.yml fra den nyeste release, hent zip-filen, tjek sha512, pak ud, og lad et lille
// script skifte appen ud, når den er lukket, og åbne den igen. Filer hentet herfra får ikke macOS' karantæne.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { request, downloadFile } = require('./net');
const { rmrf } = require('./util');

const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

// latest-mac.yml er en lille, fast fil: version og en liste af filer med url, sha512 og size
function parseYml(text) {
  const version = (/^version:\s*(\S+)/m.exec(text) || [])[1];
  const files = [...text.matchAll(/-\s+url:\s*(\S+)\s+sha512:\s*(\S+)\s+size:\s*(\d+)/g)].map(m => ({ url: m[1], sha512: m[2], size: +m[3] }));
  return { version, zip: files.find(f => /\.zip$/.test(f.url)) || null };
}

const sha512File = f => new Promise((res, rej) => { const h = crypto.createHash('sha512'); fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => res(h.digest('base64'))).on('error', rej); });

function createMacUpdater({ repo, version, workDir, appPath, pid = process.pid, log = () => {} }) {
  const base = `https://github.com/${repo}/releases/latest/download/`;
  let ready = null;

  async function check() {
    const r = await request(base + 'latest-mac.yml', { timeout: 15000 });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const y = parseYml(await r.text());
    if (!y.version || !y.zip || cmp(y.version, version) <= 0) return null;
    return { version: y.version, zip: y.zip };
  }

  async function download(u, onProgress) {
    rmrf(workDir); fs.mkdirSync(workDir, { recursive: true });
    const zip = path.join(workDir, 'update.zip'); let done = 0;
    await downloadFile(base + u.zip.url, zip, { size: u.zip.size, onBytes: n => { done += n; onProgress && onProgress(done, u.zip.size); } });
    if (await sha512File(zip) !== u.zip.sha512) throw new Error('forkert fingeraftryk på opdateringen');
    const out = path.join(workDir, 'new'); fs.mkdirSync(out);
    execFileSync('ditto', ['-x', '-k', zip, out]);
    const app = fs.readdirSync(out).find(f => f.endsWith('.app'));
    if (!app) throw new Error('opdateringen indeholder ingen app');
    rmrf(zip);
    ready = { version: u.version, newApp: path.join(out, app) };
    return ready;
  }

  // kan appen overhovedet erstattes der hvor den ligger?
  function writable() { try { fs.accessSync(path.dirname(appPath), fs.constants.W_OK); return appPath.endsWith('.app') && !appPath.includes('/AppTranslocation/'); } catch (e) { return false; } }

  function apply() {
    if (!ready) return false;
    const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const script = path.join(workDir, 'apply.sh');
    fs.writeFileSync(script, `#!/bin/bash
while kill -0 ${pid} 2>/dev/null; do sleep 0.3; done
OLD=${q(appPath + '.old')}
rm -rf "$OLD"
if mv ${q(appPath)} "$OLD" && ditto ${q(ready.newApp)} ${q(appPath)}; then rm -rf "$OLD"; else rm -rf ${q(appPath)}; mv "$OLD" ${q(appPath)}; fi
xattr -dr com.apple.quarantine ${q(appPath)} 2>/dev/null
open ${q(appPath)}
rm -rf ${q(workDir)}
`, { mode: 0o755 });
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  return { check, download, apply, writable, parseYml, cmp };
}

module.exports = { createMacUpdater, parseYml, cmp };
