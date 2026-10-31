// Tegning. Verden tegnes i lav opløsning (omkring 480 linjer, hele pixels, uden udjævning) med tåge, 15-bit farver og dither,
// som på en N64, bare skarpere. PNG'en tegnes bagefter i skærmens fulde opløsning ovenpå og tester mod verdens dybde,
// så den kan stå bag en mur og stadig være knivskarp.
import * as THREE from './three.module.js';
import { HALF, PLAZA } from './world.js';
import { mulberry32 } from './rng.js';

THREE.ColorManagement.enabled = false;

export const FOG = 0xbfe0f4;
const NEAR = 0.3, FAR = 1200;

// ---- teksturer: små, håndtegnet pixel for pixel -------------------------------------------------------------------------
function canvasTexture(size, draw, anisotropy = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = anisotropy;
  return t;
}
const hex = n => '#' + n.toString(16).padStart(6, '0');
const shade = (n, k) => { const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k); return `rgb(${r | 0},${g | 0},${b | 0})`; };

function makeTextures() {
  const rnd = mulberry32(5);
  const noise = (g, s, amt, color = '0,0,0') => { for (let i = 0; i < s * s * 0.35; i++) { g.fillStyle = `rgba(${color},${(rnd() * amt).toFixed(3)})`; g.fillRect((rnd() * s) | 0, (rnd() * s) | 0, 1, 1); } };
  return {
    grass: canvasTexture(64, (g, s) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#5fae3e' : '#6cbc48'; g.fillRect(x * 32, y * 32, 32, 32); }
      noise(g, s, 0.22); noise(g, s, 0.16, '255,255,200');
      for (let i = 0; i < 26; i++) { const x = (rnd() * 62) | 0, y = (rnd() * 60) | 0; g.fillStyle = '#4f9a34'; g.fillRect(x, y, 1, 3); g.fillRect(x + 1, y + 1, 1, 2); }
    }),
    concrete: canvasTexture(64, (g, s) => {
      g.fillStyle = '#d6d9de'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#b3b8c1'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(32, 0, 1, s); g.fillRect(0, 32, s, 1);
      g.fillStyle = '#eceef1'; g.fillRect(2, 2, 30, 1); g.fillRect(2, 2, 1, 30);
      noise(g, s, 0.1); noise(g, s, 0.07, '255,255,255');
    }),
    brick: canvasTexture(64, (g, s) => {
      g.fillStyle = '#b5b0a8'; g.fillRect(0, 0, s, s);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
        const off = row % 2 ? 8 : 0, x = col * 16 + off - 8, k = 0.9 + rnd() * 0.18;
        g.fillStyle = shade(0xf2eee6, k); g.fillRect(x + 1, row * 8 + 1, 14, 6);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 1, row * 8 + 1, 14, 1);
        g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x + 1, row * 8 + 6, 14, 1);
      }
      noise(g, s, 0.16);
    }),
    container: canvasTexture(64, (g, s) => {
      for (let x = 0; x < s; x += 4) { g.fillStyle = (x / 4) % 2 ? '#e6e6e6' : '#f8f8f8'; g.fillRect(x, 0, 4, s); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 3, 0, 1, s); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, s, 3); g.fillRect(0, s - 3, s, 3);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(31, 3, 2, s - 6);
      noise(g, s, 0.15);
    }),
    crate: canvasTexture(64, (g, s) => {
      g.fillStyle = '#f4dcb4'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 16) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y + 15, s, 1); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, y, s, 1); }
      g.fillStyle = '#b4824a'; g.fillRect(0, 0, s, 5); g.fillRect(0, s - 5, s, 5); g.fillRect(0, 0, 5, s); g.fillRect(s - 5, 0, 5, s);
      for (let i = 0; i < 60; i++) { g.fillStyle = '#b4824a'; g.fillRect(i, i, 5, 5); g.fillRect(s - 5 - i, i, 5, 5); }
      g.fillStyle = 'rgba(0,0,0,.35)'; for (const [x, y] of [[2, 2], [s - 3, 2], [2, s - 3], [s - 3, s - 3]]) g.fillRect(x, y, 1, 1);
      noise(g, s, 0.2);
    }),
    pillar: canvasTexture(32, (g, s) => {
      for (let y = 0; y < s; y += 8) { g.fillStyle = (y / 8) % 2 ? '#ffffff' : '#d9d9d9'; g.fillRect(0, y, s, 8); }
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, 2, s); g.fillRect(s - 2, 0, 2, s);
      noise(g, s, 0.12);
    }),
    hazard: canvasTexture(64, (g, s) => {
      g.fillStyle = '#f3c93c'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#2b2b30';
      for (let i = -s; i < s * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 + s, s); g.lineTo(i + s, s); g.closePath(); g.fill(); }
      noise(g, s, 0.18);
    }),
    cloud: (() => {
      const t = canvasTexture(64, (g, s) => {
        g.fillStyle = '#ffffff';
        for (const [x, y, r] of [[14, 40, 9], [26, 34, 12], [40, 32, 13], [52, 40, 9], [32, 42, 12], [20, 44, 8], [46, 44, 8]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(150,178,215,.6)'; g.fillRect(0, 44, s, 20);
      });
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.NearestFilter; return t;
    })()
  };
}

