'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseYml, cmp } = require('../src/lib/mac-update');

const YML = `version: 1.2.0
files:
  - url: Worldwide-macOS.zip
    sha512: abc+/=
    size: 218674597
    blockMapSize: 230000
  - url: Worldwide-macOS.dmg
    sha512: def
    size: 225000000
path: Worldwide-macOS.zip
releaseDate: '2026-10-26T14:47:18.000Z'
`;
test('latest-mac.yml læses', () => {
  const y = parseYml(YML);
  assert.equal(y.version, '1.2.0'); assert.deepEqual(y.zip, { url: 'Worldwide-macOS.zip', sha512: 'abc+/=', size: 218674597 });
});
test('versioner sammenlignes tal for tal', () => { assert.ok(cmp('1.10.0', '1.9.9') > 0); assert.equal(cmp('1.0.0', '1.0.0'), 0); assert.ok(cmp('1.0.1', '1.1.0') < 0); });
