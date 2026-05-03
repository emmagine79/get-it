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
