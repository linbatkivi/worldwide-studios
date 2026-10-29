#!/usr/bin/env node
// Bygger et native spil (Godot), lægger builds på en GitHub Release i studio-repoet og skriver dem ind i kataloget.
// Launcheren henter kataloget fra hjemmesiden og viser opdateringen næste gang den åbnes.
//
//   node tools/publish-game.js complex 0.2.0              bygger, uploader, opdaterer kataloget og pusher det
//   node tools/publish-game.js complex 0.2.0 --skip-build bruger de builds der allerede ligger i Complex/builds
//   node tools/publish-game.js blindline 0.1.0           samme for Blindline (Electron, bygges med electron-builder)
//   node tools/publish-game.js complex 0.2.0 --no-push    ændrer kataloget lokalt, men pusher ikke
//
// Kræver: Godot med eksport-skabeloner (GODOT=/sti/til/Godot), gh (logget ind), zip og macOS' codesign/ditto.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const HUB = 'linbatkivi/worldwide-studios';
const GAMES = {
  complex: {
    dir: path.join(process.env.HOME, 'Projekter', 'Complex'), project: 'game', title: 'Complex',
    presets: { macOS: 'macos/Complex.zip', Windows: 'windows/Complex.exe', Linux: 'linux/Complex.x86_64' },
    godot: process.env.GODOT || '/Applications/Godot.app/Contents/MacOS/Godot'
  }
};

GAMES.blindline = {
  dir: path.join(process.env.HOME, 'Projekter', 'Blindline'), title: 'Blindline', electron: true,
  zips: { mac: { arm64: 'dist/Blindline-macOS-arm64.zip', x64: 'dist/Blindline-macOS-x64.zip' }, win: 'dist/Blindline-Windows.zip', linux: 'dist/Blindline-Linux.zip' },
  execs: { mac: 'Blindline.app/Contents/MacOS/Blindline', win: 'Blindline.exe', linux: 'blindline' },
  linuxArgs: ['--no-sandbox']
};

const [id, version, ...flags] = process.argv.slice(2);
if (!GAMES[id] || !/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('brug: node tools/publish-game.js complex|blindline 0.2.0 [--skip-build] [--no-push]'); process.exit(1); }
const g = GAMES[id], has = f => flags.includes(f);
const run = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...o }).toString().trim();
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const out = path.join(g.dir, 'builds'), dist = path.join(out, 'dist-' + version);

if (!has('--skip-build') && g.electron) {
  console.log('· bygger med electron-builder');
  const r = spawnSync('npx', ['electron-builder', '--mac', '--win', '--linux'], { cwd: g.dir, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  if (r.status !== 0) { console.error('✗ bygning fejlede'); process.exit(1); }
} else if (!has('--skip-build')) {
  for (const [preset, rel] of Object.entries(g.presets)) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    console.log('· eksporterer', preset);
    const r = spawnSync(g.godot, ['--headless', '--path', path.join(g.dir, g.project), '--export-release', preset], { stdio: 'inherit' });
    if (r.status !== 0 || !fs.existsSync(path.join(out, rel))) { console.error('✗ eksport af ' + preset + ' fejlede'); process.exit(1); }
  }
}

// ---- pak til det launcheren forventer: ét zip pr. platform, med det spillet skal bruge
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist, { recursive: true });
const assets = [];
// macOS: pak ud, ad hoc-signér (Apple Silicon kræver mindst det) og pak igen med ditto, så rettigheder og signatur overlever
for (const [key, label, srcZip] of g.electron ? Object.entries(g.zips.mac).map(([arch, z]) => [`darwin-${arch}`, `macOS-${arch}`, path.join(g.dir, z)]) : [['darwin', 'macOS', path.join(out, g.presets.macOS)]]) {
  const tmp = path.join(dist, 'mac-' + key); fs.mkdirSync(tmp);
  run('unzip', ['-q', srcZip, '-d', tmp]);
  run('codesign', ['--force', '--deep', '--sign', '-', path.join(tmp, g.title + '.app')]);
  const zip = path.join(dist, `${g.title}-${label}.zip`);
  run('ditto', ['-c', '-k', '--keepParent', path.join(tmp, g.title + '.app'), zip]);
  assets.push({ key, file: zip, exec: g.electron ? g.execs.mac : `${g.title}.app/Contents/MacOS/${g.title}` });
}
if (g.electron) {
  for (const [key, k, name] of [['win32-x64', 'win', 'Windows'], ['linux-x64', 'linux', 'Linux']]) {
    const zip = path.join(dist, `${g.title}-${name}.zip`); fs.copyFileSync(path.join(g.dir, g.zips[k]), zip);
    assets.push({ key, file: zip, exec: g.execs[k], ...(k === 'linux' ? { args: g.linuxArgs } : {}) });
  }
} else
for (const [key, preset, name, exe] of [['win32-x64', 'Windows', 'Windows', g.title + '.exe'], ['linux-x64', 'Linux', 'Linux', g.title + '.x86_64']]) {
  const zip = path.join(dist, `${g.title}-${name}.zip`);
  run('zip', ['-q', '-j', zip, path.join(out, g.presets[preset])]);
  assets.push({ key, file: zip, exec: exe });
}
for (const a of assets) { a.size = fs.statSync(a.file).size; a.sha256 = sha(a.file); console.log('·', path.basename(a.file), (a.size / 1e6).toFixed(0) + ' MB'); }

// ---- upload til en release (ikke "latest", så den ikke forveksles med launcheren)
const tag = `${id}-v${version}`;
let exists = true; try { run('gh', ['release', 'view', tag, '-R', HUB]); } catch (e) { exists = false; }
if (!exists) run('gh', ['release', 'create', tag, '-R', HUB, '--title', `${g.title} ${version}`, '--notes', `${g.title} ${version}. Hentes og opdateres fra Worldwide-launcheren.`, '--latest=false']);
run('gh', ['release', 'upload', tag, '-R', HUB, '--clobber', ...assets.map(a => a.file)]);

// ---- kataloget
const file = path.join(root, 'catalog', 'games.json'), cat = JSON.parse(fs.readFileSync(file, 'utf8'));
const game = cat.games.find(x => x.id === id);
game.package.version = version;
game.package.builds = Object.fromEntries(assets.map(a => [a.key, { url: `https://github.com/${HUB}/releases/download/${tag}/${path.basename(a.file)}`, sha256: a.sha256, size: a.size, exec: a.exec, ...(a.args ? { args: a.args } : {}) }]));
fs.writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
console.log('✓ kataloget opdateret:', id, version);
if (!has('--no-push')) {
  run('git', ['add', 'catalog/games.json'], { cwd: root });
  run('git', ['commit', '-q', '-m', `${g.title} ${version}`, '-m', 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'], { cwd: root });
  run('git', ['push', '-q'], { cwd: root });
  console.log('✓ pushet. Hjemmesiden og launcheren henter den nye udgave om et par minutter.');
}
