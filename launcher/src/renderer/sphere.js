/* Meridian-kuglen. Tegnes på et canvas uden biblioteker: længde- og breddegrader, byer som prikker og buer mellem dem.
   Samme fil bruges af hjemmesiden og launcheren (tools/sync-assets.js holder kopien i launcheren ajour).

     const s = WWSphere.create(canvas, { radius: 0.4, center: [0.5, 0.5] });
     s.destroy();
*/
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  // [bredde, længde]. Første er hjemmeprikken (København), resten er det buerne går ud til.
  const HOME = [55.68, 12.57];
  const CITIES = [
    [51.5, -0.12], [40.71, -74.0], [37.77, -122.42], [35.68, 139.69], [-33.87, 151.21], [-23.55, -46.63], [28.61, 77.2],
    [1.35, 103.82], [30.04, 31.24], [-26.2, 28.04], [59.33, 18.07], [64.14, -21.9], [19.43, -99.13], [55.75, 37.62], [39.9, 116.4],
    [37.57, 126.98], [-1.29, 36.82], [6.52, 3.38], [41.0, 28.97], [25.2, 55.27], [-34.6, -58.38], [43.65, -79.38], [60.17, 24.94],
    [48.85, 2.35], [13.75, 100.5], [-37.81, 144.96], [21.3, -157.86], [-33.45, -70.67], [4.71, -74.07], [34.05, -118.24], [35.0, 135.0],
    [45.5, -73.57], [-12.05, -77.04], [10.48, -66.9], [31.23, 121.47], [22.3, 114.17], [14.6, 121.0], [-6.2, 106.85], [33.75, -84.39]
  ];
  const ARC_TARGETS = [1, 3, 4, 6, 9, 14, 15, 19, 22, 29, 34, 36];

  const ll = (lat, lon) => { const a = lat * D2R, o = lon * D2R, c = Math.cos(a); return [c * Math.sin(o), Math.sin(a), c * Math.cos(o)]; };
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // stor cirkel mellem to punkter, løftet over overfladen
  function arcPoints(a, b, lift, n) {
    const A = ll(a[0], a[1]), B = ll(b[0], b[1]), w = Math.acos(Math.max(-1, Math.min(1, dot(A, B)))), s = Math.sin(w) || 1, out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s, h = 1 + lift * w * Math.sin(Math.PI * t);
      out.push([(A[0] * k1 + B[0] * k2) * h, (A[1] * k1 + B[1] * k2) * h, (A[2] * k1 + B[2] * k2) * h]);
    }
    return out;
  }

  function create(canvas, o = {}) {
    const opt = Object.assign({ radius: 0.4, center: [0.5, 0.5], tilt: 0.42, speed: 0.07, yaw: 3.0, meridians: 18, parallels: 8,
      ink: '236,235,228', accent: '255,90,31', arcs: true, interactive: true, alpha: 1 }, o);
    const ctx = canvas.getContext('2d');
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, running = false, visible = true;
    let yaw = opt.yaw, vel = 0, drag = null, hover = 0, pulse = 0;
    const pitch = opt.tilt;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const arcs = opt.arcs ? ARC_TARGETS.map((i, k) => ({ pts: arcPoints(HOME, CITIES[i], 0.11, 56), phase: (k * 0.37) % 1, speed: 0.11 + (k % 5) * 0.018 })) : [];

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, root.devicePixelRatio || 1);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (!running) draw(performance.now());
    }

    // roter om lodret akse (yaw), så vip bagover (pitch). Resultat: x højre, y op, z mod beskueren
    const rot = p => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c, y = p[1];
      return [x, y * cp - z * sp, y * sp + z * cp];
    };

    function draw(now) {
      const R = Math.min(w, h) * opt.radius, cx = w * opt.center[0], cy = h * opt.center[1];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = opt.alpha;
      const ink = opt.ink, acc = opt.accent;

      // svagt lys bag kuglen
      const g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R * 1.25);
      g.addColorStop(0, `rgba(${ink},0.055)`); g.addColorStop(0.7, `rgba(${ink},0.012)`); g.addColorStop(1, `rgba(${ink},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, TAU); ctx.fill();

      // gitter: segmenter sorteres i få lag efter dybde, så det kun koster et par streger pr. lag
      const LAYERS = 7, buckets = Array.from({ length: LAYERS }, () => []);
      const seg = (a, b) => {
        const z = (a[2] + b[2]) / 2, t = ss(-0.35, 0.95, z), i = Math.min(LAYERS - 1, Math.floor(t * LAYERS));
        buckets[i].push(cx + a[0] * R, cy - a[1] * R, cx + b[0] * R, cy - b[1] * R);
      };
      const STEP = 4;
      for (let m = 0; m < opt.meridians; m++) {
        const lon = (m / opt.meridians) * 360; let prev = null;
        for (let lat = -90; lat <= 90; lat += STEP) { const p = rot(ll(lat, lon)); if (prev) seg(prev, p); prev = p; }
      }
      for (let k = 1; k <= opt.parallels; k++) {
        const lat = -90 + (k / (opt.parallels + 1)) * 180; let prev = null;
        for (let lon = 0; lon <= 360; lon += STEP) { const p = rot(ll(lat, lon)); if (prev) seg(prev, p); prev = p; }
      }
      ctx.lineWidth = 1; ctx.lineCap = 'round';
      for (let i = 0; i < LAYERS; i++) {
        const a = (0.035 + (i / (LAYERS - 1)) * 0.3);
        ctx.strokeStyle = `rgba(${ink},${a.toFixed(3)})`; ctx.beginPath();
        const b = buckets[i];
        for (let j = 0; j < b.length; j += 4) { ctx.moveTo(b[j], b[j + 1]); ctx.lineTo(b[j + 2], b[j + 3]); }
        ctx.stroke();
      }
      // omrids
      ctx.strokeStyle = `rgba(${ink},0.28)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      // buer fra hjemmeprikken, med en lysende prik der løber langs hver
      const t = now / 1000;
      for (const a of arcs) {
        const pts = a.pts.map(rot);
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length - 1; i++) {
          const z = (pts[i][2] + pts[i + 1][2]) / 2; if (z < -0.05) continue;
          ctx.strokeStyle = `rgba(${ink},${(0.05 + ss(0, 0.9, z) * 0.22).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(cx + pts[i][0] * R, cy - pts[i][1] * R); ctx.lineTo(cx + pts[i + 1][0] * R, cy - pts[i + 1][1] * R); ctx.stroke();
        }
        const u = ((t * a.speed + a.phase) % 1) * (pts.length - 1), i0 = Math.floor(u), f = u - i0, p0 = pts[i0], p1 = pts[Math.min(pts.length - 1, i0 + 1)];
        const z = p0[2] + (p1[2] - p0[2]) * f;
        if (z > -0.05) {
          const x = cx + (p0[0] + (p1[0] - p0[0]) * f) * R, y = cy - (p0[1] + (p1[1] - p0[1]) * f) * R, al = ss(0, 0.6, z);
          const gl = ctx.createRadialGradient(x, y, 0, x, y, 9); gl.addColorStop(0, `rgba(${acc},${(0.75 * al).toFixed(3)})`); gl.addColorStop(1, `rgba(${acc},0)`);
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(${acc},${al.toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
        }
      }

      // byer
      for (const c of CITIES) {
        const p = rot(ll(c[0], c[1])), front = p[2] > 0;
        ctx.fillStyle = `rgba(${ink},${front ? (0.25 + p[2] * 0.55).toFixed(3) : 0.07})`;
        ctx.beginPath(); ctx.arc(cx + p[0] * R, cy - p[1] * R, front ? 1.7 : 1.1, 0, TAU); ctx.fill();
      }
      // hjemmeprikken
      const hp = rot(ll(HOME[0], HOME[1])), hx = cx + hp[0] * R, hy = cy - hp[1] * R, hz = hp[2];
      const vis = hz > 0 ? 1 : 0.18;
      const ring = (t * 0.55) % 1;
      ctx.strokeStyle = `rgba(${acc},${((1 - ring) * 0.55 * vis).toFixed(3)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(hx, hy, 4 + ring * 26, 0, TAU); ctx.stroke();
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 22); hg.addColorStop(0, `rgba(${acc},${(0.5 * vis).toFixed(3)})`); hg.addColorStop(1, `rgba(${acc},0)`);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${acc},${vis})`; ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    function tick(now) {
      raf = 0; if (!running) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (drag) vel *= 0.9; else vel += (opt.speed - vel) * Math.min(1, dt * 1.4);
      yaw += (vel + hover * 0.05) * dt;
      draw(now);
      raf = requestAnimationFrame(tick);
    }
    function start() { if (running || reduce || !visible || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(tick); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    // dragen: træk i kuglen for at dreje den, den bliver ved et øjeblik
    const down = e => { drag = { x: e.clientX }; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
    const move = e => {
      const r = canvas.getBoundingClientRect();
      hover = ((e.clientX - r.left) / r.width - 0.5) * 2;
      if (!drag) return;
      const dx = e.clientX - drag.x; drag.x = e.clientX; yaw += dx * 0.006; vel = dx * 0.006 * 60;
      if (reduce) draw(performance.now());
    };
    const up = () => { drag = null; canvas.style.cursor = ''; };
    if (opt.interactive) {
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', () => { hover = 0; });
      canvas.style.touchAction = 'pan-y';
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; if (ro) ro.observe(canvas); else root.addEventListener('resize', resize);
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }) : null; if (io) io.observe(canvas);
    const vis = () => (document.hidden ? stop() : start()); document.addEventListener('visibilitychange', vis);
    resize(); draw(performance.now()); start();

    return {
      set(patch) { Object.assign(opt, patch); if (!running) draw(performance.now()); },
      get yaw() { return yaw; }, set yaw(v) { yaw = v; },
      nudge(dv) { vel += dv; },
      destroy() { stop(); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', vis); }
    };
  }

  root.WWSphere = { create };
})(typeof window !== 'undefined' ? window : this);
