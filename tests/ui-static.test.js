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

test('schedule and split timelines preserve scroll position across rerenders', () => {
  const screens = read('renderer/screens.js');

  assert.match(screens, /preserveTimelineScroll/);
  assert.match(screens, /data-role="schedule-scroll"/);
  assert.match(screens, /data-role="bridge-scroll"/);
});

test('schedule blocks expose resize handles for drag duration editing', () => {
  const screens = read('renderer/screens.js');
  const css = read('renderer/styles.css');

  assert.match(screens, /data-resize-handle="top"/);
  assert.match(screens, /data-resize-handle="bottom"/);
  assert.match(screens, /attachBlockResizeHandlers/);
  assert.match(css, /\.resize-handle/);
});

test('split view mini schedule includes a visible time rail', () => {
  const screens = read('renderer/screens.js');
  const css = read('renderer/styles.css');

  assert.match(screens, /class="mini-time-rail"/);
  assert.match(css, /\.mini-time-rail/);
});

test('review decisions can be undone and partial progress has live fill', () => {
  const screens = read('renderer/screens.js');
  const css = read('renderer/styles.css');

  assert.match(screens, /data-action="undo-review"/);
  assert.match(screens, /style="--partial-pct:/);
  assert.match(css, /\.slider-fill/);
});

test('narrow windows preserve the desktop planner width instead of collapsing early', () => {
  const main = read('main.js');
  const css = read('renderer/styles.css');

  assert.match(main, /minWidth:\s*1180/);
  assert.match(css, /\.desktop\s*\{[^}]*min-width:\s*1180px/s);
  assert.match(css, /@media \(max-width:\s*760px\)/);
});
