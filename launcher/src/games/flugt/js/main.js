// Samler det hele: menu, input, hovedløkke, HUD, pause og fanget-skærmen.
import { Renderer } from './render.js';
import { Sim, TUNING } from './sim.js';
import { Audio } from './audio.js';
import { Account, fmt } from './account.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const debug = new URLSearchParams(location.search).has('debug') || !!window.WW_DEBUG;

const sim = new Sim(64);
const audio = new Audio();
const account = new Account(window.WW_SESSION || null);
const MUSIC = 'assets/music/fight_looped.wav';

const settings = { sens: 1, lines: 480 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('flugt.settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('flugt.settings', JSON.stringify(settings)); } catch (e) {} };

let renderer = null;
let mode = 'menu';            // menu | game
let paused = false, lockSeen = false, overShown = false, overAt = 0;
let panelOpen = null;
const keys = new Set();
let placeQueued = false;
const view = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, fov: 80, danger: 0, roll: 0 };
const menuPng = { x: 40, z: 0, stride: 0, a: 0 };
let menuCam = { t: 0, tx: 40, tz: 0 };
let bob = 0, shake = 0;

// ---- skærme og paneler ---------------------------------------------------------------------------------------------------
function show(id, on) { $(id).hidden = !on; }
function setSay(html) { $('#say').innerHTML = html || ''; }

function who() {
  const el = $('#who');
  const s = account.status;
  const line = s === 'guest' ? 'Du spiller som gæst. Tiderne gemmes kun her.'
    : s === 'online' ? `Logget ind som ${account.name}`
    : s === 'expired' ? `${account.name}: login udløbet. Start spillet fra launcheren igen.`
    : `${account.name} · ingen forbindelse, tiderne gemmes her`;
  el.textContent = line;
}

function openPanel(kind) {
  panelOpen = kind;
  const p = $('#panel'); p.hidden = false; $('#menu').hidden = true;
  const back = `<button class="item back" data-go="back">TILBAGE</button>`;
  if (kind === 'help') {
    p.innerHTML = `<div class="card"><h2>STYRING</h2>
      <ul>
        <li><span>Løb</span><b>W A S D</b></li><li><span>Kig</span><b>MUSEN</b></li>
        <li><span>Hop</span><b>MELLEMRUM</b></li><li><span>Sprint</span><b>SHIFT</b></li>
        <li><span>Sæt en kasse</span><b>E · VENSTRE KLIK</b></li><li><span>Pause</span><b>ESC</b></li>
        <li><span>Lyd til/fra</span><b>M</b></li>
      </ul>
      <p>Alt står stille, til du rører en tast. Så starter uret, og PNG'en kommer efter dig. Den er hurtigere end dig og bliver ved med at blive det.
      Brug mure, U-formede gårde, labyrinten og kasserne til at snyde den. Overlev så længe du kan.</p>
      <p class="note">Sprint tømmer udholdenheden. Kasser forsvinder efter lidt tid, og du kan højst have ${TUNING.crateMax} ad gangen.</p>${back}</div>`;
  } else if (kind === 'settings') {
    p.innerHTML = `<div class="card"><h2>INDSTILLINGER</h2>
      ${['master:Samlet lyd', 'music:Musik', 'sfx:Effekter'].map(s => { const [k, l] = s.split(':'); return `<div class="ctl"><span>${l}</span><input type="range" min="0" max="100" value="${Math.round(audio.vol[k] * 100)}" data-vol="${k}"></div>`; }).join('')}
      <div class="ctl"><span>Musefølsomhed</span><input type="range" min="30" max="250" value="${Math.round(settings.sens * 100)}" data-sens></div>
      <div class="ctl"><span>Opløsning</span><div class="seg" data-lines>${[[360, 'LAV'], [480, 'NORMAL'], [720, 'HØJ']].map(([n, l]) => `<button data-n="${n}" class="${settings.lines === n ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="note">Verdenen tegnes i få linjer med N64-farver. PNG'en tegnes altid i skærmens fulde opløsning.</p>${back}</div>`;
  } else if (kind === 'board') {
    p.innerHTML = `<div class="card"><h2>TAVLE</h2><div id="boardBody"><p>Henter ...</p></div>${back}</div>`;
    account.board(12).then(b => { if (panelOpen !== 'board') return; renderBoard(b); }).catch(() => { $('#boardBody').innerHTML = '<p>Kunne ikke hente tavlen.</p>'; });
  }
  const first = $('.back', p); if (first) first.focus({ preventScroll: true });
}

function renderBoard(b) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = '';
  if (!b.rows.length) html = '<p>Ingen tider endnu. Bliv den første.</p>';
  else html = `<table class="rows"><tbody>${b.rows.map(r => `<tr class="${r.me ? 'me' : ''} ${r.rank === 1 ? 'top1' : ''}"><td>${r.rank}.</td><td>${esc(r.name)}</td><td>${fmt(r.ms)}</td></tr>`).join('')}</tbody></table>`;
  if (b.source === 'online') {
    const inList = b.rows.some(r => r.me);
    if (b.me && !inList) html += `<p>Din plads: ${b.me.rank}. · ${fmt(b.me.ms)}</p>`;
    html += `<p class="note">${b.total} ${b.total === 1 ? 'spiller' : 'spillere'} på tavlen. Længste tid vinder.</p>`;
  } else html += `<p class="note">Kun tider fra denne maskine. Den fælles tavle kræver forbindelse og login fra launcheren.</p>`;
  $('#boardBody').innerHTML = html;
}

