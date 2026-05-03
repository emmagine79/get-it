// Initial state. No placeholder tasks, events, or calendars — the user's
// real day populates here from Google Calendar (read-only) and from the
// Quick Add flow.

// Each palette entry is a CSS variable name available in :root.
// `random` is a special token in the picker, not a color itself.
export const PALETTE = [
  'sage',
  'lavender',
  'sky',
  'rose',
  'amber',
  'peach',
  'mint',
  'periwinkle',
  'blush',
  'cocoa',
  'lemon',
  'aqua',
];

export const sampleData = {
  schemaVersion: 4,
  currentScreen: 'connect',
  hasCompletedFirstRun: false,

  // Computed at boot in state.js so the date always matches the system clock.
  date: '',
  nowMinutes: 0,

  calendars: [],          // populated from Google Calendar after connect.
  events: [],             // populated from Google Calendar.
  tasks: [],              // user-created via Quick Add.
  reviewDecisions: {},
  taskHistory: [],        // append-only task state snapshots for later archive/history views.

  // Google connection bookkeeping (renderer-visible — actual tokens stay in main).
  googleConnected: false,
  googleAccount: null,
  googleSyncing: false,
  googleError: null,
  lastSyncedAt: null,
};
