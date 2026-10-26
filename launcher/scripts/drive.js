#!/usr/bin/env node
// Styrer en kørende launcher (startet med --remote-debugging-port) til test og skærmbilleder.
//   node scripts/drive.js 9333 eval "document.title"
//   node scripts/drive.js 9333 shot /tmp/out.png
//   node scripts/drive.js 9333 click "[data-act=settings]"
//   node scripts/drive.js 9333 type "#fEmail" "mig@example.com"
const http = require('http');
const WebSocket = require('ws');

const [port, cmd, ...args] = process.argv.slice(2);
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));

(async () => {
  const pages = (await get(`http://127.0.0.1:${port}/json`)).filter(p => p.type === 'page' && !p.url.startsWith('devtools'));
  const pat = process.env.TARGET ? new RegExp(process.env.TARGET) : /renderer\/index\.html/;
  const target = pages.find(p => pat.test(p.url)) || pages[0];
  if (!target) throw new Error('ingen side fundet');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.once('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails)); return r.result.result.value; };

  if (cmd === 'eval') console.log(JSON.stringify(await evalJs(args[0])));
  else if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(args[0], Buffer.from(r.result.data, 'base64')); console.log('gemt', args[0]);
  } else if (cmd === 'click') console.log(await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(args[0])});if(!e)return 'findes ikke';e.click();return 'ok'})()`));
  else if (cmd === 'type') console.log(await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(args[0])});if(!e)return 'findes ikke';e.focus();e.value=${JSON.stringify(args[1])};e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()`));
  else if (cmd === 'wait') { await new Promise(r => setTimeout(r, +args[0] * 1000)); }
  ws.close();
})().catch(e => { console.error(e.message); process.exit(1); });
