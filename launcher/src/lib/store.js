'use strict';
const { readJson, writeJson } = require('./util');

const DEFAULTS = () => ({
  v: 1,
  installs: {},       // id -> { dir }
  stats: {},          // id -> { lastPlayed, playSeconds }
  settings: { lang: 'auto', gamesDir: null, autoUpdate: true, dev: { enabled: false, links: {}, godot: '' } }
});

function createStore(file) {
  const base = DEFAULTS(), saved = readJson(file, {});
  const state = {
    ...base, ...saved,
    settings: { ...base.settings, ...(saved.settings || {}), dev: { ...base.settings.dev, ...((saved.settings || {}).dev || {}) } }
  };
  return { get: () => state, save: () => writeJson(file, state) };
}

module.exports = { createStore, DEFAULTS };
