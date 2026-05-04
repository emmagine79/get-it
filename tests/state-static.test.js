const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('state stores task history for later completed and reviewed task views', () => {
  const data = read('renderer/data.js');
  const state = read('renderer/state.js');

  assert.match(data, /schemaVersion:\s*5/);
  assert.match(data, /taskHistory:\s*\[\]/);
  assert.match(state, /function appendTaskHistory/);
  assert.match(state, /patch\.done \? 'done' : 'reopened'/);
  assert.match(state, /'review'/);
  assert.match(state, /export function clearReviewDecision/);
});

test('state stores the selected color theme as a persisted preference', () => {
  const data = read('renderer/data.js');
  const state = read('renderer/state.js');

  assert.match(data, /schemaVersion:\s*5/);
  assert.match(data, /theme:\s*'light'/);
  assert.match(state, /parsed\.theme = 'light'/);
  assert.doesNotMatch(state, /const \{[^}]*theme[^}]*\} = state/);
});
