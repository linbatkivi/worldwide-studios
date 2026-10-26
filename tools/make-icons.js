#!/usr/bin/env node
// Tegner app-ikonet (og siden og OG-billedet) med Electrons egen renderer, så der ikke skal bruges andre værktøjer.
//   launcher/node_modules/.bin/electron tools/make-icons.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');

const mark = (s, ink = '#ecebe4', acc = '#ff5a1f', w = 2.1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${s}" height="${s}"><g fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"><path d="M11 5C6 10 6 22 11 27"/><path d="M21 5c5 5 5 17 0 22"/></g><circle cx="16" cy="16" r="2.7" fill="${acc}"/></svg>`;
const icon = `<body style="margin:0;background:transparent"><div style="width:1024px;height:1024px;display:grid;place-items:center">
  <div style="width:824px;height:824px;border-radius:186px;background:radial-gradient(120% 100% at 30% 20%,#17171a,#09090a);box-shadow:inset 0 0 0 3px rgba(236,235,228,.1);display:grid;place-items:center">${mark(470)}</div></div></body>`;

async function shot(html, w, h, out, transparent = true) {
  const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, transparent, backgroundColor: transparent ? '#00000000' : '#09090a', webPreferences: { offscreen: false }, useContentSize: true });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG()); win.destroy();
  console.log('skrev', path.relative(root, out), img.getSize());
}

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  process.on("unhandledRejection", e => { console.error("FEJL", e); app.exit(1); });
  app.dock && app.dock.hide();
  await shot(icon, 1024, 1024, path.join(root, 'launcher/build/icon.png'));
  // OG-billede til link-forhåndsvisning
  const og = new BrowserWindow({ width: 1200, height: 630, show: false, frame: false, useContentSize: true, backgroundColor: '#09090a' });
  await og.loadFile(path.join(__dirname, 'og.html'));
  await new Promise(r => setTimeout(r, 900));
  fs.writeFileSync(path.join(root, 'site/assets/img/og.png'), (await og.webContents.capturePage()).toPNG()); og.destroy();
  console.log('skrev site/assets/img/og.png');
  app.quit();
});
