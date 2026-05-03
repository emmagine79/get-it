const assert = require('node:assert/strict');
const test = require('node:test');

const googleIntegration = require('../google.js');

test('Google event normalization keeps all-day events out of the timed rail', () => {
  const event = googleIntegration._private.normalizeGoogleEvent('primary', {
    id: 'all-day-1',
    summary: 'Conference',
    start: { date: '2026-05-03' },
    end: { date: '2026-05-04' },
  });

  assert.equal(event.allDay, true);
  assert.equal(event.start, null);
  assert.equal(event.end, null);
  assert.equal(event.title, 'Conference');
});

test('OAuth auth URL options include and preserve a CSRF state value', () => {
  const state = 'state-token';

  const options = googleIntegration._private.buildAuthUrlOptions(state);

  assert.equal(options.state, state);
  assert.deepEqual(options.scope, ['https://www.googleapis.com/auth/calendar.readonly']);
});

test('token file writes use owner-only permissions', () => {
  assert.equal(googleIntegration._private.tokenFileMode, 0o600);
});
