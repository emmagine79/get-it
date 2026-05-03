const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('topbar actions are rendered from current screen context', () => {
  const app = read('renderer/app.js');

  assert.match(app, /function renderTopbarActions\(id\)/);
  assert.match(app, /id !== 'bridge'/);
  assert.match(app, /id !== 'add'/);
});

test('completed first-run state removes onboarding from primary navigation', () => {
  const app = read('renderer/app.js');
  const css = read('renderer/styles.css');

  assert.match(app, /tab\.dataset\.screen === 'connect'/);
  assert.match(app, /hasCompletedFirstRun/);
  assert.match(app, /tab\.hidden =/);
  assert.match(app, /classList\.toggle\('is-hidden'/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(css, /\.tab\.is-hidden\s*\{\s*display:\s*none !important;\s*\}/);
});

test('sidebar navigation uses semantic icon classes instead of placeholder letters', () => {
  const html = read('renderer/index.html');

  assert.match(html, /<span class="tab-icon icon-schedule"/);
  assert.doesNotMatch(html, /<span class="tab-icon">[TCBRSGL]<\/span>/);
});

test('time controls reserve enough inline space for native time values', () => {
  const css = read('renderer/styles.css');

  assert.match(css, /\.input\.time-input/);
  assert.match(css, /min-width:\s*160px/);
});

test('split view includes a compact agenda summary for scheduled work', () => {
  const screens = read('renderer/screens.js');
  const css = read('renderer/styles.css');

  assert.match(screens, /class="mini-agenda"/);
  assert.match(css, /\.mini-agenda/);
});