function closePanel() { panelOpen = null; $('#panel').hidden = true; $('#panel').innerHTML = ''; $('#menu').hidden = false; $('.item.start', $('#menu')).focus({ preventScroll: true }); }

// ---- spilforløb --------------------------------------------------------------------------------------------------------
function enterGame() {
  mode = 'game'; paused = false; overShown = false;
  show('#menu', false); show('#panel', false); show('#over', false); show('#pause', false); show('#hud', true);
  sim.reset(); sim.yaw = sim.world.spawn.yaw; sim.pitch = 0;
  // kig mod PNG'en, så man ser den stå der
  const c = sim.chaser;
  sim.yaw = Math.atan2(-(c.x - sim.player.x), -(c.z - sim.player.z));
  audio.setIntensity({ rate: 1, muffled: false });
  setSay(`TRYK PÅ EN TAST FOR AT STARTE<small>Alt står stille, til du rører noget</small>`);
  $('#timer').textContent = '0:00.00';
  requestLock();
}

function requestLock() {
  const c = $('#gl');
  try { const r = c.requestPointerLock && c.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => c.requestPointerLock && c.requestPointerLock()); } catch (e) {}
}

function toMenu() {
  mode = 'menu'; paused = false; overShown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  show('#hud', false); show('#over', false); show('#pause', false); show('#menu', true); show('#panel', false); panelOpen = null;
  $('#danger').style.opacity = 0;
  sim.reset();
  audio.setIntensity({ rate: 1, muffled: false });
  who();
  $('.item.start', $('#menu')).focus({ preventScroll: true });
}

function pause(on) {
  if (mode !== 'game' || sim.state === 'over') return;
  paused = on; show('#pause', on);
  audio.setIntensity({ rate: musicRate(), muffled: on });
  if (on) { keys.clear(); if (document.pointerLockElement) document.exitPointerLock(); $('#resume').focus({ preventScroll: true }); }
  else requestLock();
}

const musicRate = () => 1 + Math.min(0.1, sim.time / 1800);

function onEvents() {
  for (const e of sim.events) {
    if (e === 'start') { audio.start(); setSay(''); $('#timer').classList.add('go'); setTimeout(() => $('#timer').classList.remove('go'), 400); }
    else if (e === 'jump') audio.jump();
    else if (e === 'land') { audio.land(); shake = Math.max(shake, 0.12); }
    else if (e === 'crate') { audio.crate(); }
    else if (e === 'crateDenied') audio.denied();
    else if (e === 'leap') audio.leap();
    else if (e === 'stomp') { audio.stomp(); shake = Math.max(shake, Math.max(0, 0.7 - sim.threat().dist / 40)); }
    else if (e === 'caught') caught();
  }
  sim.events.length = 0;
}

