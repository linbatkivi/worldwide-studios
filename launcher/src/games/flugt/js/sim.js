// Selve spillet uden grafik: spiller, PNG'en, kasser, tid. Render og lyd læser tilstanden og lytter på sim.events.
import { buildWorld } from './world.js';
import { moveEntity, settle, topAt } from './physics.js';

export const TUNING = {
  run: 15, sprint: 19, jump: 9.2,
  staminaSecs: 3.2, staminaRegen: 0.5, staminaLock: 0.25,
  chaserBase: 21, chaserGrow: 0.055, chaserMax: 34,
  catchR: 1.35,
  crateMax: 4, crateCooldown: 3, crateLife: 22, crateSize: 3.2, crateHeight: 3.8
};

export const chaserSpeed = t => Math.min(TUNING.chaserMax, TUNING.chaserBase + TUNING.chaserGrow * t);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Sim {
  constructor(seed) {
    this.world = buildWorld(seed);
    this.events = [];
    this.reset();
  }

  reset() {
    for (const k of this.crates || []) this.world.removeCrate(k.col);
    const w = this.world;
    this.crates = [];
    this.cooldown = 0;
    this.state = 'ready';
    this.time = 0;
    this.yaw = w.spawn.yaw; this.pitch = 0;
    this.player = { x: w.spawn.x, y: 0, z: w.spawn.z, vx: 0, vz: 0, vy: 0, r: 0.4, h: 1.8, step: 0.55, grounded: true, stamina: 1, locked: false, sprinting: false, coyote: 0, jumpBuf: 0, rest: 0, speed: 0 };
    this.chaser = {
      x: w.chaserStart.x, y: 0, z: w.chaserStart.z, vy: 0, r: 1.4, h: 5.2, step: 0.9, grounded: true, airborne: false,
      vx: 0, vz: 0, eff: 1, stuck: 0, detour: 0, detourSide: 1, leapVx: 0, leapVz: 0, leapT: 0, leapRise: 0, speed: 0, face: 0, stride: 0, leaps: 0
    };
    this.events.length = 0;
  }

  start() {
    if (this.state !== 'ready') return;
    this.state = 'playing'; this.time = 0;
    this.events.push('start');
  }

  // input: { fwd, strafe (-1..1), jump, sprint, place }
  update(dt, input) {
    dt = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < n; i++) this._step(dt / n, input);
  }

  _step(dt, input) {
    const p = this.player, c = this.chaser;
    // kasser kan forsvinde, uanset om spillet kører
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const k = this.crates[i];
      if (this.state === 'playing') k.ttl -= dt;
      if (k.ttl <= 0) { this.world.removeCrate(k.col); this.crates.splice(i, 1); this.events.push('crateGone'); }
    }
    if (this.state === 'ready') { settle(this.world.grid, p, dt); c.stride += dt * 2; return; }
    if (this.state === 'over') return;

    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this._player(dt, input);
    this._chaser(dt);
    if (input.place) this.placeCrate();

    // fanget? Vandret afstand og overlap i højden (PNG'en er høj, så man kan ikke gemme sig lige ved siden af)
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < c.r * 0.95 + p.r + 0.15 && p.y < c.y + c.h && p.y + p.h > c.y) {
      this.state = 'over'; this.caughtAt = this.time;
      this.events.push('caught');
    }
  }

  _player(dt, input) {
    const p = this.player, g = this.world.grid, T = TUNING;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * input.fwd + cy * input.strafe, wz = -cy * input.fwd - sy * input.strafe;
    const wl = Math.hypot(wx, wz);
    const moving = wl > 0.01;
    if (wl > 1) { wx /= wl; wz /= wl; }

    // løb og udholdenhed
    const want = !!input.sprint && moving;
    if (p.locked && p.stamina > T.staminaLock) p.locked = false;
    p.sprinting = want && !p.locked && p.stamina > 0;
    if (p.sprinting) { p.stamina -= dt / T.staminaSecs; p.rest = 0.5; if (p.stamina <= 0) { p.stamina = 0; p.locked = true; p.sprinting = false; } }
    else { p.rest = Math.max(0, p.rest - dt); if (p.rest === 0) p.stamina = Math.min(1, p.stamina + dt * T.staminaRegen); }
    const speed = p.sprinting ? T.sprint : T.run;

    // fart: skarp på jorden, svævende i luften
    const k = Math.min(1, (p.grounded ? 14 : 2.4) * dt);
    p.vx += (wx * speed - p.vx) * k; p.vz += (wz * speed - p.vz) * k;

    // hop med lidt tilgivelse før og efter kanten
    p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
    p.jumpBuf = input.jump ? 0.12 : Math.max(0, p.jumpBuf - dt);
    if (p.jumpBuf > 0 && p.coyote > 0) { p.vy = T.jump; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; this.events.push('jump'); }

    const x0 = p.x, z0 = p.z;
    moveEntity(g, p, p.vx * dt, p.vz * dt);
    p.vx = (p.x - x0) / dt; p.vz = (p.z - z0) / dt;                 // væg tager farten
    const landed = settle(g, p, dt);
    if (landed > 6) this.events.push('land');
    p.speed = Math.hypot(p.vx, p.vz);
  }

  _chaser(dt) {
    const c = this.chaser, p = this.player, g = this.world.grid;
    const sp = c.speed = chaserSpeed(this.time);
    let dx = p.x - c.x, dz = p.z - c.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    dx /= dist; dz /= dist;

    if (c.airborne) {                                                // i et spring: ingen styring, kun tyngde
      c.leapT += dt;
      if (c.leapT >= c.leapRise) moveEntity(g, c, c.leapVx * dt, c.leapVz * dt);      // først op, så fremad (ellers rammer den muren)
      const landed = settle(g, c, dt);
      if (c.grounded && landed >= 0) { c.airborne = false; c.detour = 0; this.events.push('stomp'); }
      c.face = Math.atan2(dx, dz);
      return;
    }

    // retning: lige mod spilleren, eller på tværs når den har siddet fast
    let hx = dx, hz = dz;
    if (c.detour > 0 || c.detour > -0.5) c.detour -= dt;
    if (c.detour > 0) {
      const a = c.detourSide * 1.15, ca = Math.cos(a), sa = Math.sin(a);
      hx = dx * ca - dz * sa; hz = dx * sa + dz * ca;
    }
    const x0 = c.x, z0 = c.z;
    moveEntity(g, c, hx * sp * dt, hz * sp * dt);
    const along = ((c.x - x0) * dx + (c.z - z0) * dz) / (sp * dt);    // hvor meget af skridtet førte mod spilleren
    c.eff += (clamp(along, 0, 1) - c.eff) * Math.min(1, dt * 6);
    c.vx = (c.x - x0) / dt; c.vz = (c.z - z0) / dt;
    settle(g, c, dt);
    c.stride += dt * sp * 0.45;
    c.face = Math.atan2(dx, dz);

    // utålmodighed: stiger når den ikke kommer nærmere. Først en omvej, så et lavt spring, til sidst et højt
    if (c.eff < 0.5) c.stuck += dt; else if (c.eff > 0.8) c.stuck = Math.max(0, c.stuck - dt * 2);
    if (c.stuck > 1.1 && c.detour <= -0.5) { c.detour = 1.6; c.detourSide = Math.random() < 0.5 ? -1 : 1; }
    if (c.detour <= 0) c.detour = Math.max(-0.5, c.detour);
    if (c.grounded && dist > 2) {
      if (c.stuck > 3.2 && c.stuck < 4.0 && dist < 30) { this._leap(dx, dz, dist, 0.85); c.stuck = 4.2; }
      else if (c.stuck > 6.5) { this._leap(dx, dz, dist, 1.5); c.stuck = 0; }
    }
  }

  _leap(dx, dz, dist, T) {
    const c = this.chaser;
    const rise = T * 0.35, v = Math.min(dist / (T - rise), 30);
    c.leapVx = dx * v; c.leapVz = dz * v; c.leapT = 0; c.leapRise = rise;
    c.vy = 13 * T; c.grounded = false; c.airborne = true; c.leaps++;
    this.events.push('leap');
  }

  // Sæt en kasse foran dig: en mur PNG'en ikke kan gå igennem.
  placeCrate() {
    const T = TUNING, p = this.player;
    if (this.state !== 'playing' || this.cooldown > 0 || this.crates.length >= T.crateMax) { if (this.state === 'playing') this.events.push('crateDenied'); return false; }
    const f = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }, s = T.crateSize / 2;
    const cx = p.x + f.x * (s + 1.6), cz = p.z + f.z * (s + 1.6);
    const x0 = cx - s, x1 = cx + s, z0 = cz - s, z1 = cz + s;
    let blocked = false;
    this.world.each(cx, cz, s + 2, o => {
      if (x0 < o.x1 && x1 > o.x0 && z0 < o.z1 && z1 > o.z0 && topAt(o, clamp(cx, o.x0, o.x1), clamp(cz, o.z0, o.z1)) > 0.3) blocked = true;
    });
    const c = this.chaser;
    if (Math.hypot(c.x - cx, c.z - cz) < s * 1.42 + c.r + 0.5) blocked = true;
    if (p.y > 0.8) blocked = true;
    if (blocked) { this.events.push('crateDenied'); return false; }
    const col = this.world.addCrate({ x0, x1, z0, z1, top: T.crateHeight, color: 0xe8b87a });
    this.crates.push({ col, ttl: T.crateLife });
    this.cooldown = T.crateCooldown;
    this.events.push('crate');
    return true;
  }

  // Afstand i meter til PNG'en og dens retning set fra spilleren (til HUD)
  threat() {
    const c = this.chaser, p = this.player;
    return { dist: Math.hypot(c.x - p.x, c.z - p.z), angle: Math.atan2(c.x - p.x, -(c.z - p.z)) - this.yaw };
  }
}
