import { sampleData } from './data.js';

const STORAGE_KEY = 'get-it-state-v1';

function clone(obj) {
  return typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(sampleData);
    const parsed = JSON.parse(raw);
    // Merge with sampleData defaults so new fields appear after upgrade.
    if (parsed.schemaVersion !== sampleData.schemaVersion) {
      return clone(sampleData);
    }
    return { ...clone(sampleData), ...parsed };
  } catch {
    return clone(sampleData);
  }
}

let state = load();
const listeners = new Set();

export function getState() {
  return state;
}

// `updater` may be a partial object or a function returning the next state.
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function resetState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  state = clone(sampleData);
  for (const fn of listeners) fn(state);
}

// ------------------------------ Mutators ------------------------------

let nextIdCounter = 1;
export function newId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${(nextIdCounter++).toString(36)}`;
}

export function updateTask(id, patch) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
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
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, start, end } : t)),
  }));
}

export function addTask(task) {
  setState((s) => ({
    ...s,
    tasks: [...s.tasks, { id: newId('tsk'), done: false, ...task }],
  }));
}

export function setReviewDecision(taskId, decision) {
  setState((s) => ({
    ...s,
    reviewDecisions: { ...s.reviewDecisions, [taskId]: decision },
  }));
}

export function rolloverTask(id) {
  // For this prototype "tomorrow" just means clearing the schedule and keeping it
  // in the task list. A real version would carry a date forward.
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, start: undefined, end: undefined, done: false } : t,
    ),
  }));
}

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