// ---- geometri: kasser og ramper bygges som tavler af trekanter med vertexfarver og slås sammen pr. tekstur ----------------------
class Batch {
  constructor() { this.p = []; this.u = []; this.c = []; }
  quad(a, b, c, d, uvs, col) {                                // a b c d mod uret set udefra; uvs er fire [u,v]
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const v = [a, b, c, d][i];
      this.p.push(v[0], v[1], v[2]); this.u.push(uvs[i][0], uvs[i][1]);
      const k = v[3] === undefined ? 1 : v[3];
      this.c.push(col[0] * k, col[1] * k, col[2] * k);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const rgb = n => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
const TEX = { perimeter: ['brick', 5], wall: ['brick', 4], container: ['container', 2.6], crate: ['crate', 2.4], pillar: ['pillar', 4], block: ['concrete', 4] };
const SIDE = { px: 0.8, nx: 0.8, pz: 0.64, nz: 0.64 };

// En kasse med bund i y0 og top i y1. Siderne mørkere nederst, toppen lys: billig ambient occlusion.
function addBox(batch, c, tile, topCol) {
  const col = rgb(c.color), x0 = c.x0, x1 = c.x1, z0 = c.z0, z1 = c.z1, y1 = c.top;
  const lo = 0.72, hi = 1.0, dx = x1 - x0, dz = z1 - z0, rep = h => h / tile;
  const side = (a, b, key, u1) => {                           // a, b: de to hjørner i bunden (x, z); sæt sider op til y1
    const k = SIDE[key];
    const A = [a[0], 0, a[1], lo * k], B = [b[0], 0, b[1], lo * k], C = [b[0], y1, b[1], hi * k], D = [a[0], y1, a[1], hi * k];
    batch.quad(A, B, C, D, [[0, 0], [u1, 0], [u1, rep(y1)], [0, rep(y1)]], col);
  };
  side([x1, z0], [x0, z0], 'nz', rep(dx));                    // nord (-z)
  side([x0, z1], [x1, z1], 'pz', rep(dx));                    // syd (+z)
  side([x0, z0], [x0, z1], 'nx', rep(dz));                    // vest (-x)
  side([x1, z1], [x1, z0], 'px', rep(dz));                    // øst (+x)
  batch.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile], [x0 / tile, z0 / tile]], topCol || col.map(v => v * 1.0));
}

function addRamp(topB, sideB, c) {
  const { x0, x1, z0, z1, axis, hLo, hHi } = c;
  const h = (x, z) => hLo + (hHi - hLo) * (axis === 'x' ? (x - x0) / (x1 - x0) : (z - z0) / (z1 - z0));
  const SW = [x0, h(x0, z1), z1], SE = [x1, h(x1, z1), z1], NE = [x1, h(x1, z0), z0], NW = [x0, h(x0, z0), z0];
  topB.quad(SW, SE, NE, NW, [[x0 / 4, z1 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4], [x0 / 4, z0 / 4]], [1, 1, 1]);
  const wall = (A, B, C, D, k) => {
    const lo = k * 0.72, uv = [[0, 0], [1, 0], [1, Math.max(A[1], B[1], C[1], D[1]) / 4], [0, Math.max(A[1], B[1], C[1], D[1]) / 4]];
    sideB.quad([...A, lo], [...B, lo], [...C, k], [...D, k], uv, [0.86, 0.88, 0.92]);
  };
  wall([x0, 0, z1], [x1, 0, z1], SE, SW, 0.64);
  wall([x1, 0, z0], [x0, 0, z0], NW, NE, 0.64);
  wall([x0, 0, z0], [x0, 0, z1], SW, NW, 0.8);
  wall([x1, 0, z1], [x1, 0, z0], NE, SE, 0.8);
}

