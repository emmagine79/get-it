const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadUtil() {
  const file = path.join(__dirname, '..', 'renderer', 'util.js');
  const source = fs
    .readFileSync(file, 'utf8')
    .replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nObject.assign(globalThis, { minutesToTime, fmtClock, fmtRange });`, context);
  return context;
}

test('minutesToTime wraps 24:00 to midnight instead of emitting an invalid time', () => {
  const { minutesToTime } = loadUtil();

  assert.equal(minutesToTime(24 * 60), '00:00');
});

test('fmtClock formats 24:00 as 12:00 AM', () => {
  const { fmtClock } = loadUtil();

  assert.equal(fmtClock(24 * 60), '12:00 AM');
});

test('fmtRange handles blocks ending at midnight', () => {
  const { fmtRange } = loadUtil();

  assert.equal(fmtRange('23:30', '00:00'), '11:30 PM – 12:00 AM');
});
