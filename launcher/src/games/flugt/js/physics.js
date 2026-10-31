// Bevægelse og kollision i 2D (cirkel mod rektangler) med højde. Ingen Three.js, så det kan testes i Node.
// Alle ting på kortet er kasser (flad top) eller ramper (skrå top). Intet hænger over hovedet.
export const GRAVITY = 26;
const CELL = 16;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function topAt(c, x, z) {
  if (!c.ramp) return c.top;
  const t = c.axis === 'x' ? (x - c.x0) / (c.x1 - c.x0) : (z - c.z0) / (c.z1 - c.z0);
  return c.hLo + (c.hHi - c.hLo) * clamp(t, 0, 1);
}

export class Grid {
  constructor(half) {
    this.half = half;
    this.n = Math.ceil((half * 2) / CELL) + 1;
    this.cells = Array.from({ length: this.n * this.n }, () => []);
    this.stamp = 0;
  }
  _i(v) { return clamp(Math.floor((v + this.half) / CELL), 0, this.n - 1); }
  insert(c) {
    c._cells = [];
    for (let iz = this._i(c.z0); iz <= this._i(c.z1); iz++)
      for (let ix = this._i(c.x0); ix <= this._i(c.x1); ix++) {
        const i = iz * this.n + ix;
        this.cells[i].push(c); c._cells.push(i);
      }
  }
  remove(c) {
    if (!c._cells) return;
    for (const i of c._cells) { const a = this.cells[i], k = a.indexOf(c); if (k >= 0) a.splice(k, 1); }
    c._cells = null;
  }
  // Kalder fn(c) for alle kollidere nær (x, z). Ugyldige positioner giver ingenting (aldrig en uendelig løkke).
  each(x, z, r, fn) {
    if (!(Math.abs(x) < 1e5 && Math.abs(z) < 1e5)) return;
    const s = ++this.stamp;
    for (let iz = this._i(z - r); iz <= this._i(z + r); iz++)
      for (let ix = this._i(x - r); ix <= this._i(x + r); ix++) {
        const a = this.cells[iz * this.n + ix];
        for (let k = 0; k < a.length; k++) {
          const c = a[k];
          if (c._s === s) continue;
          c._s = s; fn(c);
        }
      }
  }
}

// e: { x, y, z, r, h, step }. Flytter e i vandret plan og skubber den ud af alt, den ikke kan træde op på.
export function moveEntity(grid, e, dx, dz) {
  const len = Math.hypot(dx, dz);
  if (!(len > 0)) return;
  const n = Math.max(1, Math.ceil(len / (e.r * 0.6)));
  const sx = dx / n, sz = dz / n;
  for (let i = 0; i < n; i++) { e.x += sx; e.z += sz; resolve(grid, e); }
}

function resolve(grid, e) {
  for (let it = 0; it < 3; it++) {
    let hit = false;
    grid.each(e.x, e.z, e.r, c => {
      const cx = clamp(e.x, c.x0, c.x1), cz = clamp(e.z, c.z0, c.z1);
      const ddx = e.x - cx, ddz = e.z - cz, d2 = ddx * ddx + ddz * ddz;
      if (d2 >= e.r * e.r) return;
      if (topAt(c, cx, cz) <= e.y + e.step) return;
      const d = Math.sqrt(d2);
      if (d > 1e-6) { const k = (e.r - d) / d; e.x += ddx * k; e.z += ddz * k; }
      else {
        const l = e.x - c.x0, r = c.x1 - e.x, t = e.z - c.z0, b = c.z1 - e.z, m = Math.min(l, r, t, b);
        if (m === l) e.x = c.x0 - e.r; else if (m === r) e.x = c.x1 + e.r; else if (m === t) e.z = c.z0 - e.r; else e.z = c.z1 + e.r;
      }
      hit = true;
    });
    if (!hit) break;
  }
}

// Højden af det man kan stå på under (x, z): det højeste, der ikke er højere end foden + step.
export function groundAt(grid, x, z, y, step, inset = 0.25) {
  let g = 0;
  grid.each(x, z, inset, c => {
    const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
    if (Math.hypot(x - cx, z - cz) > inset) return;
    const h = topAt(c, cx, cz);
    if (h <= y + step && h > g) g = h;
  });
  return g;
}

// Tyngdekraft og landing. Returnerer nedslagsfarten (>0) hvis e lige er landet, ellers 0.
export function settle(grid, e, dt) {
  const g = groundAt(grid, e.x, e.z, e.y, e.step);
  const was = e.grounded;
  e.vy -= GRAVITY * dt;
  e.y += e.vy * dt;
  let landed = 0;
  if (e.y <= g) {
    if (e.vy < -2 && !was) landed = -e.vy;
    e.y = g; e.vy = 0; e.grounded = true;
  } else if (was && e.vy <= 0 && e.y - g < 0.5 && !e.airborne) {      // ned ad en skråning eller en lille kant: bliv på jorden
    e.y = g; e.vy = 0; e.grounded = true;
  } else e.grounded = false;
  return landed;
}
