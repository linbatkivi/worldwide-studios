// Kortet. Alt bygges i kode med et fast seed, så det er det samme map hver gang.
// Ren data: kasser og ramper med en art (kind), som render.js bagefter gør til geometri.
import { mulberry32 } from './rng.js';
import { Grid } from './physics.js';

export const HALF = 250;                                   // kortet er 500 x 500 meter
export const PLAZA = 34;                                   // åbent område omkring spawn

const PALETTE = {
  container: [0xd2573a, 0x3b78c4, 0x4aa05a, 0xe0b23c, 0xb8bcc4, 0x8c5aa8],
  wall: [0xc9b79a, 0xb59a7a, 0xa8a8b4],
  crate: [0xe8b87a, 0xd9a05f],
  pillar: [0xe05a5a, 0x5a8ae0, 0xe0c25a],
  block: [0x9aa6b4, 0xb4a89a, 0x9ab4a8]
};

export function buildWorld(seed = 64) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const pick = a => a[Math.floor(rnd() * a.length)];
  const grid = new Grid(HALF + 24);
  const items = [];

  const add = c => { items.push(c); grid.insert(c); return c; };
  const box = (x0, z0, x1, z1, top, kind, color) => add({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, kind, color });
  const boxC = (cx, cz, sx, sz, top, kind, color) => box(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, top, kind, color);
  const ramp = (x0, z0, x1, z1, axis, hLo, hHi, color = 0xaab0ba) => add({ x0, x1, z0, z1, ramp: true, axis, hLo, hHi, top: Math.max(hLo, hHi), kind: 'ramp', color });

  const spawn = { x: 0, z: 0, yaw: 0 };                     // yaw 0 = kigger mod -z
  const chaserStart = { x: 0, z: -96 };
  const keepClear = [{ x: 0, z: 0, r: PLAZA }, { x: chaserStart.x, z: chaserStart.z, r: 22 }];

  // Er rektanglet frit for andre ting og for spawn-områderne? margin giver gangbredde.
  const free = (x0, z0, x1, z1, margin = 3) => {
    if (x0 < -HALF + 8 || x1 > HALF - 8 || z0 < -HALF + 8 || z1 > HALF - 8) return false;
    for (const k of keepClear) {
      const cx = Math.max(x0, Math.min(k.x, x1)), cz = Math.max(z0, Math.min(k.z, z1));
      if (Math.hypot(cx - k.x, cz - k.z) < k.r) return false;
    }
    for (const c of items) if (c.kind !== 'perimeter' && x0 - margin < c.x1 && x1 + margin > c.x0 && z0 - margin < c.z1 && z1 + margin > c.z0) return false;
    return true;
  };

  // ---- ydervæg ----------------------------------------------------------------------------------------------------
  const W = 6, T = 14;
  const wallColor = 0xa9a39a;
  box(-HALF - W, -HALF - W, HALF + W, -HALF, T, 'perimeter', wallColor);
  box(-HALF - W, HALF, HALF + W, HALF + W, T, 'perimeter', wallColor);
  box(-HALF - W, -HALF, -HALF, HALF, T, 'perimeter', wallColor);
  box(HALF, -HALF, HALF + W, HALF, T, 'perimeter', wallColor);

  // ---- pladsen: åbent, kun lave ting man kan hoppe på ----------------------------------------------------------------
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, d = 24;
    boxC(Math.cos(a) * d, Math.sin(a) * d, 2.4, 2.4, i % 2 ? 1.0 : 1.4, 'crate', pick(PALETTE.crate));
  }
  // startpodiet: tre trin op
  box(-5, 10, 5, 14, 0.5, 'block', 0xcfd3da); box(-4, 11, 4, 14, 1.0, 'block', 0xcfd3da); box(-3, 12, 3, 14, 1.5, 'block', 0xcfd3da);

  // ---- U-fælder: tre vægge, åben i den ene ende. PNG'en kører lige ind i bunden og sidder fast ----------------------
  const uTrap = (cx, cz, dir, kind = 'wall', col = null, w = 14, d = 20, h = 7, t = 2) => {
    const c = col || pick(PALETTE[kind] || PALETTE.wall);
    const hw = w / 2, hd = d / 2;
    const parts = dir === 'n' ? [[cx - hw, cz - hd, cx + hw, cz - hd + t], [cx - hw, cz - hd, cx - hw + t, cz + hd], [cx + hw - t, cz - hd, cx + hw, cz + hd]]
      : dir === 's' ? [[cx - hw, cz + hd - t, cx + hw, cz + hd], [cx - hw, cz - hd, cx - hw + t, cz + hd], [cx + hw - t, cz - hd, cx + hw, cz + hd]]
      : dir === 'w' ? [[cx - hd, cz - hw, cx - hd + t, cz + hw], [cx - hd, cz - hw, cx + hd, cz - hw + t], [cx - hd, cz + hw - t, cx + hd, cz + hw]]
      : [[cx + hd - t, cz - hw, cx + hd, cz + hw], [cx - hd, cz - hw, cx + hd, cz - hw + t], [cx - hd, cz + hw - t, cx + hd, cz + hw]];
    const [bx0, bz0, bx1, bz1] = dir === 'n' || dir === 's' ? [cx - hw, cz - hd, cx + hw, cz + hd] : [cx - hd, cz - hw, cx + hd, cz + hw];
    if (!free(bx0, bz0, bx1, bz1, 4)) return false;
    for (const p of parts) box(p[0], p[1], p[2], p[3], h, kind, c);
    return true;
  };

  // ---- lagerhaller: fire vægge og to døre ------------------------------------------------------------------------------
  const warehouse = (cx, cz, sx, sz, h) => {
    if (!free(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, 5)) return false;
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, t = 1.6, door = 7;
    const col = pick(PALETTE.wall);
    const side = (ax, a0, a1, fixed, gapAt) => {                    // en væg med et hul
      const g0 = gapAt - door / 2, g1 = gapAt + door / 2;
      const seg = (s0, s1) => { if (s1 - s0 < 0.5) return; if (ax === 'x') box(s0, fixed, s1, fixed + t, h, 'wall', col); else box(fixed, s0, fixed + t, s1, h, 'wall', col); };
      seg(a0, g0); seg(g1, a1);
    };
    side('x', x0, x1, z0, R(x0 + 6, x1 - 6));
    side('x', x0, x1, z1 - t, R(x0 + 6, x1 - 6));
    side('z', z0, z1, x0, R(z0 + 6, z1 - 6));
    box(x1 - t, z0, x1, z1, h, 'wall', col);
    // lidt indhold, så rummet ikke er tomt
    for (let i = 0; i < 3; i++) {
      const px = R(x0 + 6, x1 - 8), pz = R(z0 + 6, z1 - 8);
      box(px, pz, px + R(2, 3.4), pz + R(2, 3.4), pick([1.2, 2.4, 3.6]), 'crate', pick(PALETTE.crate));
    }
    return true;
  };

  // ---- containerhavn (nordvest): rækker af containere, nogle stablet, med gader imellem -----------------------------
  for (let row = 0; row < 7; row++) {
    const z = -228 + row * 26;
    let x = -228;
    while (x < -54) {
      const len = 12.2, wd = 2.5, stack = rnd() < 0.45 ? 2 : 1, col = pick(PALETTE.container);
      if (rnd() < 0.82 && free(x, z, x + len, z + wd, 1.5)) {
        box(x, z, x + len, z + wd, 2.6, 'container', col);
        if (stack === 2) box(x, z, x + len, z + wd, 5.2, 'container', pick(PALETTE.container));
      }
      x += len + (rnd() < 0.3 ? 9 : 2.2);
    }
    if (row % 2 === 0) for (let k = 0; k < 2; k++) {                // tværgående rækker, så det bliver et net
      const cz = z + 6 + k * 3, cx = R(-220, -70);
      if (free(cx, cz, cx + 2.5, cz + 12.2, 1.5)) box(cx, cz, cx + 2.5, cz + 12.2, 2.6, 'container', pick(PALETTE.container));
    }
  }
  for (let i = 0; i < 4; i++) uTrap(R(-210, -80), R(-210, -80), pick(['n', 's', 'e', 'w']), 'container', pick(PALETTE.container), 14, 22, 5.2, 2.5);

  // ---- labyrint (nordøst): 15 x 15 felter, med huller og løkker ---------------------------------------------------
  {
    const N = 15, C = 12, ox = 56, oz = -236, t = 1.6, h = 6.5, col = 0xb89a78;
    const vis = new Uint8Array(N * N), wallE = new Uint8Array(N * N).fill(1), wallS = new Uint8Array(N * N).fill(1);   // væg mod øst / syd for hvert felt
    const stack = [[7, 7]]; vis[7 * N + 7] = 1;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && !vis[y * N + x]);
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = nb[Math.floor(rnd() * nb.length)];
      if (dx === 1) wallE[cy * N + cx] = 0; else if (dx === -1) wallE[ny * N + nx] = 0;
      else if (dy === 1) wallS[cy * N + cx] = 0; else wallS[ny * N + nx] = 0;
      vis[ny * N + nx] = 1; stack.push([nx, ny]);
    }
    for (let i = 0; i < N * N * 0.5; i++) {                           // fjern ekstra vægge: flere løkker, færre blindgyder
      const x = RI(0, N - 2), y = RI(0, N - 2);
      if (rnd() < 0.5) wallE[y * N + x] = 0; else wallS[y * N + x] = 0;
    }
    const gates = [[7, 0, 'n'], [7, N - 1, 's'], [0, 7, 'w'], [N - 1, 7, 'e']];
    const open = (x, y, side) => gates.some(g => g[0] === x && g[1] === y && g[2] === side);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const x0 = ox + x * C, z0 = oz + y * C;
      if (wallE[y * N + x] && !(x === N - 1 && open(x, y, 'e'))) box(x0 + C - t / 2, z0 - t / 2, x0 + C + t / 2, z0 + C + t / 2, h, 'wall', col);
      if (wallS[y * N + x] && !(y === N - 1 && open(x, y, 's'))) box(x0 - t / 2, z0 + C - t / 2, x0 + C + t / 2, z0 + C + t / 2, h, 'wall', col);
      if (x === 0 && !open(x, y, 'w')) box(x0 - t / 2, z0 - t / 2, x0 + t / 2, z0 + C + t / 2, h, 'wall', col);
      if (y === 0 && !open(x, y, 'n')) box(x0 - t / 2, z0 - t / 2, x0 + C + t / 2, z0 + t / 2, h, 'wall', col);
    }
  }

  // ---- pilleskoven (sydøst): søjler og kasser i alle højder ---------------------------------------------------------
  for (let i = 0; i < 520; i++) {
    const x = R(52, 238), z = R(52, 238), s = R(2.4, 4.2), top = R(5, 11);
    if (free(x, z, x + s, z + s, 5.5)) box(x, z, x + s, z + s, top, 'pillar', pick(PALETTE.pillar));
  }
  for (let i = 0; i < 90; i++) {                                       // lave kasser imellem
    const x = R(52, 238), z = R(52, 238), s = R(2, 3.6);
    if (free(x, z, x + s, z + s, 2.5)) box(x, z, x + s, z + s, pick([1.2, 1.4, 2.4, 3.6]), 'crate', pick(PALETTE.crate));
  }

  // ---- tårnene (sydvest): platforme med ramper, så man kan komme op ----------------------------------------------------
  {
    const towers = [[-170, 150, 5], [-110, 100, 8], [-185, 70, 6.5], [-95, 195, 4], [-150, 215, 9]];
    for (const [cx, cz, h] of towers) {
      const s = 20, len = h * 5.5, dirN = RI(0, 3);
      box(cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2, h, 'block', 0xc3c8d2);
      if (dirN === 0) ramp(cx - 5, cz + s / 2, cx + 5, cz + s / 2 + len, 'z', h, 0);
      else if (dirN === 1) ramp(cx - 5, cz - s / 2 - len, cx + 5, cz - s / 2, 'z', 0, h);
      else if (dirN === 2) ramp(cx + s / 2, cz - 5, cx + s / 2 + len, cz + 5, 'x', h, 0);
      else ramp(cx - s / 2 - len, cz - 5, cx - s / 2, cz + 5, 'x', 0, h);
      box(cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2, h + 4, 'pillar', pick(PALETTE.pillar));
    }
  }

  // ---- lagerhaller, U-fælder, spredte klodser i hele kortet ---------------------------------------------------------------
  for (let i = 0; i < 160 && items.length < 4000; i++) {
    const cx = R(-230, 230), cz = R(-230, 230);
    if (i % 4 === 0) warehouse(cx, cz, R(26, 40), R(18, 26), R(8, 11));
  }
  for (let i = 0; i < 400; i++) uTrap(R(-235, 235), R(-235, 235), pick(['n', 's', 'e', 'w']), 'wall', null, R(12, 18), R(16, 26), R(6.5, 9));
  // let nok til at springe over: en ramme omkring pladsen, hvor man kan øve sig
  for (let i = 0; i < 260; i++) {
    const x = R(-238, 238), z = R(-238, 238), s = R(2, 4.5);
    const top = pick([1.0, 1.3, 1.5, 2.2, 3.4, 4.5]);
    if (free(x, z, x + s, z + s, 3)) box(x, z, x + s, z + s, top, top > 2 ? 'block' : 'crate', top > 2 ? pick(PALETTE.block) : pick(PALETTE.crate));
  }
  // enkelte lange murstykker som vindfang
  for (let i = 0; i < 70; i++) {
    const horizontal = rnd() < 0.5, len = R(18, 40), x = R(-230, 230), z = R(-230, 230);
    const [x1, z1] = horizontal ? [x + len, z + 1.6] : [x + 1.6, z + len];
    if (free(x, z, x1, z1, 5)) box(x, z, x1, z1, R(5, 8), 'wall', pick(PALETTE.wall));
  }
  // ramper man kan løbe op på og hoppe fra
  for (let i = 0; i < 40; i++) {
    const x = R(-225, 225), z = R(-225, 225), len = R(10, 18), wd = R(5, 8), h = R(1.8, 3.4);
    if (free(x, z, x + len, z + wd, 4)) ramp(x, z, x + len, z + wd, 'x', 0, h);
  }

  return {
    seed, items, grid, half: HALF, spawn, chaserStart, keepClear,
    each: (x, z, r, fn) => grid.each(x, z, r, fn),
    addCrate(c) { c.kind = 'crate'; c.dynamic = true; items.push(c); grid.insert(c); return c; },
    removeCrate(c) { grid.remove(c); const i = items.indexOf(c); if (i >= 0) items.splice(i, 1); }
  };
}
