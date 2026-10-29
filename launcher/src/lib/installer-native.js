'use strict';
// Installation af spil der kommer som ét arkiv pr. platform (Complex og fremtidige native spil).
// Kataloget siger hvilken version, hvor den ligger, hvor stor den er og hvad dens sha256 er.
const fs = require('fs');
const path = require('path');
const { downloadFile } = require('./net');
const { spawn } = require('child_process');
const { readJson, writeJson, freeBytes, rmrf, speedMeter, abortError, dirSize } = require('./util');

// Zip-filen pakkes ud med systemets eget værktøj. extract-zip hænger på Electron-apps (symlinks i Frameworks) og bevarer
// ikke altid signaturen. Findes værktøjet ikke, bruges extract-zip som reserve.
function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.once('error', rej);
    p.once('exit', c => c === 0 ? res() : rej(new Error(`${cmd} fejlede (${c})`)));
  });
}
async function extractArchive(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  try {
    if (process.platform === 'darwin') return await run('ditto', ['-x', '-k', zip, dir]);
    if (process.platform === 'win32') return await run('tar', ['-xf', zip, '-C', dir]);
    return await run('unzip', ['-q', '-o', zip, '-d', dir]);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    await require('extract-zip')(zip, { dir });
  }
}

const PLATFORM = { darwin: 'darwin', win32: 'win32', linux: 'linux' }[process.platform];
const readInstalled = dir => readJson(path.join(dir, 'installed.json'));

// Finder den build der passer til denne maskine. null = der findes ingen endnu.
function buildFor(pkg, platform = PLATFORM, arch = process.arch) {
  if (!pkg || !pkg.version || !pkg.builds) return null;
  return pkg.builds[platform + '-' + arch] || pkg.builds[platform] || null;
}

async function install(pkg, dir, { onProgress, signal, extract } = {}) {
  const b = buildFor(pkg);
  if (!b) throw Object.assign(new Error('Der findes ingen udgave til din computer endnu'), { code: 'no_build' });
  const free = await freeBytes(dir);
  if (free < (b.size || 0) * 3) throw Object.assign(new Error('Der er ikke plads nok på disken'), { code: 'no_space', needed: (b.size || 0) * 3 });

  const tmpZip = path.join(dir, '.download', path.basename(new URL(b.url).pathname));
  const target = path.join(dir, pkg.version);
  const meter = speedMeter(); let done = 0;
  const emit = phase => onProgress && onProgress({ phase, done, total: b.size || done, speed: meter.perSecond() });
  emit('download');
  await downloadFile(b.url, tmpZip, { sha256: b.sha256, size: b.size, signal, onBytes: n => { done += n; if (n > 0) meter.add(n); emit('download'); } });
  if (signal && signal.aborted) throw abortError();

  emit('extract');
  rmrf(target + '.tmp');
  await (extract || extractArchive)(tmpZip, target + '.tmp');
  rmrf(target);
  fs.renameSync(target + '.tmp', target);
  const exe = path.join(target, ...b.exec.split('/'));
  if (!fs.existsSync(exe)) { rmrf(target); throw new Error('Arkivet mangler ' + b.exec); }
  if (process.platform !== 'win32') try { fs.chmodSync(exe, 0o755); } catch (e) {}
  rmrf(path.join(dir, '.download'));
  // gamle udgaver fjernes, så de ikke æder plads
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) if (ent.isDirectory() && ent.name !== pkg.version) rmrf(path.join(dir, ent.name));
  const inst = { version: pkg.version, exec: b.exec, args: b.args || [], at: new Date().toISOString(), size: dirSize(target) };
  writeJson(path.join(dir, 'installed.json'), inst);
  return inst;
}

const execPath = (dir, inst) => path.join(dir, inst.version, ...inst.exec.split('/'));

module.exports = { install, buildFor, readInstalled, execPath, PLATFORM };
