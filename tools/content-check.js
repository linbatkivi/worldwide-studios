#!/usr/bin/env node
// Tjekker et spils billeder og tekster i kataloget og stempler dem til en udgave.
//
//   node tools/content-check.js blindline            tjekker og viser fejl
//   node tools/content-check.js blindline 0.9.0      tjekker, og hvis alt er i orden: stempler indholdet til 0.9.0
//   node tools/content-check.js blindline 0.9.0 --same   stempler selvom billeder og tekst er uændret siden sidste udgave
//
// publish-game.js nægter at udgive en version, hvis kataloget ikke er stemplet til netop den version.
// Reglerne står i docs/katalog-indhold.md.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), file = path.join(root, 'catalog', 'games.json');

const BANNED = [
  'oplev', 'dyk ned', 'episk', 'ultimativ', 'revolutionerende', 'eventyr', 'spændende', 'fantastisk', 'intens', 'adrenalin', 'udforsk', 'rejse',
  'nådeløs', 'banebrydende', 'perfekt', 'uforglemmelig', 'sømløs', 'imponerende', 'hæsblæsende', 'frenetisk', 'pulserende', 'levende',
  'immersive', 'journey', 'dive into', 'experience', 'thrilling', 'ultimate', 'epic', 'cutting-edge', 'seamless', 'unleash', 'breathtaking',
  'stunning', 'adrenaline', 'explore', 'masterfully', 'heart-pounding', 'like never before'
];
const PATTERNS = [
  [/[—–]/, 'tankestreg (— eller –). Brug punktum eller komma'],
  [/!/, 'udråbstegn'],
  [/ikke (bare|kun|blot|alene)[^.]*, men/i, '"ikke bare … men …"-konstruktion'],
  [/not (just|only)[^.]*, but/i, '"not just … but …"-konstruktion'],
  [/…|\.\.\./, 'prikker (…)'],
  [/\b(vi|our|we)\b.*\b(passion|lidenskab)\b/i, 'påstande om lidenskab']
];

const hashOf = g => {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify([g.tagline, g.description, g.facts, g.genre, g.art]));
  for (const rel of [g.art.hero, g.art.card, ...(g.art.shots || [])]) {
    const f = path.join(root, 'site/assets/art', rel); if (fs.existsSync(f)) h.update(fs.readFileSync(f));
  }
  return h.digest('hex').slice(0, 16);
};

function webpSize(buf) {                                   // læser bredde og højde direkte i filen
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const t = buf.toString('ascii', 12, 16);
  if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (t === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  return null;
}

function check(g) {
  const bad = [];
  const art = g.art || {};
  const files = [['hero', art.hero], ['card', art.card], ...(art.shots || []).map((s, i) => ['skærmbillede ' + (i + 1), s])];
  if (!art.hero || !art.card) bad.push('art.hero og art.card mangler');
  if ((art.shots || []).length < 4) bad.push('mindst 4 skærmbilleder kræves (der er ' + (art.shots || []).length + ')');
  for (const [name, rel] of files) {
    if (!rel) continue;
    const f = path.join(root, 'site/assets/art', rel);
    if (!fs.existsSync(f)) { bad.push(`${name}: ${rel} findes ikke i site/assets/art`); continue; }
    const s = webpSize(fs.readFileSync(f));
    if (!s) { bad.push(`${name}: ${rel} er ikke en gyldig webp`); continue; }
    if (name === 'hero' && s.w < 1920) bad.push(`hero er ${s.w} px bred, skal være mindst 1920`);
    if (name.startsWith('skærm') && s.w < 1280) bad.push(`${name} er ${s.w} px bred, skal være mindst 1280`);
    if (name === 'hero' || name.startsWith('skærm')) { const r = s.w / s.h; if (r < 1.7 || r > 1.85) bad.push(`${name} er ${s.w}×${s.h}, skal være 16:9`); }
  }
  if (new Set([art.hero, ...(art.shots || [])]).size !== 1 + (art.shots || []).length) bad.push('samme billede bruges flere gange');
  for (const lang of ['da', 'en']) {
    for (const key of ['tagline', 'description']) {
      const t = (g[key] || {})[lang];
      if (!t) { bad.push(`${key}.${lang} mangler`); continue; }
      const low = t.toLowerCase();
      for (const w of BANNED) if (low.includes(w)) bad.push(`${key}.${lang} indeholder «${w}»`);
      for (const [re, why] of PATTERNS) if (re.test(t)) bad.push(`${key}.${lang}: ${why}`);
      if (key === 'description' && (t.length < 180 || t.length > 650)) bad.push(`description.${lang} er ${t.length} tegn, skal være 180 til 650`);
      if (key === 'tagline' && t.length > 95) bad.push(`tagline.${lang} er ${t.length} tegn, max 95`);
    }
  }
  return bad;
}

function stamp(id, version, same) {
  const cat = JSON.parse(fs.readFileSync(file, 'utf8')), g = cat.games.find(x => x.id === id);
  if (!g) { console.error('ukendt spil: ' + id); return 1; }
  const bad = check(g);
  if (bad.length) { console.error('✗ ' + id + ' er ikke klar:\n  - ' + bad.join('\n  - ')); return 1; }
  const hash = hashOf(g);
  if (version) {
    if (g.content && g.content.hash === hash && g.content.reviewedFor !== version && !same) {
      console.error(`✗ billeder og tekst er præcis som ved ${g.content.reviewedFor}. Ændrede spillet sig ikke synligt, så kør igen med --same. Ellers: tag nye billeder og ret teksten (docs/katalog-indhold.md).`);
      return 1;
    }
    g.content = { reviewedFor: version, hash, reviewedAt: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
    console.log(`✓ ${id}: billeder og tekst stemplet til ${version}`);
  } else console.log(`✓ ${id}: billeder og tekst består tjekket`);
  return 0;
}

module.exports = { check, hashOf };
if (require.main === module) {
  const [id, version, ...f] = process.argv.slice(2);
  if (!id) { console.error('brug: node tools/content-check.js <spil> [version] [--same]'); process.exit(1); }
  process.exit(stamp(id, version, f.includes('--same')));
}