function buildStatic(world, tex, aniso) {
  const group = new THREE.Group();
  const mats = {};
  const mat = name => mats[name] || (mats[name] = new THREE.MeshBasicMaterial({ map: tex[name], vertexColors: true, fog: true }));
  const batches = {};
  const get = name => batches[name] || (batches[name] = new Batch());
  for (const c of world.items) {
    if (c.dynamic) continue;
    if (c.ramp) { addRamp(get('hazard'), get('concrete'), c); continue; }
    const [name, tile] = TEX[c.kind] || ['concrete', 4];
    const topCol = c.kind === 'container' ? rgb(c.color).map(v => v * 0.9) : null;
    addBox(get(name), c, tile, topCol);
  }
  for (const [name, b] of Object.entries(batches)) {
    if (!b.p.length) continue;
    const m = new THREE.Mesh(b.geometry(), mat(name));
    m.matrixAutoUpdate = false; m.updateMatrix(); m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

// ---- renderer ---------------------------------------------------------------------------------------------------------
const COMPOSITE_V = /* glsl */`
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const COMPOSITE_F = /* glsl */`
  precision highp float;
  precision highp sampler2D;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float uScale;
  uniform vec2 uRes;
  uniform vec2 uLow;
  uniform float uLevels;
  uniform float uDither;
  uniform float uVignette;
  layout(location = 0) out vec4 fragColor;
  const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  void main() {
    ivec2 cell = ivec2(floor(gl_FragCoord.xy / uScale));
    cell = clamp(cell, ivec2(0), ivec2(uLow) - 1);
    vec3 c = texelFetch(tColor, cell, 0).rgb;
    float d = texelFetch(tDepth, cell, 0).r;
    vec2 q = gl_FragCoord.xy / uRes - 0.5;
    c *= 1.0 - uVignette * dot(q, q) * 2.2;
    float t = (BAYER[(cell.y & 3) * 4 + (cell.x & 3)] + 0.5) / 16.0 - 0.5;
    c = floor(c * uLevels + 0.5 + t * uDither) / uLevels;
    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    gl_FragDepth = d;
  }
`;
const PNG_V = /* glsl */`
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const PNG_F = /* glsl */`
  precision highp float;
  uniform sampler2D map;
  uniform vec3 uFog;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uDanger;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec4 c = texture2D(map, vUv);
    vec3 col = c.rgb;
    col = mix(col, col * vec3(1.25, 0.72, 0.72), uDanger);
    float f = smoothstep(uFogNear, uFogFar, vDepth) * 0.6;
    gl_FragColor = vec4(mix(col, uFog, f), 1.0);
  }
`;

export class Renderer {
  constructor(canvas, sim, { pngUrl }) {
    this.canvas = canvas; this.sim = sim;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.setClearColor(FOG, 1);
    this.aniso = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
    this.tex = makeTextures();

    this.camera = new THREE.PerspectiveCamera(84, 16 / 9, NEAR, FAR);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG, 70, 430);
    this.scene.background = new THREE.Color(FOG);
    this._buildWorld(sim.world);

    // PNG'en: egen scene, tegnet i fuld opløsning
    this.pngScene = new THREE.Scene();
    const pt = new THREE.TextureLoader().load(pngUrl, t => { this.gl.initTexture(t); this.pngReady = true; });
    pt.colorSpace = THREE.NoColorSpace; pt.anisotropy = this.aniso;
    pt.minFilter = THREE.LinearMipmapLinearFilter; pt.magFilter = THREE.LinearFilter; pt.generateMipmaps = true;
    this.pngTex = pt;
    const H = sim.chaser.h, W = H * (620 / 818);
    const geo = new THREE.PlaneGeometry(W, H); geo.translate(0, H / 2, 0);
    this.pngMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: pt }, uFog: { value: new THREE.Color(FOG) }, uFogNear: { value: 70 }, uFogFar: { value: 430 }, uDanger: { value: 0 } },
      vertexShader: PNG_V, fragmentShader: PNG_F, side: THREE.DoubleSide
    });
    this.png = new THREE.Mesh(geo, this.pngMat);
    this.png.frustumCulled = false;
    this.pngScene.add(this.png);
    this.pngW = W;

    // verdens skygge for PNG'en (tegnes i lav opløsning, så den er pixelet som resten)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(1.9, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    blob.rotation.x = -Math.PI / 2; this.blob = blob; this.scene.add(blob);

    // sammensætning: lavopløsningsbilledet op på skærmen + dybden med
    this.comp = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uScale: { value: 2 }, uRes: { value: new THREE.Vector2(2, 2) }, uLow: { value: new THREE.Vector2(2, 2) }, uLevels: { value: 31 }, uDither: { value: 0.9 }, uVignette: { value: 0.35 } },
      vertexShader: COMPOSITE_V, fragmentShader: COMPOSITE_F,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp); quad.frustumCulled = false;
    this.post = new THREE.Scene(); this.post.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.crateMeshes = new Map();
    this.target = null; this.lines = 480; this.fovNow = 84; this.clock = 0;
    this._seen = ''; this.resize();
  }

  _buildWorld(world) {
    const T = this.tex, s = this.scene;
    s.add(buildStatic(world, T, this.aniso));
    // jord
    T.grass.repeat.set(1300 / 16, 1300 / 16);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1300), new THREE.MeshBasicMaterial({ map: T.grass, fog: true }));
    ground.rotation.x = -Math.PI / 2; ground.matrixAutoUpdate = false; ground.updateMatrix(); s.add(ground);
    // plads
    const t2 = T.concrete.clone(); t2.needsUpdate = true;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA, 28), new THREE.MeshBasicMaterial({ map: t2, fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02;
    const uv = plaza.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * PLAZA * 2 / 8, (uv.getY(i) - 0.5) * PLAZA * 2 / 8);
    s.add(plaza);
    // sol
    const sunDir = new THREE.Vector3(0.45, 0.62, -0.64).normalize();
    this.sunDir = sunDir;
    // himmel: farvet halvkugle, billig og med synlige bånd
    const sky = new THREE.SphereGeometry(1000, 16, 8);
    const col = []; const top = new THREE.Color(0x3f7fe0), low = new THREE.Color(0xbfe0f4), tmp = new THREE.Color();
    const p = sky.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = Math.max(0, p.getY(i) / 1000); tmp.copy(low).lerp(top, Math.pow(y, 0.65)); col.push(tmp.r, tmp.g, tmp.b); }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; s.add(this.sky);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(60, 10), new THREE.MeshBasicMaterial({ color: 0xfff2b8, fog: false, depthWrite: false }));
    sun.position.copy(sunDir).multiplyScalar(900); sun.lookAt(0, 0, 0); sun.renderOrder = -9; this.sun = sun; s.add(sun);
    // skyer: flade skilte der altid vender mod kameraet, langt ude
    const rnd = mulberry32(11); this.clouds = [];
    const cm = new THREE.SpriteMaterial({ map: T.cloud, transparent: true, depthWrite: false, fog: false, alphaTest: 0.35 });
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(cm), a = rnd() * Math.PI * 2, d = 520 + rnd() * 300, w = 190 + rnd() * 160;
      m.scale.set(w, w * 0.5, 1); m.position.set(Math.cos(a) * d, 90 + rnd() * 150, Math.sin(a) * d); m.renderOrder = -8;
      this.clouds.push(m); s.add(m);
    }
    // bakker uden for muren
    const hills = [], hc = new THREE.Color();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.1, d = 345 + rnd() * 90, r = 55 + rnd() * 55, h = 28 + rnd() * 62;
      const g = new THREE.ConeGeometry(r, h, 6, 1); g.translate(0, h / 2, 0); g.rotateY(rnd() * 3);
      const c = []; const gp = g.attributes.position;
      for (let k = 0; k < gp.count; k++) { const t = gp.getY(k) / h; hc.setRGB(0.28 + 0.2 * t + rnd() * 0.02, 0.58 - 0.12 * t, 0.26 + 0.1 * t); c.push(hc.r, hc.g, hc.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.translate(Math.cos(a) * d, 0, Math.sin(a) * d); hills.push(g);
    }
    const merged = mergeGeos(hills);
    const hm = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })); hm.frustumCulled = false; s.add(hm);
  }

  // ---- størrelse ----
  check() {
    const key = `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
    if (key !== this._seen) this.resize();
  }
  setLines(n) { this.lines = n; this._seen = ''; this.resize(); }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._seen = `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
    const pxW = this.forced ? this.forced.w : Math.max(2, Math.round(window.innerWidth * dpr)), pxH = this.forced ? this.forced.h : Math.max(2, Math.round(window.innerHeight * dpr));
    const scale = Math.max(1, Math.round(pxH / this.lines));
    const w = Math.ceil(pxW / scale), h = Math.ceil(pxH / scale);
    this.scale = scale; this.lowW = w; this.lowH = h; this.pxW = pxW; this.pxH = pxH;
    this.gl.setPixelRatio(1); this.gl.setSize(pxW, pxH, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    if (this.target) { this.target.depthTexture.dispose(); this.target.dispose(); }
    const depth = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.target = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false, depthTexture: depth, generateMipmaps: false });
    const u = this.comp.uniforms;
    u.tColor.value = this.target.texture; u.tDepth.value = this.target.depthTexture;
    u.uScale.value = scale; u.uRes.value.set(pxW, pxH); u.uLow.value.set(w, h);
    this.camera.aspect = pxW / pxH; this.camera.updateProjectionMatrix();
  }

  // ---- kasser ----
  _syncCrates(dt) {
    const live = new Set();
    for (const k of this.sim.crates) {
      live.add(k);
      let m = this.crateMeshes.get(k);
      if (!m) {
        const c = k.col, sx = c.x1 - c.x0, sz = c.z1 - c.z0, h = c.top, b = new Batch();
        addBox(b, { ...c, color: 0xffffff }, 2.4, null);
        m = new THREE.Mesh(b.geometry(), new THREE.MeshBasicMaterial({ map: this.tex.crate, vertexColors: true, fog: true }));
        m.position.set((c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2);
        // geometrien er i verdensrum, så den flyttes tilbage til midten
        m.geometry.translate(-(c.x0 + c.x1) / 2, 0, -(c.z0 + c.z1) / 2);
        m.born = 0; m.frustumCulled = false; this.scene.add(m); this.crateMeshes.set(k, m);
      }
      m.born += dt;
      const pop = Math.min(1, m.born / 0.18), s = 0.2 + 0.8 * (1 - Math.pow(1 - pop, 3));
      m.scale.set(1, s, 1);
      m.visible = k.ttl > 3 || Math.floor(this.clock * 8) % 2 === 0;       // blinker lige før den forsvinder
    }
    for (const [k, m] of this.crateMeshes) if (!live.has(k)) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.crateMeshes.delete(k); }
  }

  // Et billede i en bestemt størrelse som PNG-data (til pressebilleder og tests)
  capture(w, h, view, menu) {
    this.forced = { w, h }; this.resize();
    this.draw(0, view, menu);
    const url = this.canvas.toDataURL('image/png');
    this.forced = null; this.resize();
    return url;
  }

  // view: { x, y, z, yaw, pitch, fov, shake, flash, danger }
  draw(dt, view, menu) {
    this.clock += dt;
    this.check();
    const sim = this.sim, c = sim.chaser, cam = this.camera;
    cam.position.set(view.x, view.y, view.z);
    cam.rotation.order = 'YXZ'; cam.rotation.set(view.pitch, view.yaw, view.roll || 0);
    if (Math.abs(view.fov - cam.fov) > 0.01) { cam.fov = view.fov; cam.updateProjectionMatrix(); }
    this.sky.position.copy(cam.position);
    this.sun.position.copy(cam.position).addScaledVector(this.sunDir, 900); this.sun.lookAt(cam.position);
    for (const m of this.clouds) { m.position.x += dt * 1.4; if (m.position.x > cam.position.x + 820) m.position.x -= 1640; }
    this._syncCrates(dt);

    // PNG'en
    const px = menu ? menu.x : c.x, py = menu ? 0 : c.y, pz = menu ? menu.z : c.z;
    const bob = Math.abs(Math.sin((menu ? menu.stride : c.stride))) * (menu || sim.state === 'playing' || sim.state === 'over' ? 0.28 : 0.04);
    const air = !menu && c.airborne;
    this.png.position.set(px, py + bob, pz);
    this.png.rotation.set(0, Math.atan2(cam.position.x - px, cam.position.z - pz), (menu || sim.state === 'playing') ? Math.sin(menu ? menu.stride : c.stride) * 0.07 : 0);
    this.png.scale.set(air ? 0.92 : 1, air ? 1.1 : 1, 1);
    this.blob.position.set(px, py + 0.04, pz);
    const near = Math.max(0.3, 1 - Math.max(0, py) / 10);
    this.blob.scale.setScalar(near);
    this.pngMat.uniforms.uDanger.value = view.danger || 0;

    // verden i lav opløsning
    this.gl.setRenderTarget(this.target);
    this.gl.render(this.scene, cam);
    this.gl.setRenderTarget(null);
    // lavopløsningsbilledet op på skærmen, med dybde
    this.gl.autoClear = false;
    this.gl.clear(true, true, false);
    this.gl.render(this.post, this.postCam);
    // PNG'en i fuld opløsning oven på
    if (this.pngReady) this.gl.render(this.pngScene, cam);
    this.gl.autoClear = true;
  }
}

function mergeGeos(list) {
  const flat = list.map(g => (g.index ? g.toNonIndexed() : g));
  let total = 0; for (const g of flat) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['color', 3]]) {
    const a = new Float32Array(total * size); let at = 0;
    for (const g of flat) { a.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, size));
  }
  return out;
}
