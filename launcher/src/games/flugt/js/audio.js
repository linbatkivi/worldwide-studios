// Lyd: musikken er en CC0-løkke (assets/music), alt andet syntetiseres med WebAudio, så der ikke skal hentes noget.
const KEY = 'flugt.audio';

export class Audio {
  constructor() {
    this.ctx = null; this.music = null; this.musicGain = null; this.sfxGain = null; this.master = null;
    this.vol = { master: 0.8, music: 0.7, sfx: 0.9 };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
    this.muted = false; this.beat = 0;
  }

  // Skal kaldes fra et klik eller tastetryk (browserens krav).
  async unlock(musicUrl) {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
      this.bus = comp;
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.bus);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.bus);
      this.musicLP = this.ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 20000;
      this.musicLP.connect(this.musicGain);
      this.drone = this._makeDrone();
      this.apply();
      if (musicUrl) this._loadMusic(musicUrl);
    }
    if (this.ctx.state !== 'running') try { await this.ctx.resume(); } catch (e) {}
  }

  async _loadMusic(url) {
    try {
      const res = await fetch(url); const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(this.musicLP); src.start();
      this.music = src;
    } catch (e) { console.warn('musik kunne ikke indlæses', e); }
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, m = this.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.vol.music * 0.8, t, 0.1);
    this.sfxGain.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }
  set(k, v) { this.vol[k] = Math.max(0, Math.min(1, v)); this.apply(); try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch (e) {} }
  toggleMute() { this.muted = !this.muted; this.apply(); return this.muted; }

  // Musikken drives op: lidt hurtigere jo længere man holder, og dæmpet i pauser
  setIntensity({ rate = 1, muffled = false } = {}) {
    if (!this.ctx || !this.music) return;
    const t = this.ctx.currentTime;
    this.music.playbackRate.setTargetAtTime(rate, t, 0.4);
    this.musicLP.frequency.setTargetAtTime(muffled ? 900 : 20000, t, 0.12);
  }

  // ---- byggeklodser ----
  tone({ type = 'square', f = 440, to = null, dur = 0.12, gain = 0.2, delay = 0, attack = 0.004 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  noise({ dur = 0.2, gain = 0.2, freq = 1200, to = null, q = 0.8, type = 'lowpass', delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
  }

  _makeDrone() {
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 46; o2.type = 'square'; o2.frequency.value = 69.3; f.type = 'lowpass'; f.frequency.value = 220; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxGain); o.start(); o2.start();
    return { g, f, o, o2 };
  }

  // PNG'ens nærvær: dyb brummen og tunge skridt, der bliver tættere og højere jo nærmere den er
  threat(dt, dist, active) {
    if (!this.ctx) return;
    const near = active ? Math.max(0, Math.min(1, 1 - (dist - 4) / 70)) : 0;
    const t = this.ctx.currentTime;
    this.drone.g.gain.setTargetAtTime(near * near * 0.32, t, 0.15);
    this.drone.f.frequency.setTargetAtTime(160 + near * 520, t, 0.2);
    this.drone.o.frequency.setTargetAtTime(44 + near * 14, t, 0.3);
    this.beat -= dt * (1.4 + near * 2.2);
    if (active && this.beat <= 0) {
      this.beat = 0.45;
      const v = 0.05 + near * 0.55;
      this.tone({ type: 'sine', f: 90, to: 34, dur: 0.16, gain: v * 0.9 });
      this.noise({ dur: 0.12, gain: v * 0.5, freq: 380, to: 90 });
    }
  }

  // ---- effekter ----
  click() { this.tone({ type: 'square', f: 660, to: 880, dur: 0.06, gain: 0.07 }); }
  hover() { this.tone({ type: 'square', f: 440, dur: 0.03, gain: 0.04 }); }
  start() {
    this.tone({ type: 'sawtooth', f: 180, to: 720, dur: 0.35, gain: 0.16 });
    this.tone({ type: 'square', f: 360, to: 1440, dur: 0.35, gain: 0.08, delay: 0.04 });
  }
  jump() { this.tone({ type: 'square', f: 280, to: 620, dur: 0.14, gain: 0.07 }); }
  land() { this.noise({ dur: 0.12, gain: 0.22, freq: 700, to: 120 }); }
  crate() { this.tone({ type: 'triangle', f: 150, to: 60, dur: 0.22, gain: 0.35 }); this.noise({ dur: 0.18, gain: 0.25, freq: 1400, to: 200 }); }
  denied() { this.tone({ type: 'square', f: 140, dur: 0.12, gain: 0.08 }); this.tone({ type: 'square', f: 110, dur: 0.14, gain: 0.08, delay: 0.1 }); }
  leap() { this.noise({ dur: 0.5, gain: 0.3, freq: 300, to: 2400, type: 'bandpass', q: 1.2 }); this.tone({ type: 'sawtooth', f: 90, to: 260, dur: 0.4, gain: 0.12 }); }
  stomp() { this.tone({ type: 'sine', f: 70, to: 28, dur: 0.3, gain: 0.7 }); this.noise({ dur: 0.25, gain: 0.45, freq: 500, to: 60 }); }
  caught() {
    this.tone({ type: 'sawtooth', f: 520, to: 40, dur: 0.9, gain: 0.35 });
    this.tone({ type: 'square', f: 130, to: 30, dur: 0.9, gain: 0.25 });
    this.noise({ dur: 0.7, gain: 0.55, freq: 3000, to: 120 });
  }
  record() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', f, dur: 0.16, gain: 0.1, delay: i * 0.09 })); }
}
