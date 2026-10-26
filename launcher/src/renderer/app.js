/* Launcherens brugerflade. Alt der rører login, filer og spil sker i hovedprocessen; her tegnes kun. */
(function () {
  'use strict';
  const ww = window.ww, t = (k, v) => I18N.t(k, v);
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MARK = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 5C6 10 6 22 11 27"/><path d="M21 5c5 5 5 17 0 22"/><circle cx="16" cy="16" r="2.7"/></svg>';
  const ICON = {
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    dots: '<svg class="ico" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
    folder: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    wrench: '<svg class="ico" viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.3-.6-.6-2.3z"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    play: '<svg class="ico" viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M7 4.5v15l13-7.5z"/></svg>'
  };

  const S = { info: null, auth: { status: 'loading' }, catalog: null, games: {}, sel: null, view: 'game', settings: null, update: null, authMode: 'login', menu: false, confirm: false, progress: {} };
  const gameOf = id => S.catalog.games.find(g => g.id === id);

  // ---------- formater ----------
  const nf = (n, d = 0) => new Intl.NumberFormat(I18N.lang === 'da' ? 'da-DK' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
  function bytes(n) { n = n || 0; if (n >= 1e9) return nf(n / 1e9, 1) + ' GB'; if (n >= 1e6) return nf(n / 1e6, n >= 1e8 ? 0 : 1) + ' MB'; if (n >= 1e3) return nf(n / 1e3, 0) + ' KB'; return nf(n) + ' B'; }
  function eta(sec) { if (!isFinite(sec) || sec <= 0) return ''; if (sec < 60) return Math.ceil(sec) + ' s'; if (sec < 3600) return Math.ceil(sec / 60) + ' min'; return nf(sec / 3600, 1) + ' t'; }
  function ago(ts) {
    if (!ts) return t('meta.never');
    const d = Math.floor((Date.now() - ts) / 864e5);
    return d <= 0 ? t('ago.today') : d === 1 ? t('ago.yesterday') : t('ago.days', { n: d });
  }
  function playtime(sec) { if (!sec) return t('meta.none'); const m = Math.round(sec / 60); return m < 60 ? t('time.min', { n: Math.max(1, m) }) : t('time.hm', { h: Math.floor(m / 60), m: m % 60 }); }
  const errMsg = e => WW.explain(e, I18N.lang);

  function toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3600);
  }

  // ---------- start ----------
  async function start() {
    S.info = await ww.app.info(); S.settings = await ww.settings.get();
    I18N.set(I18N.resolve(S.settings.lang, S.info.locale));
    document.body.dataset.platform = ww.platform;
    S.catalog = await ww.catalog.get();
    (await ww.games.list()).forEach(e => { S.games[e.id] = e; });
    S.sel = S.catalog.games[0] && S.catalog.games[0].id;
    S.auth = await ww.auth.state();
    S.update = await ww.app.updateState();

    ww.auth.onChange(s => { const was = S.auth.status; S.auth = s; if (was !== s.status) route(); else { if (S.auth.status === 'signed-in') { renderRail(); renderBanner(); if (S.view === 'settings') renderSettings(); } } });
    ww.catalog.onChange(c => { S.catalog = c; if (S.auth.status === 'signed-in') renderShell(); });
    ww.games.onState(e => { S.games[e.id] = e; if (S.auth.status !== 'signed-in') return; renderRail(); if (S.view === 'game' && S.sel === e.id) renderDynamic(); });
    ww.games.onProgress(p => { S.progress[p.id] = p; if (S.view === 'game' && S.sel === p.id) paintProgress(p); updateRailProgress(p); });
    ww.app.onUpdate(u => { S.update = u; renderBanner(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if ($('.lightbox')) $('.lightbox').remove(); else if (S.menu) { S.menu = false; renderDynamic(); } }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { S.view = 'settings'; renderShell(); }
    });
    if (S.auth.status !== 'loading') route();
  }

  // ---------- hovedruten ----------
  let sphere = null;
  function route() {
    const app = $('#app');
    if (sphere) { sphere.destroy(); sphere = null; }
    if (S.auth.status === 'signed-in') { renderShell(); ww.games.check().catch(() => {}); }
    else if (S.auth.status === 'signed-out') mountAuth(app);
    else return;
    $('#boot').classList.add('out');
  }

  // =====================================================================================================================
  // LOGIN
  // =====================================================================================================================
  function mountAuth(root) {
    root.innerHTML = `<section class="auth">
      <aside class="auth-art"><canvas></canvas>
        <div class="auth-brand nodrag">${MARK}<span class="wm">Worldwide<i>(Studios)</i></span></div>
        <div class="auth-side"><h2>${esc(t('auth.side'))}</h2><p class="mono">(kivi studios)</p></div>
      </aside>
      <div class="auth-panel"><div class="auth-form" id="authForm"></div></div>
      <div class="notice" id="authNotice"></div>
    </section>`;
    sphere = WWSphere.create($('canvas', root), { radius: 0.34, center: [0.5, 0.46], tilt: 0.38, yaw: 3.2 });
    S.authMode = 'login'; drawAuthForm();
    $('#authNotice').textContent = S.info.dev ? S.info.api.replace(/^https?:\/\//, '') : '';
  }

  function field(id, type, label, extra = '') {
    return `<div class="field"><input id="${id}" type="${type}" placeholder=" " autocomplete="${extra || 'off'}" spellcheck="false"><label for="${id}">${esc(label)}</label>${type === 'password' ? `<button type="button" class="eye" data-act="eye" data-for="${id}" tabindex="-1">${esc(t('auth.show'))}</button>` : ''}</div>`;
  }

  function drawAuthForm() {
    const f = $('#authForm'), m = S.authMode;
    if (m === 'login' || m === 'register') {
      const reg = m === 'register';
      f.innerHTML = `<div class="tabs ${reg ? 'reg' : ''}" id="tabs"><span class="pill"></span><button type="button" data-act="mode" data-m="login" class="${reg ? '' : 'on'}">${esc(t('auth.tab.login'))}</button><button type="button" data-act="mode" data-m="register" class="${reg ? 'on' : ''}">${esc(t('auth.tab.register'))}</button></div>
        <form id="authSubmit" novalidate>
          <div class="collapse ${reg ? 'open' : ''}" id="nameWrap"><div>${field('fName', 'text', t('auth.name'), 'nickname')}<div class="hint" style="margin:-6px 4px 14px;font-size:12px;color:var(--dim)">${esc(t('auth.nameHint'))}</div></div></div>
          ${field('fEmail', 'email', t('auth.email'), 'email')}
          ${field('fPass', 'password', t('auth.password'), reg ? 'new-password' : 'current-password')}
          ${reg ? `<div class="hint" style="margin:-6px 4px 14px;font-size:12px;color:var(--dim)">${esc(t('auth.passHint'))}</div>` : ''}
          <div id="authMsg"></div>
          ${reg ? '' : `<div class="row"><span></span>${S.auth.features && S.auth.features.passwordReset ? `<button type="button" class="link" data-act="forgot">${esc(t('auth.forgot'))}</button>` : ''}</div>`}
          <button class="btn primary block" id="authBtn" type="submit">${esc(t(reg ? 'auth.submit.register' : 'auth.submit.login'))}</button>
        </form>`;
      $('#authSubmit').addEventListener('submit', submitAuth);
      setTimeout(() => { const el = $(reg ? '#fName' : '#fEmail'); el && el.focus(); }, 60);
    } else if (m === 'forgot') {
      f.innerHTML = `<h1 class="auth-title">${esc(t('auth.forgot.title'))}</h1><p class="auth-text">${esc(t('auth.forgot.text'))}</p>
        <form id="forgotForm" novalidate>${field('fEmail', 'email', t('auth.email'), 'email')}
          <div id="resetFields" hidden>${field('fCode', 'text', t('auth.code'), 'one-time-code')}${field('fPass', 'password', t('auth.newPassword'), 'new-password')}</div>
          <div id="authMsg"></div>
          <button class="btn primary block" id="authBtn" type="submit">${esc(t('auth.forgot.send'))}</button>
          <div class="row" style="justify-content:center;margin-top:18px"><button type="button" class="link" data-act="mode" data-m="login">${esc(t('auth.back'))}</button></div>
        </form>`;
      $('#forgotForm').addEventListener('submit', submitForgot);
      setTimeout(() => $('#fEmail') && $('#fEmail').focus(), 60);
    }
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; }
    else btn.innerHTML = btn.dataset.l || label || btn.innerHTML;
  }
  function authError(msg) {
    const box = $('#authMsg'); box.innerHTML = `<div class="err">${esc(msg)}</div>`;
    const f = $('#authForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  }
  function errWithWait(e) { return e.code === 'rate_limited' && e.retryAfter ? `${errMsg(e)} (${Math.ceil(e.retryAfter / 60)} min)` : errMsg(e); }

  async function submitAuth(ev) {
    ev.preventDefault();
    const reg = S.authMode === 'register', email = $('#fEmail').value.trim(), pass = $('#fPass').value, name = reg ? $('#fName').value.trim() : '';
    const btn = $('#authBtn');
    if (!email || !pass) return authError(t(!email ? 'auth.email' : 'auth.password') + ' ' + (I18N.lang === 'da' ? 'mangler.' : 'is missing.'));
    if (reg) {
      if (name.length < 2 || name.length > 14) return authError(errMsg({ code: 'invalid_name' }));
      if (pass.length < 8) return authError(errMsg({ code: 'weak_password' }));
    }
    busy(btn, true);
    try { await (reg ? ww.auth.register(email, pass, name) : ww.auth.login(email, pass)); }
    catch (e) { busy(btn, false); authError(errWithWait(e)); }
  }

  async function submitForgot(ev) {
    ev.preventDefault();
    const email = $('#fEmail').value.trim(), btn = $('#authBtn'), step2 = !$('#resetFields').hidden;
    busy(btn, true);
    try {
      if (!step2) {
        await ww.auth.forgot(email);
        $('#resetFields').hidden = false; $('#authMsg').innerHTML = `<div class="ok">${esc(t('auth.forgot.sent'))}</div>`;
        busy(btn, false); btn.textContent = t('auth.reset.save'); $('#fCode').focus();
      } else {
        const pass = $('#fPass').value;
        await ww.auth.reset(email, $('#fCode').value.trim(), pass);
        await ww.auth.login(email, pass);
      }
    } catch (e) { busy(btn, false); authError(errWithWait(e)); }
  }

  // =====================================================================================================================
  // SKAL: venstre side + hovedområde
  // =====================================================================================================================
  function renderShell() {
    if (sphere) { sphere.destroy(); sphere = null; }
    $('#app').innerHTML = `<div class="shell">
      <aside class="rail"><div class="rail-top">${MARK}<span class="wm">Worldwide<i>(Studios)</i></span></div>
        <div class="rail-label">${esc(t('nav.library'))}</div><nav class="games" id="games"></nav>
        <div class="rail-foot"><button class="me nodrag" data-act="settings" id="me"></button><button class="gear nodrag" data-act="settings" id="gear" title="${esc(t('nav.settings'))}">${ICON.gear}</button></div>
      </aside>
      <main class="main" id="main"></main></div>`;
    renderRail(); renderBanner();
    if (S.view === 'settings') renderSettings(); else renderGame();
  }

  function statusLine(g, e) {
    if (!e) return '';
    if (['installing', 'updating', 'repairing'].includes(e.status)) {
      const p = S.progress[g.id]; const pct = p && p.total ? Math.min(99, Math.floor(p.done / p.total * 100)) : 0;
      return `${t('status.' + e.status)}${p && p.phase === 'download' ? ' ' + pct + '%' : ''}`;
    }
    if (e.dev) return t('chip.dev');
    return t('status.' + e.status);
  }
  const stClass = e => !e ? '' : ['installing', 'updating', 'repairing'].includes(e.status) ? 'busy' : e.status === 'ready' ? 'ready' : e.status === 'update' ? 'update' : e.status === 'running' ? 'running' : '';

  function renderRail() {
    const list = $('#games'); if (!list) return;
    list.innerHTML = S.catalog.games.map(g => {
      const e = S.games[g.id];
      return `<button class="g nodrag ${S.view === 'game' && S.sel === g.id ? 'sel' : ''}" data-act="select" data-id="${esc(g.id)}">
        <span class="th" style="background-image:url(art/${esc(g.art.card)})"></span>
        <span><span class="n">${esc(g.name)}</span><span class="s ${e && e.status === 'update' ? 'hot' : ''}" data-rs="${esc(g.id)}">${esc(statusLine(g, e))}</span></span>
        <i class="st ${stClass(e)}"></i></button>`;
    }).join('');
    const u = S.auth.user;
    $('#me').innerHTML = `<span class="avatar">${esc((u && u.displayName || '?').slice(0, 1).toUpperCase())}</span><span style="min-width:0"><span class="nm" style="display:block">${esc(u ? u.displayName : '')}</span><span class="sub"><i class="${S.auth.offline ? 'off' : ''}"></i>${esc(S.auth.offline ? 'offline' : 'online')}</span></span>`;
    $('#gear').classList.toggle('on', S.view === 'settings');
  }
  function updateRailProgress(p) {
    const el = $(`[data-rs="${p.id}"]`); if (!el) return;
    const e = S.games[p.id]; if (e) el.textContent = statusLine(gameOf(p.id), e);
  }

  function renderBanner() {
    const main = $('#main'); if (!main) return;
    let b = $('#banner');
    const u = S.update, off = S.auth.offline;
    let html = '';
    if (u && u.state === 'ready') html = `<div class="banner">${esc(t('update.ready', { v: u.version }))}<button class="btn sm primary" data-act="applyUpdate">${esc(t('update.restart'))}</button></div>`;
    else if (u && u.state === 'manual') html = `<div class="banner">${esc(t('update.manual', { v: u.version }))}<button class="btn sm primary" data-act="applyUpdate">${esc(t('update.get'))}</button></div>`;
    else if (off) html = `<div class="banner warn">${esc(t('offline.banner'))}</div>`;
    if (!b) { b = document.createElement('div'); b.id = 'banner'; main.prepend(b); }
    b.innerHTML = html;
  }

  // ---------- spilsiden ----------
  function splitTitle(name) {
    let i = 0;
    return name.split(' ').map(w => `<span class="w">${[...w].map(ch => `<span class="c" style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>`).join('');
  }

  function renderGame() {
    const main = $('#main'), g = gameOf(S.sel); if (!g) return;
    const banner = $('#banner');
    main.innerHTML = '<div id="banner"></div>' + `<section class="game" id="gameView">
      <div class="hero"><img src="art/${esc(g.art.hero)}" alt="" id="heroImg"></div>
      <div class="head">
        <div class="eyebrow"><span>(${esc((S.catalog.studios.find(s => s.id === g.studio) || {}).name || '').replace(/[()]/g, '')})</span><span class="chip ${g.status === 'in-development' ? 'wip' : ''}" id="chip"></span></div>
        <h1 class="title" aria-label="${esc(g.name)}">${splitTitle(g.name)}</h1>
        <p class="tag">${esc(I18N.pick(g.tagline))}</p>
        <div id="dyn"></div>
      </div>
      <div class="body">
        <div><p class="desc">${esc(I18N.pick(g.description))}</p>
          <dl class="facts">${g.facts.map(f => `<div><dt>${esc(I18N.pick(f.k))}</dt><dd>${esc(I18N.pick(f.v))}</dd></div>`).join('')}</dl></div>
        <div><h3 class="sec">${esc(t('game.shots'))}</h3><div class="shots">${g.art.shots.map((s, i) => `<button class="nodrag" data-act="shot" data-i="${i}"><img src="art/${esc(s.replace('.webp', '-sm.webp'))}" alt="" loading="lazy"></button>`).join('')}</div>
          <div class="stat" id="stat"></div></div>
      </div></section>`;
    renderBanner(); renderDynamic();
    main.scrollTop = 0; setupParallax();
  }

  function renderDynamic() {
    const g = gameOf(S.sel), e = S.games[S.sel], dyn = $('#dyn'); if (!g || !e || !dyn) return;
    const chip = $('#chip');
    chip.className = 'chip ' + (e.dev ? 'dev' : g.status === 'in-development' ? 'wip' : '');
    chip.innerHTML = `<i></i>${esc(t(e.dev ? 'chip.dev' : 'chip.' + g.status))}`;

    const busyNow = ['installing', 'updating', 'repairing'].includes(e.status);
    let html = '';
    if (busyNow) {
      html = `<div class="actions"><div class="prog" id="prog"><div class="prog-top"><b id="pPct">0%</b><span id="pPhase">${esc(t('phase.prepare'))}</span></div><div class="bar ind" id="pBar"><i></i></div><div class="prog-meta"><span id="pDone"></span><span id="pEta"></span></div></div>
        <button class="btn" data-act="cancel">${esc(t('btn.cancel'))}</button></div>`;
    } else {
      const main = {
        'ready': `<button class="btn primary big" data-act="play">${ICON.play}${esc(t('btn.play'))}</button>`,
        'update': `<button class="btn primary big" data-act="install">${esc(t('btn.update'))}</button><button class="btn big" data-act="play">${esc(t('btn.play'))}</button>`,
        'not-installed': `<button class="btn primary big" data-act="install">${esc(t('btn.install'))}</button>`,
        'running': `<button class="btn big" disabled><i class="pulse-dot" style="color:var(--acc)"></i>${esc(t('btn.running'))}</button>`,
        'unavailable': `<button class="btn big" disabled>${esc(t('btn.unavailable'))}</button>`
      }[e.status] || '';
      const canMenu = e.installed && !e.dev;
      html = `<div class="actions">${main}${canMenu ? `<button class="btn icon nodrag" data-act="menu" aria-label="Menu">${ICON.dots}</button>` : ''}
        ${S.menu && canMenu ? `<div class="menu"><button data-act="folder">${ICON.folder}${esc(t('menu.folder'))}</button><button data-act="repair">${ICON.wrench}${esc(t('menu.repair'))}</button><hr><button class="danger" data-act="uninstall">${ICON.trash}${esc(S.confirm ? t('menu.confirm') : t('menu.uninstall'))}</button></div>` : ''}</div>`;
      if (e.error) html += `<div class="err errbox">${esc(errText(e.error))}</div>`;
    }
    dyn.innerHTML = html;
    $('#stat').innerHTML = `<div><small>${esc(t('meta.version'))}</small><b>${esc(e.version ? (e.version.length > 14 ? e.version.slice(0, 14) : e.version) : t('meta.none'))}</b></div>
      <div><small>${esc(t('meta.size'))}</small><b>${e.size ? esc(bytes(e.size)) : esc(t('meta.none'))}</b></div>
      <div><small>${esc(t('meta.last'))}</small><b>${esc(ago(e.lastPlayed))}</b></div>
      <div><small>${esc(t('meta.time'))}</small><b>${esc(playtime(e.playSeconds))}</b></div>`;
    if (busyNow && S.progress[g.id]) paintProgress(S.progress[g.id]);
  }

  function errText(er) {
    if (er.code === 'no_space') return t('err.no_space', { size: bytes(er.needed || 0) || '' });
    if (er.code === 'no_build') return t('err.no_build');
    if (er.code === 'launch_failed') return t('err.launch_failed', { msg: er.message });
    return t('err.install_failed', { msg: er.message });
  }

  function paintProgress(p) {
    const bar = $('#pBar'); if (!bar) return;
    const known = p.total > 0 && p.phase === 'download';
    bar.classList.toggle('ind', !known);
    if (known) {
      const pct = Math.min(100, p.done / p.total * 100);
      bar.firstElementChild.style.setProperty('--p', pct + '%'); bar.firstElementChild.style.width = pct + '%';
      $('#pPct').textContent = Math.floor(pct) + '%';
      $('#pDone').textContent = t('progress.of', { a: bytes(p.done), b: bytes(p.total) });
      const left = p.speed > 0 ? (p.total - p.done) / p.speed : 0;
      $('#pEta').textContent = p.speed > 0 ? `${bytes(p.speed)}/s · ${t('progress.left', { t: eta(left) })}` : '';
    } else { $('#pPct').textContent = ''; $('#pDone').textContent = ''; $('#pEta').textContent = ''; bar.firstElementChild.style.width = ''; }
    $('#pPhase').textContent = t('phase.' + p.phase);
  }

  let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
  function setupParallax() {
    const main = $('#main'), img = $('#heroImg'); if (!main || !img) return;
    main.onmousemove = e => { const r = main.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * -22; ty = ((e.clientY - r.top) / r.height - 0.5) * -14; if (!raf) raf = requestAnimationFrame(tickPar); };
    function tickPar() {
      px += (tx - px) * 0.08; py += (ty - py) * 0.08;
      const im = $('#heroImg'); if (im) im.style.translate = `${px.toFixed(2)}px ${py.toFixed(2)}px`;
      raf = (Math.abs(tx - px) > 0.05 || Math.abs(ty - py) > 0.05) ? requestAnimationFrame(tickPar) : 0;
    }
  }

  // =====================================================================================================================
  // INDSTILLINGER
  // =====================================================================================================================
  function renderSettings() {
    const main = $('#main'), u = S.auth.user, st = S.settings, nat = S.catalog.games.filter(g => g.package.kind === 'native');
    const keep = $('#panel') ? $('#panel').dataset.open : '';
    main.innerHTML = '<div id="banner"></div>' + `<section class="set"><h1>${esc(t('set.title'))}</h1>
      <div class="card"><h3>${esc(t('set.account'))}</h3>
        <div class="line"><span class="k">${esc(t('set.name'))}</span><span class="v">${esc(u.displayName)}</span></div>
        <div class="line"><span class="k">${esc(t('set.email'))}</span><span class="v">${esc(u.email || '')}</span></div>
        <div class="btns"><button class="btn sm" data-act="panel" data-p="rename">${esc(t('set.rename'))}</button><button class="btn sm" data-act="panel" data-p="password">${esc(t('set.changePw'))}</button><button class="btn sm" data-act="export">${esc(t('set.export'))}</button><button class="btn sm" data-act="logout">${esc(t('set.logout'))}</button><button class="btn sm danger" data-act="panel" data-p="delete">${esc(t('set.delete'))}</button></div>
        <div id="panel" data-open=""></div></div>
      <div class="card"><h3>${esc(t('set.language'))}</h3><div class="seg">${['auto', 'da', 'en'].map(l => `<button data-act="lang" data-l="${l}" class="${st.lang === l ? 'on' : ''}">${esc(t('set.lang.' + l))}</button>`).join('')}</div></div>
      <div class="card"><h3>${esc(t('set.install'))}</h3>
        <div class="line"><span class="k">${esc(t('set.folder'))}<small>${esc(t('set.folderNote'))}</small></span><span class="v"><span class="path">${esc(st.gamesDir || t('set.default'))}</span></span></div>
        <div class="btns"><button class="btn sm" data-act="pickDir">${esc(t('set.change'))}</button>${st.gamesDir ? `<button class="btn sm" data-act="resetDir">${esc(t('set.default'))}</button>` : ''}</div></div>
      <div class="card"><h3>${esc(t('set.updates'))}</h3>
        <div class="line"><span class="k">${esc(t('set.autoUpdate'))}<small>${esc(t('set.autoUpdateNote'))}</small></span><button class="switch ${st.autoUpdate ? 'on' : ''}" data-act="autoUpdate" aria-pressed="${!!st.autoUpdate}"></button></div>
        <div class="btns"><button class="btn sm" data-act="checkUpdates">${esc(t('set.check'))}</button></div></div>
      <div class="card"><h3>${esc(t('set.dev'))}</h3>
        <div class="line"><span class="k">${esc(t('set.devEnable'))}<small>${esc(t('set.devNote'))}</small></span><button class="switch ${st.dev.enabled ? 'on' : ''}" data-act="devToggle" aria-pressed="${!!st.dev.enabled}"></button></div>
        ${st.dev.enabled ? S.catalog.games.map(g => `<div class="line"><span class="k">${esc(g.name)}<small class="path">${esc(st.dev.links[g.id] || '–')}</small></span><span class="btns" style="margin:0"><button class="btn sm" data-act="devPick" data-id="${esc(g.id)}">${esc(t('set.devPick'))}</button>${st.dev.links[g.id] ? `<button class="btn sm" data-act="devClear" data-id="${esc(g.id)}">×</button>` : ''}</span></div>`).join('') : ''}
        ${st.dev.enabled && nat.length ? `<div class="line"><span class="k">${esc(t('set.devGodot'))}<small class="path">${esc(st.dev.godot || 'Godot')}</small></span><button class="btn sm" data-act="devGodot">${esc(t('set.devPick'))}</button></div>` : ''}</div>
      <div class="card"><h3>${esc(t('set.about'))}</h3>
        <div class="line"><span class="k">${esc(t('set.version'))}</span><span class="v">${esc(S.info.version)} · ${esc(S.info.platform)} ${esc(S.info.arch)}</span></div>
        <div class="line"><span class="k">${esc(t('set.server'))}</span><span class="v mono" style="font-size:12.5px">${esc(S.info.api)}</span></div>
        <div class="line"><span class="k">${esc(t('set.keychain'))}</span><span class="v">${esc(t(S.info.secureStorage ? 'set.keychain.yes' : 'set.keychain.no'))}</span></div></div>
    </section>`;
    renderBanner(); main.scrollTop = 0;
  }

  function openPanel(kind) {
    const p = $('#panel'); if (p.dataset.open === kind) { p.innerHTML = ''; p.dataset.open = ''; return; }
    p.dataset.open = kind;
    const form = {
      rename: `<div class="inline-form">${field('pName', 'text', t('set.name'))}<div id="pMsg"></div><div class="btns"><button class="btn sm primary" data-act="doRename">${esc(t('set.save'))}</button><button class="btn sm" data-act="panel" data-p="rename">${esc(t('set.cancel'))}</button></div></div>`,
      password: `<div class="inline-form">${field('pCur', 'password', t('set.currentPw'))}${field('pNew', 'password', t('set.newPw'))}<div id="pMsg"></div><div class="btns"><button class="btn sm primary" data-act="doPassword">${esc(t('set.save'))}</button><button class="btn sm" data-act="panel" data-p="password">${esc(t('set.cancel'))}</button></div></div>`,
      delete: `<div class="inline-form"><p style="color:var(--mut);margin-bottom:12px">${esc(t('set.deleteText'))}</p>${field('pDel', 'password', t('auth.password'))}<div id="pMsg"></div><div class="btns"><button class="btn sm danger" data-act="doDelete">${esc(t('set.deleteGo'))}</button><button class="btn sm" data-act="panel" data-p="delete">${esc(t('set.cancel'))}</button></div></div>`
    }[kind];
    p.innerHTML = form;
    const first = $('input', p); if (first) { if (kind === 'rename') first.value = S.auth.user.displayName; first.focus(); first.select && first.select(); }
  }
  const pErr = e => { const m = $('#pMsg'); if (m) m.innerHTML = `<div class="err">${esc(errWithWait(e))}</div>`; };

  // =====================================================================================================================
  // KLIK
  // =====================================================================================================================
  document.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-act]');
    if (!el) { if (S.menu) { S.menu = false; if (S.view === 'game') renderDynamic(); } return; }
    const act = el.dataset.act, id = el.dataset.id || S.sel;
    try {
      switch (act) {
        case 'mode': S.authMode = el.dataset.m; drawAuthForm(); break;
        case 'forgot': S.authMode = 'forgot'; drawAuthForm(); break;
        case 'eye': { const i = $('#' + el.dataset.for); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.textContent = t(show ? 'auth.hide' : 'auth.show'); break; }
        case 'select': S.view = 'game'; S.sel = id; S.menu = false; S.confirm = false; renderRail(); renderGame(); break;
        case 'settings': S.view = 'settings'; renderRail(); renderSettings(); break;
        case 'install': await ww.games.install(id); break;
        case 'cancel': await ww.games.cancel(id); break;
        case 'play': await ww.games.play(id); break;
        case 'menu': ev.stopPropagation(); S.menu = !S.menu; S.confirm = false; renderDynamic(); break;
        case 'folder': S.menu = false; renderDynamic(); await ww.games.reveal(id); break;
        case 'repair': S.menu = false; renderDynamic(); await ww.games.repair(id); break;
        case 'uninstall':
          ev.stopPropagation();
          if (!S.confirm) { S.confirm = true; renderDynamic(); setTimeout(() => { if (S.confirm) { S.confirm = false; renderDynamic(); } }, 3500); }
          else { S.confirm = false; S.menu = false; await ww.games.uninstall(id); }
          break;
        case 'shot': {
          const g = gameOf(S.sel), lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="art/${esc(g.art.shots[+el.dataset.i])}" alt="">`;
          lb.onclick = () => lb.remove(); document.body.appendChild(lb); break;
        }
        case 'applyUpdate': await ww.app.applyUpdate(); break;
        // indstillinger
        case 'panel': openPanel(el.dataset.p); break;
        case 'doRename': { try { await ww.auth.rename($('#pName').value.trim()); toast(t('set.renamed')); renderSettings(); } catch (e) { pErr(e); } break; }
        case 'doPassword': { try { await ww.auth.changePassword($('#pCur').value, $('#pNew').value); toast(t('set.pwChanged')); renderSettings(); } catch (e) { pErr(e); } break; }
        case 'doDelete': { try { await ww.auth.remove($('#pDel').value); } catch (e) { pErr(e); } break; }
        case 'export': if (await ww.auth.exportData()) toast(t('set.exported')); break;
        case 'logout': S.view = 'game'; await ww.auth.logout(); break;
        case 'lang': S.settings = await ww.settings.set({ lang: el.dataset.l }); I18N.set(I18N.resolve(S.settings.lang, S.info.locale)); renderShell(); break;
        case 'pickDir': { const d = await ww.settings.pickDir(); if (d) { S.settings = await ww.settings.set({ gamesDir: d }); renderSettings(); } break; }
        case 'resetDir': S.settings = await ww.settings.set({ gamesDir: null }); renderSettings(); break;
        case 'autoUpdate': S.settings = await ww.settings.set({ autoUpdate: !S.settings.autoUpdate }); renderSettings(); break;
        case 'checkUpdates': await ww.games.check(); toast(t('set.checked')); break;
        case 'devToggle': S.settings = await ww.settings.set({ dev: { enabled: !S.settings.dev.enabled } }); renderSettings(); break;
        case 'devPick': { const d = await ww.settings.pickDir(); if (d) { S.settings = await ww.settings.set({ dev: { links: { ...S.settings.dev.links, [id]: d } } }); renderSettings(); } break; }
        case 'devClear': { const l = { ...S.settings.dev.links }; delete l[id]; S.settings = await ww.settings.set({ dev: { links: l } }); renderSettings(); break; }
        case 'devGodot': { const d = await ww.settings.pickDir(); if (d) { S.settings = await ww.settings.set({ dev: { godot: d.endsWith('.app') ? d + '/Contents/MacOS/Godot' : d } }); renderSettings(); } break; }
      }
    } catch (e) {
      if (act === 'play' || act === 'install') { toast(e.code === 'unauthorized' ? errMsg(e) : t('err.generic', { msg: e.message })); }
      else toast(e.message);
    }
  });

  // Enter i tekstfelter i indstillingspanelerne
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
    const p = ev.target.closest('#panel'); if (!p) return;
    const b = $('.btn.primary, .btn.danger', p); if (b) b.click();
  });

  start().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:20px;color:#ff7f6b;z-index:999">${esc(e.stack || e)}</pre>`); });
})();