function caught() {
  audio.caught(); shake = 1; overAt = 0;
  const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = 0.9; requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = 0; });
  if (document.pointerLockElement) document.exitPointerLock();
}

async function showOver() {
  overShown = true;
  const ms = Math.floor(sim.time * 1000);
  $('#overTime').textContent = fmt(ms);
  $('#overNote').textContent = ''; $('#overRank').textContent = 'Gemmer tiden ...';
  show('#over', true); $('#retry').focus({ preventScroll: true });
  const prev = account.best;
  const r = await account.submit(ms);
  const record = ms > prev || r.improved === true && prev === 0;
  if (record) { $('#overNote').textContent = 'NY REKORD!'; audio.record(); }
  let line;
  if (r.saved === 'online') line = `Plads ${r.rank} af ${r.total} på tavlen`;
  else line = account.status === 'guest' ? 'Gemt på denne maskine (gæst)' : account.status === 'expired' ? 'Login udløbet. Tiden er gemt her og sendes næste gang.' : 'Ingen forbindelse. Tiden er gemt og sendes senere.';
  if (!overShown) return;
  $('#overRank').textContent = line + (prev && !record ? ` · din bedste: ${fmt(prev)}` : '');
}

// ---- input ---------------------------------------------------------------------------------------------------------------
addEventListener('keydown', e => {
  audio.unlock(MUSIC);
  if (e.repeat && e.code !== 'Space') return;
  if (mode === 'menu') { menuKeys(e); return; }
  // i spillet
  if (e.code === 'KeyM') { audio.toggleMute(); return; }
  if (sim.state === 'over') {
    if (overShown && e.code === 'Enter') retry();
    else if (overShown && e.code === 'Escape') toMenu();
    return;
  }
  if (e.code === 'Escape') { pause(!paused); e.preventDefault(); return; }
  if (paused) { if (e.code === 'Enter') pause(false); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Tab' || e.code.startsWith('F') && /^F\d+$/.test(e.code)) return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (sim.state === 'ready') { sim.start(); onEvents(); }
  if (e.code === 'KeyE') placeQueued = true;
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function menuKeys(e) {
  if (panelOpen) { if (e.code === 'Escape') { closePanel(); } return; }
  const items = $$('#items .item'), i = items.indexOf(document.activeElement);
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { items[(i + 1 + items.length) % items.length].focus(); audio.hover(); e.preventDefault(); }
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') { items[(i - 1 + items.length) % items.length].focus(); audio.hover(); e.preventDefault(); }
  else if (e.code === 'Enter' || e.code === 'Space') { if (i < 0) go('start'); else items[i].click(); e.preventDefault(); }
}

addEventListener('mousemove', e => {
  if (mode !== 'game' || paused || !document.pointerLockElement || sim.state === 'over') return;
  const k = 0.0022 * settings.sens;
  sim.yaw -= e.movementX * k;
  sim.pitch = Math.max(-1.45, Math.min(1.45, sim.pitch - e.movementY * k));
});
addEventListener('mousedown', e => {
  audio.unlock(MUSIC);
  if (mode === 'game' && !paused && e.button === 0 && sim.state === 'playing') {
    if (document.pointerLockElement) placeQueued = true; else requestLock();
  } else if (mode === 'game' && !paused && !document.pointerLockElement && sim.state !== 'over') requestLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) { lockSeen = true; if (paused) { paused = false; show('#pause', false); } return; }
  if (mode === 'game' && lockSeen && sim.state !== 'over' && !paused) pause(true);
});

function retry() { sim.reset(); enterGameKeepLock(); }
function enterGameKeepLock() { enterGame(); }

function go(what) {
  audio.unlock(MUSIC); audio.click();
  if (what === 'start') enterGame();
  else if (what === 'back') closePanel();
  else openPanel(what);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (b) { go(b.dataset.go); return; }
  if (e.target.closest('#retry')) { audio.click(); retry(); }
  else if (e.target.closest('#toMenu') || e.target.closest('#quit')) { audio.click(); toMenu(); }
  else if (e.target.closest('#resume')) { audio.click(); pause(false); }
  const seg = e.target.closest('[data-lines] button');
  if (seg) { settings.lines = +seg.dataset.n; saveSettings(); renderer.userSet = true; renderer.setLines(settings.lines); $$('[data-lines] button').forEach(b => b.classList.toggle('on', b === seg)); audio.click(); }
});
document.addEventListener('input', e => {
  const v = e.target.dataset;
  if (v.vol) audio.set(v.vol, e.target.value / 100);
  else if ('sens' in v) { settings.sens = e.target.value / 100; saveSettings(); }
});
document.addEventListener('mouseover', e => { const b = e.target.closest('.item'); if (b && !b.classList.contains('sel') && b !== document.activeElement) { audio.hover(); } });

// ---- hovedløkke ------------------------------------------------------------------------------------------------------------
let last = performance.now(), slow = 0, fpsAcc = 0, fpsN = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!renderer) return;

  if (mode === 'game') gameFrame(dt); else menuFrame(dt);

  // lav opløsningen hvis maskinen har svært ved det (kun hvis man ikke selv har valgt)
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 3) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 38 && renderer.lines < 900 && !renderer.userSet) { slow++; if (slow >= 2) { renderer.setLines(Math.round(renderer.lines * 1.5)); slow = 0; } } else slow = 0;
    if (debug) window.__fps = fps;
  }
}

