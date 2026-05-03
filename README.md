# Get It

A calm, Apple-Reminders-meets-Windows-11 day-planning desktop app for neurodivergent planners.

Get It has two ways to look at your day:

- **Schedule** — a soft visual timeline with read-only Google Calendar events as anchors and your own time blocks layered on top.
- **List** — a flexible checklist with no times, for the days when structure is more friction than help.

Tasks move between the two views with drag-and-drop. The schedule is a sketch, not a contract.

## Run it

You need [Node.js](https://nodejs.org) 18 or later. Then, from this folder:

```bash
npm install
npm start
```

The app launches at 1200×800 with sample data already loaded — three calendars, a few "Google" events, a handful of tasks, and a few time blocks. No accounts needed.

## What's inside

| Screen          | What it does                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------- |
| First run       | Mock Google Calendar connect (or skip). Stored locally so it shows once.                          |
| Schedule        | Time-blocked day; calendar events are read-only; planned tasks drag-and-drop into time slots.    |
| List            | Untimed checklist with calendar context in the side panel.                                        |
| Both views      | Side-by-side miniature of schedule and list.                                                      |
| Quick add       | Add a task, choose Task / Time block / Maybe, pick a soft bucket, optional time.                  |
| Evening review  | Mark each open task as Done enough, Roll to tomorrow, or Partial (with completion slider).        |
| Calendars       | Manage layers, toggle visibility, pick colors manually (never auto-assigned).                     |

### Interactions you can try

- **Drag a list task into the schedule** to time-block it. It snaps to the nearest 15 minutes and inherits a 30-min duration by default.
- **Drag a planned block back to the Untimed panel** (right side of the schedule) to make it untimed again.
- **Click the round check** on any task to mark it done.
- **Open the Evening review** — choose Partial on any open task, then drag the slider and decide whether to roll the remainder or call it done.
- **Open Calendars** and click a calendar row, then pick any swatch from the right panel — every event with that calendar updates instantly.
- **Triple-click the "Get It" logo** in the sidebar to restore sample data if you've explored your way into a corner.

### Persistence

Everything you do is stored in the renderer's `localStorage` under the key
`get-it-state-v1`. Closing and reopening the app remembers your state,
including which screen you were on.

## Project layout

```
.
├── main.js             Electron main process + IPC for window controls.
├── preload.js          contextBridge exposing minimize / maximize / close.
├── package.json
└── renderer/
    ├── index.html      Static shell + CSP.
    ├── styles.css      Direct port of the prototype's design tokens, with
    │                   drag states, native window-drag region, and a toast.
    ├── app.js          Boot, navigation, window controls, keyboard shortcuts.
    ├── state.js        Single store with subscribe; persists to localStorage.
    ├── data.js         Seed data — calendars, events, tasks, time blocks.
    ├── util.js         Time math, escaping, html`` template helper, setHTML.
    ├── dragdrop.js     Wraps HTML5 drag-and-drop with a custom MIME type.
    └── screens.js      All seven screen renderers.
```

## Notes

- **Google Calendar is mocked.** The "Connect" button on the first-run screen is a stub
  that flips a flag and brings you into the app. Real OAuth + Calendar API integration
  is the next step; the data model already keeps Google's color IDs out of the UI
  (every calendar stores a user-chosen palette name like `sage` or `lavender`),
  so wiring real calendars in later won't change how colors are managed.

- **Calendar events are read-only.** They appear as soft blocks with a small "Calendar"
  label in the corner, and drag-and-drop is disabled on them. Only your own time
  blocks (the gold `planned` ones) can move.

- **Designed for narrower windows too.** Below 980px the sidebar collapses to a
  horizontal strip and panels stack — useful when running half-screen on a small laptop.

## Why Electron

Tauri would yield a smaller binary; native WinUI3 would feel even more "Windows".
Both have higher setup tax for a project meant to run today from a single `npm install`.
The prototype is HTML and CSS, so Electron lets it port near-verbatim. Once the
interactions and data model settle, swapping the shell for Tauri is a small
rewrite of `main.js`/`preload.js`; the renderer carries over unchanged.
