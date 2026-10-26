#!/usr/bin/env node
// Alt på én gang, lokalt: konto-serveren, hjemmesiden og launcheren, der peger på dem begge.
// Spillene køres direkte fra deres projektmapper (wd og Complex), så en ændring i spillet ses ved næste Spil-tryk.
//
//   node tools/dev.js                 api på :8787, hjemmeside på :8080, launcher
//   node tools/dev.js --no-launcher   kun serverne
//   WD_DIR=… COMPLEX_DIR=… node tools/dev.js   hvis spillene ligger et andet sted
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..'), dev = path.join(root, '.dev');
const home = process.env.HOME;
const WD = process.env.WD_DIR || path.join(home, 'Projekter', 'wd');
const CX = process.env.COMPLEX_DIR || path.join(home, 'Projekter', 'Complex', 'game');
const API_PORT = 8787, SITE_PORT = 8080;
const procs = [];
const tag = (name, color) => d => String(d).split('\n').filter(Boolean).forEach(l => console.log(`\x1b[${color}m${name.padEnd(9)}\x1b[0m ${l}`));
const start = (name, color, cmd, args, opts) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  p.stdout.on('data', tag(name, color)); p.stderr.on('data', tag(name, color));
  p.on('exit', c => { console.log(`${name} stoppede (${c})`); if (name === 'launcher') stop(); });
  procs.push(p); return p;
};
function stop() { procs.forEach(p => { try { p.kill(); } catch (e) {} }); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);

fs.mkdirSync(dev, { recursive: true });

start('api', 36, process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], {
  cwd: path.join(root, 'api'),
  env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', DB_PATH: path.join(dev, 'api.db'), MAIL_MODE: 'console', SCRYPT_COST: '14' }
});

// hjemmesiden som den er, med kataloget lagt ved
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  let f = p === '/catalog.json' ? path.join(root, 'catalog', 'games.json') : path.join(root, 'site', p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(SITE_PORT, '127.0.0.1', () => console.log(`\x1b[35mhjemmeside\x1b[0m http://127.0.0.1:${SITE_PORT}`));

if (!process.argv.includes('--no-launcher')) {
  const ud = path.join(dev, 'launcher');
  fs.mkdirSync(ud, { recursive: true });
  const stFile = path.join(ud, 'state.json');
  if (!fs.existsSync(stFile)) {                       // første gang: peg launcheren på spillenes mapper
    const links = {}; if (fs.existsSync(path.join(WD, 'server.js'))) links['white-dust'] = WD; if (fs.existsSync(path.join(CX, 'project.godot'))) links['complex'] = CX;
    fs.writeFileSync(stFile, JSON.stringify({ v: 1, installs: {}, stats: {}, settings: { lang: 'auto', gamesDir: null, autoUpdate: false, dev: { enabled: true, links, godot: '' } } }, null, 2));
  }
  const electron = path.join(root, 'launcher', 'node_modules', '.bin', 'electron');
  if (!fs.existsSync(electron)) { console.error('kør først: npm install --prefix launcher'); stop(); }
  spawn(process.execPath, [path.join(root, 'launcher', 'scripts', 'sync-shared.js')], { stdio: 'inherit' }).on('exit', () => {
    start('launcher', 33, electron, ['.'], { cwd: path.join(root, 'launcher'), env: { ...process.env, WW_API: `http://127.0.0.1:${API_PORT}`, WW_USERDATA: ud, WW_DEVTOOLS: '1' } });
  });
}
