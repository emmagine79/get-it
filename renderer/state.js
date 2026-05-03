import { sampleData } from './data.js';
import { fmtTodayLabel, nowMinutesClamped } from './util.js';

const STORAGE_KEY = 'get-it-state-v2';

// Migrate older persisted state in place. Idempotent — safe to run on
// already-current state. Bumps schemaVersion to the latest sampleData.
function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  // v2 → v3: `task.tag` (string) became `task.tags` (string[]).
  if ((parsed.schemaVersion || 1) < 3 && Array.isArray(parsed.tasks)) {
    parsed.tasks = parsed.tasks.map((t) => {
      if (t && t.tag != null && !Array.isArray(t.tags)) {
        const tags = String(t.tag)
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const next = { ...t, tags };
        delete next.tag;
        return next;
      }
      return t;
    });
  }

  parsed.schemaVersion = sampleData.schemaVersion;
  return parsed;
}

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
    const parsed = migrate(JSON.parse(raw));
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
// Preserves user-chosen color and visibility for known calendars; new
// calendars get a random palette color that isn't already in use by
// another calendar, falling back to repeats once the palette is full.
import { PALETTE } from './data.js';
import { randomColor } from './util.js';

export function replaceCalendarsAndEvents(calendars, events) {
  setState((s) => {
    const previous = new Map(s.calendars.map((c) => [c.id, c]));
    const used = [...previous.values()].map((c) => c.color);
    const merged = calendars.map((c) => {
      const prev = previous.get(c.id);
      let color = prev?.color;
      if (!color) {
        color = randomColor(PALETTE, used);
        used.push(color);
      }
      return {
        id: c.id,
        name: c.name,
        subtitle: c.subtitle ?? prev?.subtitle ?? '',
        color,
        visible: prev ? prev.visible : true,
      };
    });
    return { ...s, calendars: merged, events, lastSyncedAt: Date.now() };
  });
}
