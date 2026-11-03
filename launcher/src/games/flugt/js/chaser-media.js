// Eget jagtbillede: billeder (png, jpg, gif, webp, avif, bmp, svg ...), animerede billeder og videoer (mp4, webm, mov ...).
// Filen gemmes i browserens lager (IndexedDB) på denne maskine og læses igen næste gang. Alt det der kan afspilles af Chromium virker.
import * as THREE from './three.module.js';

const MAX_SIDE = 2048;
const DB = 'flugt-media', STORE = 'kv';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kv(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), r = fn(st);
    tx.oncomplete = () => { db.close(); res(r && r.result); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
  });
}
export const saveFile = (key, file) => kv('readwrite', s => s.put({ blob: file, name: file.name || 'fil', type: file.type || '' }, key));
export const loadFile = key => kv('readonly', s => s.get(key)).catch(() => null);
export const clearFile = key => kv('readwrite', s => s.delete(key)).catch(() => {});

const wait = (ms, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('tidsfrist')), ms))]);

function configure(tex, aniso) {
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = aniso || 1;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  return tex;
}
function fit(w, h) { const k = Math.min(1, MAX_SIDE / Math.max(w, h)); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; }

// Et almindeligt billede: createImageBitmap, ellers et <img> (SVG m.fl.)
async function decodeImage(blob) {
  try { const b = await createImageBitmap(blob); return { src: b, w: b.width, h: b.height, close: () => b.close && b.close() }; }
  catch (e) {
    const url = URL.createObjectURL(blob), img = new Image();
    img.src = url;
    try { await wait(10000, img.decode()); } catch (er) { URL.revokeObjectURL(url); throw er; }
    const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
    return { src: img, w, h, close: () => URL.revokeObjectURL(url) };
  }
}

async function fromImage(blob, aniso) {
  // animeret gif/webp/avif/apng: afkod billederne med ImageDecoder, hvis browseren kan
  const type = blob.type;
  if (typeof ImageDecoder !== 'undefined' && /^image\/(gif|webp|avif|png|apng)/.test(type)) {
    try {
      const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type });
      await wait(8000, dec.tracks.ready);
      const frames = dec.tracks.selectedTrack.frameCount;
      if (frames > 1) {
        const first = (await dec.decode({ frameIndex: 0 })).image;
        const [w, h] = fit(first.displayWidth, first.displayHeight);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(first, 0, 0, w, h);
        let dur = (first.duration || 100000) / 1000; first.close();
        const tex = configure(new THREE.CanvasTexture(c), aniso);
        let idx = 0, clock = 0, busy = false;
        return {
          kind: 'animeret', texture: tex, aspect: w / h,
          tick(dt) {
            clock += dt * 1000;
            if (busy || clock < Math.max(20, dur)) return;
            busy = true; clock = 0;
            const next = (idx + 1) % frames;
            dec.decode({ frameIndex: next }).then(r => {
              idx = next; g.clearRect(0, 0, w, h); g.drawImage(r.image, 0, 0, w, h); dur = (r.image.duration || 100000) / 1000; r.image.close(); tex.needsUpdate = true;
            }).catch(() => {}).finally(() => { busy = false; });
          },
          dispose() { try { dec.close(); } catch (e) {} tex.dispose(); }
        };
      }
      dec.close();
    } catch (e) { /* ikke animeret eller ikke understøttet: tegn det som almindeligt billede */ }
  }
  const im = await decodeImage(blob);
  const [w, h] = fit(im.w, im.h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(im.src, 0, 0, w, h);
  im.close();
  const tex = configure(new THREE.CanvasTexture(c), aniso);
  return { kind: 'billede', texture: tex, aspect: w / h, dispose() { tex.dispose(); } };
}

async function fromVideo(blob) {
  const url = URL.createObjectURL(blob), v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await wait(12000, new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video kan ikke læses')); }));
    if (!v.videoWidth) throw new Error('ingen billedside');
    await v.play().catch(() => {});
  } catch (e) { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); throw e; }
  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return {
    kind: 'video', texture: tex, aspect: v.videoWidth / v.videoHeight,
    tick() { if (v.paused && !v.ended) v.play().catch(() => {}); },
    dispose() { v.pause(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); tex.dispose(); }
  };
}

// Prøver den rigtige vej først ud fra filtypen og den anden bagefter (filer uden mimetype, .mov, .mkv osv.)
export async function makeMedia(blob, aniso = 1) {
  const isVideo = (blob.type || '').startsWith('video/') || /\.(mp4|m4v|mov|webm|ogv|ogg|mkv|avi|3gp)$/i.test(blob.name || '');
  const order = isVideo ? [fromVideo, b => fromImage(b, aniso)] : [b => fromImage(b, aniso), fromVideo];
  let err;
  for (const f of order) { try { return await f(blob); } catch (e) { err = e; } }
  throw err || new Error('formatet kan ikke læses');
}
