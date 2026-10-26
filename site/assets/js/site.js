/* Worldwide (Studios) · hjemmesiden
   1. sprog  2. download  3. animation (GSAP, ScrollTrigger, SplitText, Lenis)  4. markøren  5. billedvisning
   Går noget galt med animationerne, vises siden stadig, bare uden dem. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const REPO = 'linbatkivi/worldwide-studios';

  // =================================================================================================================
  // 1. SPROG
  // =================================================================================================================
  const EN = {
    'skip': 'Skip to the games',
    'nav.games': 'Games', 'nav.studios': 'Studios', 'nav.launcher': 'Launcher', 'nav.get': 'Get the launcher',
    'hero.kind': 'Game studio', 'hero.sub': 'One game is done. One is on its way.', 'hero.scroll': 'Scroll',
    'chip.out': 'Released', 'chip.wip': 'In development',
    'manifest': 'Worldwide (Studios) is a small game studio. One game is finished and one is on its way, and both live in the same launcher. You make one account and it works in all of them.',
    'games.title': 'Games',
    'wd.kind': 'Tactical multiplayer FPS',
    'wd.desc': 'SWAT versus Hijackers. Every round opens with a buy phase, then the bomb has to be planted and defended. Five on five, three maps, and you host your own matches so there is no server to wait for.',
    'wd.f1': '5 v 5, bots fill the gaps', 'f.teams': 'Teams', 'f.maps': 'Maps', 'f.on': 'Runs on',
    'cta.get': 'Get the launcher',
    'cx.kind': 'Social sports hub',
    'cx.desc': 'A sports centre you can walk around in. Tennis is playable today, against the computer or two on one keyboard. Bowling, volleyball and badminton follow, all in one neighbourhood without loading screens.',
    'cx.f1': 'Tennis', 'cx.f2': 'The neighbourhood, bowling, volleyball', 'f.engine': 'Engine', 'f.now': 'Playable now', 'f.next': 'Next',
    'studios.title': 'The studios',
    'studios.a': 'What holds it together: the launcher, the account and this site.',
    'studios.b': 'The sub-studio where the games are made. White Dust and Complex both come from here.',
    'l.kicker': 'Launcher', 'l.title': 'One launcher.',
    'l.text': 'Create an account, install the games and keep them updated from one place. Your progress follows the account, even if you switch computers.',
    'l.s1': 'Download and open the launcher', 'l.s2': 'Create an account, or sign in', 'l.s3': 'Pick a game and press Install',
    'l.get': 'Get the launcher',
    'foot.privacy': 'Privacy', 'foot.top': 'Back to top'
  };
  const NOTE = {
    da: { mac: 'Appen er ikke signeret hos Apple endnu. Første gang: højreklik på den og vælg Åbn.', win: 'Windows kan vise en advarsel om en ukendt udgiver. Vælg Mere info og derefter Kør alligevel.', linux: 'Gør filen kørbar (højreklik, Egenskaber, Tilladelser), og åbn den.', any: '' },
    en: { mac: 'The app is not signed with an Apple certificate yet. The first time: right click it and choose Open.', win: 'Windows may warn about an unknown publisher. Choose More info, then Run anyway.', linux: 'Make the file executable (right click, Properties, Permissions) and open it.', any: '' }
  };
  const DA = {}; $$('[data-i]').forEach(el => { DA[el.dataset.i] = el.textContent; });
  let lang = store.get('ww-lang') || (/^da\b/i.test(navigator.language || '') ? 'da' : 'en');
  root.lang = lang;
  if (lang === 'en') $$('[data-i]').forEach(el => { if (EN[el.dataset.i]) el.textContent = EN[el.dataset.i]; });
  const t = key => (lang === 'en' ? EN[key] : DA[key]) || DA[key] || '';
  $('#lang').addEventListener('click', () => {
    store.set('ww-lang', lang === 'da' ? 'en' : 'da');
    try { sessionStorage.setItem('ww-intro', '1'); } catch (e) {}
    location.reload();
  });

  // =================================================================================================================
  // 2. DOWNLOAD
  // =================================================================================================================
  const BASE = `https://github.com/${REPO}/releases/latest/download/`;
  const ASSET = { mac: 'Worldwide-macOS.dmg', win: 'Worldwide-Setup.exe', linux: 'Worldwide-Linux.AppImage' };
  const NAME = { mac: 'macOS', win: 'Windows', linux: 'Linux' };
  function detectOS() {
    const ua = navigator.userAgent || '', p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/android|iphone|ipad|ipod/i.test(ua)) return null;
    if (/mac/i.test(p) || /Mac OS X/.test(ua)) return 'mac';
    if (/win/i.test(p)) return 'win';
    if (/linux|x11|cros/i.test(p + ua)) return 'linux';
    return null;
  }
  const os = detectOS();
  const dlMain = $('#dlMain'), dlOther = $('#dlOther'), dlLabel = $('#dlLabel'), dlNote = $('#dlNote');
  if (os) {
    dlMain.href = BASE + ASSET[os];
    dlLabel.textContent = (lang === 'en' ? 'Download for ' : 'Hent til ') + NAME[os];
    dlNote.textContent = NOTE[lang][os];
  }
  const others = Object.keys(ASSET).filter(k => k !== os);
  dlOther.innerHTML = (os ? '' : '') + others.map(k => `<a href="${BASE + ASSET[k]}" data-cursor>${NAME[k]}</a>`).join('');
  // versionsnummer, hvis GitHub svarer
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then(r => r.ok ? r.json() : null).then(j => {
    if (j && j.tag_name) dlOther.insertAdjacentHTML('afterbegin', `<span style="margin-right:16px">${String(j.tag_name).replace(/^launcher-/, '')}</span>`);
  }).catch(() => {});

  // =================================================================================================================
  // 3. ANIMATION
  // =================================================================================================================
  if (!window.gsap || !window.ScrollTrigger || !window.SplitText) { root.classList.add('nogsap'); return; }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const calm = reduce;
  if (calm) root.classList.add('nogsap');

  // jævn scroll
  let lenis = null;
  if (!calm && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollToEl = (target, opts) => lenis ? lenis.scrollTo(target, Object.assign({ duration: 1.5, easing: x => 1 - Math.pow(1 - x, 4) }, opts)) : (target === 0 ? window.scrollTo({ top: 0, behavior: 'smooth' }) : target.scrollIntoView({ behavior: 'smooth' }));
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const el = $(id); if (!el) return; e.preventDefault(); scrollToEl(id === '#top' ? 0 : el);
  }));
  $('#toTop').addEventListener('click', () => scrollToEl(0));

  // navigation: skjules når man scroller ned, kommer tilbage opad
  const nav = $('#nav'); let lastY = 0;
  const onScroll = y => {
    nav.classList.toggle('solid', y > 40);
    nav.classList.toggle('hide', y > 220 && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove('hide');
    lastY = y;
  };
  if (lenis) lenis.on('scroll', e => onScroll(e.scroll)); else addEventListener('scroll', () => onScroll(scrollY), { passive: true });

  // kuglen i toppen
  const cv = $('#sphere');
  const sphereOpts = () => innerWidth <= 980 ? { radius: 0.42, center: [0.5, 0.3] } : { radius: 0.35, center: [0.68, 0.46] };
  const sphere = WWSphere.create(cv, Object.assign({ tilt: 0.4, yaw: 3.3 }, sphereOpts()));
  addEventListener('resize', () => sphere.set(sphereOpts()));

  // ---------- opdeling i bogstaver og ord ----------
  const splits = [];
  const split = (el, type, extra) => { const s = SplitText.create(el, Object.assign({ type, charsClass: 'ch', wordsClass: 'w', aria: 'auto' }, extra)); splits.push(s); return s; };
  const wm = $('#wordmark');
  const wmChars = [];
  $$('[data-chars]', wm).forEach(el => { const s = split(el, 'chars'); s.chars.forEach(c => wmChars.push({ el: c, line: el.closest('.wm-b') ? 'b' : 'a', par: el.classList.contains('par') })); });
  gsap.set(wm, { visibility: 'visible' });
  const titles = $$('.sec-title, .game-name, .l-title').map(el => ({ el, s: split(el, 'words,chars', { mask: el.classList.contains('sec-title') ? undefined : 'chars' }) }));
  const mText = split($('#manifestText'), 'words');
  if (calm) { gsap.set(mText.words, { opacity: 1 }); }

  // ---------- intro ----------
  const intro = $('#intro'), seen = root.classList.contains('seen');
  function heroIn() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo(wmChars.map(c => c.el), { yPercent: 115, opacity: 0, fontStretch: '125%' }, { yPercent: 0, opacity: 1, fontStretch: '100%', duration: 1.5, stagger: 0.045 }, 0)
      .fromTo(cv, { opacity: 0, scale: 0.88 }, { opacity: 1, scale: 1, duration: 2.2, ease: 'power3.out' }, 0.1)
      .to($$('.hero [data-reveal]'), { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.5)
      .to(nav, { opacity: 1, duration: 0.9 }, 0.6);
    tl.call(() => { waveOn = true; }, null, 1.4);
    return tl;
  }
  gsap.set(cv, { opacity: 0 });
  if (seen || calm) {
    intro && intro.remove();
    heroIn();
  } else {
    root.classList.add('holding');
    const mk = $$('.intro-mark path'), dot = $('.intro-mark circle'), n = $('#introN');
    mk.forEach(p => { const l = p.getTotalLength(); gsap.set(p, { strokeDasharray: l, strokeDashoffset: l }); });
    gsap.set(dot, { scale: 0, transformOrigin: '50% 50%' });
    const o = { v: 0 };
    const tl = gsap.timeline({ onComplete: () => { try { sessionStorage.setItem('ww-intro', '1'); } catch (e) {} } });
    tl.to(mk, { strokeDashoffset: 0, duration: 0.9, ease: 'power3.inOut', stagger: 0.1 }, 0)
      .to(dot, { scale: 1, duration: 0.6, ease: 'back.out(3)' }, 0.55)
      .to(o, { v: 100, duration: 1.2, ease: 'power2.inOut', onUpdate: () => { n.textContent = String(Math.round(o.v)).padStart(3, '0'); } }, 0)
      .to(intro, { yPercent: -100, duration: 0.95, ease: 'expo.inOut' }, 1.35)
      .call(() => { root.classList.remove('holding'); heroIn(); }, null, 1.75)
      .call(() => intro.remove(), null, 2.4);
  }

  // ---------- bogstaverne i ordmærket trækker sig mod markøren ----------
  let waveOn = false, px = -9999, py = -9999;
  addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; }, { passive: true });
  let rects = [];
  const measure = () => { rects = wmChars.map(c => { const r = c.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + scrollY, w: r.width }; }); };
  const cur = wmChars.map(() => ({ s: 100, w: 0 }));
  wmChars.forEach((c, i) => { cur[i].w = c.line === 'a' ? 800 : 200; });
  let measured = false;
  gsap.ticker.add(time => {
    if (!waveOn || calm) return;
    if (scrollY > innerHeight * 1.1) return;
    if (!measured) { measure(); measured = true; }
    for (let i = 0; i < wmChars.length; i++) {
      const c = wmChars[i], r = rects[i]; if (!r) continue;
      const dx = px - r.x, dy = py - (r.y - scrollY), d = Math.hypot(dx, dy), infl = Math.max(0, 1 - d / 300), k = infl * infl;
      const baseW = c.line === 'a' ? 800 : 200, wave = Math.sin(time * 1.15 + i * 0.6);
      const ts = 100 + wave * 4 + k * 22, tw = baseW + (c.line === 'a' ? 100 : 320) * k + wave * (c.line === 'a' ? 20 : 30);
      const s = cur[i]; s.s += (ts - s.s) * 0.12; s.w += (tw - s.w) * 0.12;
      c.el.style.fontStretch = s.s.toFixed(1) + '%'; c.el.style.fontWeight = Math.round(s.w);
    }
  });
  addEventListener('resize', () => { measured = false; });
  document.fonts && document.fonts.ready.then(() => { measured = false; ScrollTrigger.refresh(); });

  // ---------- kuglen og ordmærket glider op, når man scroller ----------
  if (!calm) {
    gsap.to(cv, { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to(wm, { yPercent: -10, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });
  }

  // ---------- manifest: ordene tændes ét efter ét ----------
  if (!calm) gsap.to(mText.words, { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: '#manifestText', start: 'top 82%', end: 'bottom 52%', scrub: 0.4 } });

  // ---------- titler ----------
  titles.forEach(({ el, s }) => {
    if (calm) return;
    const isSec = el.classList.contains('sec-title');
    gsap.fromTo(s.chars, isSec ? { yPercent: 105 } : { yPercent: 110 }, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.04, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  // ---------- generelle fremtoninger ----------
  if (!calm) {
    $$('[data-reveal]').filter(el => !el.closest('.hero')).forEach(el => {
      gsap.to(el, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    $$('.game').forEach(g => {
      const frame = $('.game-frame', g), img = $('img', frame), info = $$('.game-info > *:not(.game-name)', g), chip = $('.game-chip', g);
      gsap.fromTo(frame, { clipPath: 'inset(0 0 100% 0 round 6px)' }, { clipPath: 'inset(0 0 0% 0 round 6px)', duration: 1.5, ease: 'expo.inOut', scrollTrigger: { trigger: g, start: 'top 72%', once: true } });
      gsap.fromTo(img, { scale: 1.3 }, { scale: 1, duration: 2, ease: 'expo.out', scrollTrigger: { trigger: g, start: 'top 72%', once: true } });
      gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.from(chip, { opacity: 0, y: 14, duration: 0.9, delay: 0.9, ease: 'expo.out', scrollTrigger: { trigger: g, start: 'top 72%', once: true } });
      gsap.from(info, { opacity: 0, y: 36, duration: 1.2, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger: g, start: 'top 66%', once: true } });
    });
  }

  // ---------- bånd med spilnavne, hurtigere når man scroller hurtigt ----------
  const strip = $('#strip');
  if (strip) {
    const set = ['White Dust', 'Complex', 'kivi studios', 'Worldwide'];
    const one = set.map(n => `<span><b class="p">(</b>${n}<b class="p">)</b></span>`).join('');
    strip.innerHTML = one + one + one + one;
    let x = 0, half = 0;
    const calc = () => { half = strip.scrollWidth / 2; };
    calc(); addEventListener('resize', calc); document.fonts && document.fonts.ready.then(calc);
    gsap.ticker.add((_, dt) => {
      if (calm) return;
      const v = lenis ? lenis.velocity : 0;
      x -= (0.06 + Math.abs(v) * 0.05) * dt * (v < 0 ? -1 : 1) * 1;
      if (half) { if (x <= -half) x += half; if (x > 0) x -= half; }
      strip.style.transform = `translate3d(${x}px,0,0)`;
    });
  }

  // ---------- studios: parenteserne åbner sig om navnet ----------
  const open = $('#open');
  if (open && !calm) {
    const ot = $('.open-t', open), oi = $('span', ot);
    gsap.fromTo(ot, { width: 0 }, { width: () => oi.offsetWidth + 6, ease: 'none', scrollTrigger: { trigger: open, start: 'top 88%', end: 'top 38%', scrub: 0.6, invalidateOnRefresh: true } });
    gsap.fromTo(oi, { opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)', ease: 'none', scrollTrigger: { trigger: open, start: 'top 70%', end: 'top 36%', scrub: 0.6 } });
  }

  // ---------- launcher-vinduet vipper med markøren ----------
  const win = $('#win'), wrap = $('#shotWrap');
  if (win && fine && !calm) {
    const rx = gsap.quickTo(win, 'rotationX', { duration: 0.8, ease: 'power3.out' }), ry = gsap.quickTo(win, 'rotationY', { duration: 0.8, ease: 'power3.out' });
    gsap.set(win, { rotationY: -7, rotationX: 3, transformPerspective: 1600 });
    wrap.addEventListener('pointermove', e => {
      const r = wrap.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      ry(-7 + nx * 12); rx(3 - ny * 10);
      const gl = $('#glare'); gl.style.setProperty('--gx', ((nx + 0.5) * 100) + '%'); gl.style.setProperty('--gy', ((ny + 0.5) * 100) + '%');
    });
    wrap.addEventListener('pointerleave', () => { ry(-7); rx(3); });
    gsap.fromTo(win, { y: 80 }, { y: -40, ease: 'none', scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: true } });
  }

  // ---------- fodens store navn åbner sig ----------
  const fb = $('#footBig');
  if (fb && !calm) ScrollTrigger.create({ trigger: fb, start: 'top bottom', end: 'bottom bottom', onUpdate: s => { fb.style.fontStretch = (74 + 30 * s.progress).toFixed(1) + '%'; } });

  // ---------- magnetiske knapper ----------
  if (fine && !calm) $$('[data-mag]').forEach(el => {
    const qx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' }), qy = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(e.clientX - cx, e.clientY - cy), reach = Math.max(r.width, r.height) * 0.9;
      if (d < reach) { qx((e.clientX - cx) * 0.28); qy((e.clientY - cy) * 0.4); } else { qx(0); qy(0); }
    }, { passive: true });
  });

  // =================================================================================================================
  // 4. MARKØREN: to parenteser lægger sig om det man peger på
  // =================================================================================================================
  if (fine && !calm) {
    const c = $('#cur'), L = $('.cur-l', c), R = $('.cur-r', c), tag = $('#curTag'), dot = $('.cur-dot', c);
    let mx = innerWidth / 2, my = innerHeight / 2, active = null, down = false, shown = false;
    const p = { lx: mx, ly: my, rx: mx, ry: my, ls: 1, rs: 1, tx: mx, ty: my };
    const OFF_X = 7, OFF_Y = 21;
    addEventListener('pointermove', e => {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; c.classList.add('on'); root.classList.add('has-cur'); p.lx = p.rx = p.tx = mx; p.ly = p.ry = p.ty = my; }
      const el = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (el !== active) {
        active = el; c.classList.toggle('big', !!el);
        const label = el && el.dataset.cursor; tag.textContent = label || ''; c.classList.toggle('tag', !!label);
      }
    }, { passive: true });
    document.addEventListener('mouseleave', () => { c.classList.remove('on'); shown = false; });
    addEventListener('pointerdown', () => { down = true; });
    addEventListener('pointerup', () => { down = false; });
    gsap.ticker.add(() => {
      let lx, ly, rx, ry, ls = 1, rs = 1;
      if (active && document.body.contains(active)) {
        const r = active.getBoundingClientRect(), pad = r.height > 90 ? 14 : 9;
        lx = r.left - pad; rx = r.right + pad; ly = ry = r.top + r.height / 2;
        ls = rs = Math.max(1, Math.min(40, (r.height + 14) / 36));
      } else { const g = down ? 10 : 17; lx = mx - g; rx = mx + g; ly = ry = my; }
      const k = 0.2;
      p.lx += (lx - p.lx) * k; p.ly += (ly - p.ly) * k; p.rx += (rx - p.rx) * k; p.ry += (ry - p.ry) * k; p.ls += (ls - p.ls) * k; p.rs += (rs - p.rs) * k;
      p.tx += (mx - p.tx) * 0.3; p.ty += (my - p.ty) * 0.3;
      L.style.transform = `translate(${(p.lx - OFF_X).toFixed(1)}px, ${p.ly.toFixed(1)}px) scale(1, ${p.ls.toFixed(3)}) translate(0, ${-OFF_Y}px)`;
      R.style.transform = `translate(${(p.rx - OFF_X).toFixed(1)}px, ${p.ry.toFixed(1)}px) scale(1, ${p.rs.toFixed(3)}) translate(0, ${-OFF_Y}px)`;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      tag.style.left = p.tx + 'px'; tag.style.top = (p.ty + 36) + 'px';
    });
  }

  // =================================================================================================================
  // 5. BILLEDVISNING
  // =================================================================================================================
  const GAL = {
    'white-dust': ['hero', 's1', 's2', 's3', 's4', 's5'].map(n => `assets/art/white-dust/${n}.webp`),
    'complex': ['hero', 's1', 's2', 's3', 's4'].map(n => `assets/art/complex/${n}.webp`)
  };
  const gal = $('#gal'), gi = $('#galImg'), gc = $('#galC'); let cur_ = 0, list = [], lastFocus = null;
  const show = i => {
    cur_ = (i + list.length) % list.length; gi.src = list[cur_]; gc.textContent = String(cur_ + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0');
    gsap.fromTo(gi, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out' });
  };
  function openGal(id) {
    list = GAL[id]; if (!list) return; lastFocus = document.activeElement; gal.hidden = false; lenis && lenis.stop(); show(0);
    gsap.fromTo(gal, { opacity: 0 }, { opacity: 1, duration: 0.4 }); $('#galX').focus();
  }
  function closeGal() { gsap.to(gal, { opacity: 0, duration: 0.3, onComplete: () => { gal.hidden = true; lenis && lenis.start(); lastFocus && lastFocus.focus && lastFocus.focus(); } }); }
  $$('[data-gallery]').forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', lang === 'en' ? 'Open screenshots' : 'Åbn billeder'); el.addEventListener('click', () => openGal(el.dataset.gallery)); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGal(el.dataset.gallery); } }); });
  $('#galX').addEventListener('click', closeGal); $('#galP').addEventListener('click', () => show(cur_ - 1)); $('#galN').addEventListener('click', () => show(cur_ + 1));
  gal.addEventListener('click', e => { if (e.target === gal) closeGal(); });
  addEventListener('keydown', e => { if (gal.hidden) return; if (e.key === 'Escape') closeGal(); else if (e.key === 'ArrowLeft') show(cur_ - 1); else if (e.key === 'ArrowRight') show(cur_ + 1); });

  // sikkerhedsnet: er noget ikke kommet frem efter få sekunder, vises det
  setTimeout(() => { if (!document.querySelector('.hero .ch') || getComputedStyle(nav).opacity === '0') root.classList.add('nogsap'); }, 6500);
  ScrollTrigger.refresh();
})();
