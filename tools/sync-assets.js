#!/usr/bin/env node
// Holder de filer der findes både på hjemmesiden og i launcheren ens. Kør efter ændringer i site/assets/js/sphere.js.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
for (const [from, to] of [['site/assets/js/sphere.js', 'launcher/src/renderer/sphere.js']]) {
  fs.copyFileSync(path.join(root, from), path.join(root, to));
  console.log('kopieret', from, '→', to);
}