function menuFrame(dt) {
  menuPng.a += dt * 0.62; menuPng.stride += dt * 9;
  menuPng.x = Math.cos(menuPng.a) * 42; menuPng.z = Math.sin(menuPng.a) * 42;
  menuCam.t += dt * 0.09;
  const cx = Math.cos(menuCam.t) * 84, cz = Math.sin(menuCam.t) * 84, cy = 15 + Math.sin(menuCam.t * 1.7) * 3;
  menuCam.tx += (menuPng.x - menuCam.tx) * Math.min(1, dt * 0.9); menuCam.tz += (menuPng.z - menuCam.tz) * Math.min(1, dt * 0.9);
  const dx = menuCam.tx - cx, dz = menuCam.tz - cz, dh = Math.hypot(dx, dz);
  view.x = cx; view.y = cy; view.z = cz; view.yaw = Math.atan2(-dx, -dz); view.pitch = Math.atan2(2 - cy, dh); view.fov = 62; view.danger = 0; view.roll = 0;
  audio.threat(dt, 999, false);
  renderer.draw(dt, view, menuPng);
}

function gameFrame(dt) {
  const p = sim.player, c = sim.chaser;
  // pil-taster kigger rundt (hvis musen ikke kan låses)
  if (!paused && sim.state !== 'over') {
    const t = 2.2 * dt * settings.sens;
    if (keys.has('ArrowLeft')) sim.yaw += t; if (keys.has('ArrowRight')) sim.yaw -= t;
    if (keys.has('ArrowUp')) sim.pitch = Math.min(1.45, sim.pitch + t); if (keys.has('ArrowDown')) sim.pitch = Math.max(-1.45, sim.pitch - t);
  }
  if (!paused) {
    const input = {
      fwd: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      jump: keys.has('Space'), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), place: placeQueued
    };
    placeQueued = false;
    sim.update(dt, input);
    onEvents();
  }

  // kamera
  const moving = p.grounded && p.speed > 1;
  bob += dt * (p.sprinting ? 15 : 11) * (moving ? 1 : 0);
  const eye = p.y + 1.62 + (moving ? Math.sin(bob) * 0.045 : 0);
  view.x = p.x; view.y = eye; view.z = p.z;
  const dx = c.x - p.x, dz = c.z - p.z, dist = Math.hypot(dx, dz);
  if (sim.state === 'over') {                                       // vend mod PNG'en
    const ty = Math.atan2(-dx, -dz);
    let d = ty - sim.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    sim.yaw += d * Math.min(1, dt * 14);
    const tp = Math.atan2(c.y + c.h * 0.5 - eye, Math.max(0.5, dist));
    sim.pitch += (tp - sim.pitch) * Math.min(1, dt * 10);
  }
  view.yaw = sim.yaw; view.pitch = sim.pitch;
  const fovT = 80 + (p.sprinting ? 9 : 0) + Math.min(6, p.speed * 0.15);
  view.fov += (fovT - view.fov) * Math.min(1, dt * 8);
  shake = Math.max(0, shake - dt * 1.8);
  const near = sim.state === 'playing' ? Math.max(0, 1 - dist / 22) : 0;
  const sh = shake * 0.12 + near * near * 0.05;
  if (sh > 0.001) { view.x += (Math.random() - 0.5) * sh; view.y += (Math.random() - 0.5) * sh; view.yaw += (Math.random() - 0.5) * sh * 0.05; view.pitch += (Math.random() - 0.5) * sh * 0.05; }
  view.danger = sim.state === 'playing' || sim.state === 'over' ? Math.min(1, Math.pow(Math.max(0, 1 - dist / 38), 2) * 0.6) : 0;
  view.roll = 0;

  // HUD
  const timer = $('#timer');
  const txt = fmt(sim.time * 1000); if (timer.textContent !== txt) timer.textContent = txt;
  $('#dist').textContent = Math.round(dist);
  $('#chase').classList.toggle('near', dist < 14 && sim.state === 'playing');
  $('#danger').style.opacity = view.danger.toFixed(2);
  const st = $('#stam'); st.firstElementChild.style.transform = `scaleX(${Math.max(0, p.stamina).toFixed(3)})`; st.classList.toggle('low', p.locked);
  const crates = $$('#crates span'); const free = TUNING.crateMax - sim.crates.length;
  crates.forEach((s, i) => s.classList.toggle('off', i >= free));
  $('#cool').textContent = sim.cooldown > 0 ? sim.cooldown.toFixed(1) + 's' : '';
  const ar = $('#arrow');
  if (sim.state === 'playing' && dist > 6) {
    const sy = Math.sin(sim.yaw), cy = Math.cos(sim.yaw);
    const f = dx * -sy + dz * -cy, r = dx * cy + dz * -sy;
    ar.style.transform = `rotate(${Math.atan2(r, f)}rad)`;
    ar.style.opacity = Math.abs(Math.atan2(r, f)) > 0.7 ? 1 : 0;           // kun når den er uden for synsfeltet
  } else ar.style.opacity = 0;

  audio.threat(dt, dist, sim.state === 'playing' && !paused);
  if (sim.state === 'playing' && !paused) audio.setIntensity({ rate: musicRate(), muffled: false });

  if (sim.state === 'over') { overAt += dt; if (overAt > 1.1 && !overShown) showOver(); }
  if (debug && window.__cam) Object.assign(view, window.__cam);
  renderer.draw(dt, view, null);
}

// ---- start --------------------------------------------------------------------------------------------------------------------
async function boot() {
  const canvas = $('#gl');
  try {
    renderer = new Renderer(canvas, sim, { pngUrl: 'assets/chaser.png' });
  } catch (e) {
    $('#loading span').textContent = 'WEBGL VIRKER IKKE PÅ DENNE MASKINE';
    console.error(e); return;
  }
  renderer.userSet = false;
  if (settings.lines !== 480) { renderer.userSet = true; renderer.setLines(settings.lines); }
  who();
  if (debug) window.__flugt = { sim, renderer, audio, account, enterGame, toMenu, view, settings };
  // vent på billedet, før indlæsningsskærmen forsvinder
  const t0 = performance.now();
  while (!renderer.pngReady && performance.now() - t0 < 4000) await new Promise(r => setTimeout(r, 30));
  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
  $('#loading').classList.add('gone');
  setTimeout(() => $('#loading').remove(), 600);
  $('.item.start', $('#menu')).focus({ preventScroll: true });
  audio.unlock(MUSIC);
  requestAnimationFrame(t => { last = t; frame(t); });
}
boot();
