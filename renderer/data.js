// Initial state. No placeholder tasks, events, or calendars — the user's
// real day populates here from Google Calendar (read-only) and from the
// Quick Add flow.

export const PALETTE = ['sage', 'lavender', 'sky', 'rose', 'amber'];

export const sampleData = {
  schemaVersion: 2,
  currentScreen: 'connect',
  hasCompletedFirstRun: false,

  // Computed at boot in state.js so the date always matches the system clock.
  date: '',
  nowMinutes: 0,

  calendars: [],          // populated from Google Calendar after connect.
  events: [],             // populated from Google Calendar.
  tasks: [],              // user-created via Quick Add.
  reviewDecisions: {},

  // Google connection bookkeeping (renderer-visible — actual tokens stay in main).
  googleConnected: false,
  googleAccount: null,
  googleSyncing: false,
  googleError: null,
  lastSyncedAt: null,
};
