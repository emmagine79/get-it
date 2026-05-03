// Initial sample data so the app is usable on first launch.
// Calendars store user-chosen color names (semantic, not Google's color IDs).
// Tasks with `start` set are time-blocked; without it, they live in the list.
// Events come from "Google Calendar" and are read-only in the UI.

export const PALETTE = ['sage', 'lavender', 'sky', 'rose', 'amber'];

export const sampleData = {
  schemaVersion: 1,
  currentScreen: 'connect',          // first-run on fresh install; user clicks through
  hasCompletedFirstRun: false,
  date: 'Wednesday, May 6',
  nowMinutes: 10 * 60 + 14,          // 10:14 AM, used for the "now" line

  calendars: [
    { id: 'work',      name: 'Work / awesome@example.com', subtitle: 'Meetings, reviews, deadlines',          color: 'sage',     visible: true  },
    { id: 'personal',  name: 'Personal',                   subtitle: 'Appointments, health, family',          color: 'lavender', visible: true  },
    { id: 'shared',    name: 'Home shared',                subtitle: 'Shared apartment reminders',            color: 'sky',      visible: true  },
    { id: 'birthdays', name: 'Birthdays',                  subtitle: 'Visible in list mode, hidden in schedule by default', color: 'rose', visible: false },
  ],

  // Read-only "Google Calendar" events.
  events: [
    { id: 'evt-1', calendarId: 'work',     title: 'Design critique',      start: '08:45', end: '09:30' },
    { id: 'evt-2', calendarId: 'personal', title: 'Therapy call',          start: '10:45', end: '11:15' },
    { id: 'evt-3', calendarId: 'shared',   title: 'Apartment walkthrough', start: '15:00', end: '15:40' },
  ],

  // User tasks. `start`/`end` set => appears in the schedule. Otherwise it lives in the list.
  tasks: [
    { id: 'tsk-1', title: 'Morning landing',         note: 'Tea, medication, choose one kind start',     tag: 'morning',   done: false, start: '07:15', end: '08:30' },
    { id: 'tsk-2', title: 'Focus: invoice cleanup',  note: 'Quiet block, notifications paused',          tag: 'focus',     done: false, start: '11:30', end: '13:00' },
    { id: 'tsk-3', title: 'Light reset',             note: 'Ten-minute tidy, then done for now',         tag: 'home',      done: false, start: '16:30', end: '17:30' },
    { id: 'tsk-4', title: 'Return library book',     note: 'Errand / can move into afternoon',           tag: 'errand',    done: false },
    { id: 'tsk-5', title: 'Write reimbursement note',note: 'Needs 15 quiet minutes',                     tag: 'focus',     done: false },
    { id: 'tsk-6', title: 'Water balcony herbs',     note: 'Closed at 8:10 AM',                          tag: 'home',      done: true  },
    { id: 'tsk-7', title: 'Pick dinner before 5',    note: 'Make the evening easier',                    tag: 'self-care', done: false },
    { id: 'tsk-8', title: 'Confirm Saturday ride',   note: 'Text Maya',                                  tag: 'people',    done: false },
  ],

  // End-of-day decisions, keyed by task id.
  // Shape: { decision: 'done'|'roll'|'partial', percent?: number, partialMode?: 'roll'|'done' }
  reviewDecisions: {},
};
