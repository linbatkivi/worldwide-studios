#!/usr/bin/env node
// Kopierer det, launcheren deler med resten af repoet, ind i src/shared. Køres automatisk af npm start og dist.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(__dirname, '..', 'src', 'shared');
fs.mkdirSync(out, { recursive: true });
for (const [from, to] of [['sdk/js/worldwide.js', 'worldwide.js'], ['catalog/games.json', 'games.json'], ['sdk/js/worldwide.js', '../games/flugt/js/worldwide.js']]) {
  fs.copyFileSync(path.join(root, from), path.join(out, to));
}
