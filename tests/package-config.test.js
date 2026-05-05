const assert = require('node:assert/strict');
const { test } = require('node:test');
const packageJson = require('../package.json');

test('Windows installer keeps the legacy executable name for stable upgrades', () => {
  assert.equal(packageJson.build.productName, 'Gentle Day');
  assert.equal(packageJson.build.win.executableName, 'Get It');
  assert.equal(packageJson.build.win.artifactName, 'Gentle.Day-Setup-${version}-${arch}.${ext}');
  assert.equal(packageJson.build.nsis.oneClick, false);
});
