const assert = require('node:assert/strict');
const { test } = require('node:test');
const packageJson = require('../package.json');

test('Windows installer keeps the legacy executable name for stable upgrades', () => {
  assert.equal(packageJson.build.productName, 'Gentle Day');
  assert.equal(packageJson.build.win.executableName, 'Get It');
  assert.equal(packageJson.build.win.artifactName, 'Gentle.Day-Setup-${version}-${arch}.${ext}');
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
  assert.equal(packageJson.build.nsis.oneClick, false);
});

test('Windows installer includes a rescue path for broken legacy installs', () => {
  const script = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');

  assert.match(script, /!macro customInit/);
  assert.match(script, /Gentle Day\.exe/);
  assert.match(script, /Get It\.exe/);
  assert.match(script, /!macro customUnInstallCheck/);
  assert.match(script, /Previous uninstaller failed/);
  assert.match(script, /Delete "\$INSTDIR\\Gentle Day\.exe"/);
});
