'use strict';
const path = require('path');
const { getJson } = require('./net');
const { readJson, writeJson } = require('./util');

const bundled = () => require('../shared/games.json');

function valid(c) {
  return c && c.schema === 1 && Array.isArray(c.games) && c.games.every(g => g && typeof g.id === 'string' && g.package && typeof g.package.kind === 'string');
}

// Kataloget ligger på hjemmesiden, så nye spil og nye udgaver kan komme ud uden en ny launcher.
// Rækkefølge: frisk fra nettet → sidst hentede → den der fulgte med appen.
function createCatalog({ userData, log = () => {} }) {
  const cacheFile = path.join(userData, 'catalog.json');
  let current = (() => { const c = readJson(cacheFile); return valid(c) ? c : bundled(); })();
  return {
    get: () => current,
    game: id => current.games.find(g => g.id === id) || null,
    async refresh() {
      const site = (current.site || bundled().site).replace(/\/?$/, '/');
      try {
        const c = await getJson(site + 'catalog.json', { timeout: 6000 });
        if (!valid(c)) throw new Error('kataloget er ugyldigt');
        current = c; writeJson(cacheFile, c);
        return { changed: true, catalog: c };
      } catch (e) { log('[katalog] kunne ikke hentes:', e.message); return { changed: false, catalog: current }; }
    }
  };
}

module.exports = { createCatalog, bundled, valid };
