import { sampleData } from './data.js';
import { fmtTodayLabel, nowMinutesClamped } from './util.js';

const STORAGE_KEY = 'get-it-state-v2';

function clone(obj) {
  return typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function fresh() {
  const base = clone(sampleData);
  base.date = fmtTodayLabel();
  base.nowMinutes = nowMinutesClamped();
  return base;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== sampleData.schemaVersion) return fresh();
    return {
      ...fresh(),
      ...parsed,
      // Always recompute date / now on boot — these aren't persisted truth.
      date: fmtTodayLabel(),
      nowMinutes: nowMinutesClamped(),
      // Sync flags shouldn't survive a restart.
      googleSyncing: false,
      googleError: null,
    };
  } catch {
    return fresh();
  }
}

let state = load();
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(updater) {
  const next = typeof updater === 'function'
    ? updater(state)
    : { ...state, ...updater };
  state = next;
  persist();
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  try {
    // Don't persist transient flags.
    const { googleSyncing, googleError, nowMinutes, date, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {}
}

export function resetState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  state = fresh();
  for (const fn of listeners) fn(state);
}

let nextIdCounter = 1;
export function newId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${(nextIdCounter++).toString(36)}`;
}

// ------------------------------ Tasks ------------------------------

export function updateTask(id, patch) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }));
}

export function deleteTask(id) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.filter((t) => t.id !== id),
    reviewDecisions: Object.fromEntries(
      Object.entries(s.reviewDecisions).filter(([k]) => k !== id),
    ),
  }));
}

export function removeTaskSchedule(id) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, start: undefined, end: undefined } : t,
    ),
  }));
}

export function scheduleTask(id, start, end) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, start, end, mode: 'block' } : t,
    ),
  }));
}

export function addTask(task) {
  setState((s) => ({
    ...s,
    tasks: [...s.tasks, { id: newId('tsk'), done: false, mode: 'task', ...task }],
  }));
}

export function setReviewDecision(taskId, decision) {
  setState((s) => ({
    ...s,
    reviewDecisions: { ...s.reviewDecisions, [taskId]: decision },
  }));
}

export function rolloverTask(id) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, start: undefined, end: undefined, done: false } : t,
    ),
  }));
}

// ------------------------------ Calendars ------------------------------

export function setCalendarColor(calId, color) {
  setState((s) => ({
    ...s,
    calendars: s.calendars.map((c) => (c.id === calId ? { ...c, color } : c)),
  }));
}

export function setCalendarVisible(calId, visible) {
  setState((s) => ({
    ...s,
    calendars: s.calendars.map((c) => (c.id === calId ? { ...c, visible } : c)),
  }));
}

// Replace calendars + events wholesale (used after a Google sync).
// Preserves user-chosen color and visibility for known calendars.
export function replaceCalendarsAndEvents(calendars, events) {
  setState((s) => {
    const previous = new Map(s.calendars.map((c) => [c.id, c]));
    const palette = ['sage', 'lavender', 'sky', 'rose', 'amber'];
    const merged = calendars.map((c, i) => {
      const prev = previous.get(c.id);
      return {
        id: c.id,
        name: c.name,
        subtitle: c.subtitle ?? prev?.subtitle ?? '',
        color: prev?.color || palette[i % palette.length],
        visible: prev ? prev.visible : true,
      };
    });
    return { ...s, calendars: merged, events, lastSyncedAt: Date.now() };
  });
}
