const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('main process waits for Google token rehydration before creating the window', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const initIndex = source.indexOf('await google.init({');
  const windowIndex = source.indexOf('createWindow();');

  assert.notEqual(initIndex, -1);
  assert.notEqual(windowIndex, -1);
  assert.ok(initIndex < windowIndex);
});

test('main process pins userData to the v0.1.0 app identity before boot', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const preserveIndex = source.indexOf('preserveUserDataPath();');
  const readyIndex = source.indexOf('app.whenReady()');

  assert.match(source, /LEGACY_USER_DATA_NAME = 'get-it'/);
  assert.match(source, /app\.setPath\('userData'/);
  assert.notEqual(preserveIndex, -1);
  assert.notEqual(readyIndex, -1);
  assert.ok(preserveIndex < readyIndex);
});
