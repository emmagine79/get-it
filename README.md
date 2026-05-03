# Get It

A calm, Apple-Reminders-meets-Windows-11 day-planning desktop app for neurodivergent planners.

Get It has two ways to look at your day:

- **Schedule** — a soft visual timeline with read-only Google Calendar events as anchors and your own time blocks layered on top.
- **List** — a flexible checklist with no times, for the days when structure is more friction than help.

Tasks move between the two views with drag-and-drop. The schedule is a sketch, not a contract.

## Run it

You need [Node.js](https://nodejs.org) 18 or later. From this folder:

```bash
npm install
npm start
```

The app launches at 1200×800. The first time you run it, you'll land on the **First run** screen. To bring real meetings in, do the four-minute Google Calendar setup below; or click **Set up without calendar** to start with a clean list.

## Connect Google Calendar

There are two paths, depending on who's using the app.

### For your friend (zero-config)

If you've bundled `credentials.json` next to `main.js` (see the Distribution section below), they don't need to do anything except:

1. Download the app folder, run `npm install` once, then `npm start`.
2. Click **Connect Google Calendar** on the first-run screen.
3. Sign in with their Google account in the browser tab that opens.
4. Done. Today's events appear as read-only blocks.

### For you (one-time Google Cloud setup, ~four minutes)

Do this once. Afterward you can either keep `credentials.json` in your user-data folder for personal use, or copy it next to `main.js` to ship the app to someone else.

1. **Create a Google Cloud project** at <https://console.cloud.google.com/projectcreate>.
2. **Enable the Calendar API** at <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>.
3. **Configure the OAuth consent screen**:
   - **External** user type.
   - Add `https://www.googleapis.com/auth/calendar.readonly` as a scope.
   - In **Test users**, add every Google account that will use the app (yours, your friend's). The Testing-mode cap is 100 users, which is plenty.
4. **Create credentials** → **OAuth client ID** → **Desktop app**. Download the JSON.
5. Save the JSON file as `credentials.json`. Put it in **either**:
   - `<repo>/credentials.json` — bundled with the app, shippable.
   - **macOS:** `~/Library/Application Support/get-it/credentials.json` — personal, never bundled.
   - **Windows:** `%APPDATA%\get-it\credentials.json`
   - **Linux:** `~/.config/get-it/credentials.json`

   The app checks the user-data path first, then falls back to the bundled one. Both paths are `.gitignore`d so credentials never end up in the repo.

6. Click **Connect Google Calendar** in the app. The system browser opens, you grant access, the redirect lands back, and a sync runs immediately.

If anything goes wrong, the connect screen prints the exact error and the paths it tried.

## What's inside

| Screen          | What it does                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------- |
| First run       | Real Google Calendar OAuth (loopback redirect). Skip if you want an empty start.                  |
| Schedule        | Time-blocked day; calendar events are read-only; planned tasks drag-and-drop into time slots.    |
| List            | Untimed checklist with calendar context in the side panel.                                        |
| Both views      | Side-by-side schedule and list, with drag working in both directions.                             |
| Quick add       | Add a task as Task / Time block / Maybe; choose a soft bucket; mode and bucket persist on the card. |
| Evening review  | Mark each open task as Done enough, Roll to tomorrow, or Partial (with completion slider).        |
| Calendars       | Manage layers, toggle visibility, pick colors manually. **Refresh** re-syncs from Google.         |

### Interactions you can try

- **Click any task or planned block** to open the edit modal — change title, note, mode, time, tag, or delete.
- **Click any calendar event** to see its details (read-only — calendars are managed in Google Calendar).
- **Drag a list task into the schedule** to time-block it (snaps to 15 minutes).
- **Drag a planned block back to the Untimed panel** to make it untimed again — works in **Schedule** *and* **Both views**.
- **Click the round check** on any task to mark it done.
- **Open Calendars** → click a calendar row, then pick any swatch — every event with that calendar updates instantly. Colors are stored separately from Google's, so toggling your Google color won't affect Get It.
- **Triple-click "Get It"** in the sidebar to clear everything (handy when testing).
- **Cmd/Ctrl-N** opens Quick Add from anywhere; **Esc** closes modals or cancels Quick Add.

### Persistence

App state (tasks, calendar colors, screen, review decisions) is stored in `localStorage` under `get-it-state-v2`.
Google OAuth tokens are stored separately in the OS user-data folder as `google-tokens.json` and are **not** part of the persisted renderer state — they never enter the renderer.

## Project layout

```
.
├── main.js             Electron main process: window + IPC + Google bridge.
├── preload.js          contextBridge exposing windowAPI + googleAPI.
├── google.js           Google OAuth (loopback redirect) + Calendar sync.
├── package.json
└── renderer/
    ├── index.html      Static shell + CSP.
    ├── styles.css      Design tokens + drag states + modal styling.
    ├── app.js          Boot, navigation, Google handlers, "now" line tick.
    ├── state.js        Single store with subscribe; persists to localStorage.
    ├── data.js         Initial empty state (no placeholders).
    ├── util.js         Time math, escape-by-default html`` template, setHTML.
    ├── dragdrop.js     HTML5 drag-and-drop with custom MIME type.
    ├── modal.js        Tiny modal manager.
    └── screens.js      All seven screen renderers + edit/event modals.
```

## Notes

- **Calendar events stay read-only.** They appear with a "Calendar" label and don't drag. Click for details. To edit them, use Google Calendar.
- **Multiple calendars are first-class.** Whatever calendars Google returns get added; you choose colors in Settings. The first time you connect, every calendar is visible.
- **Designed for narrower windows too.** Below 980px the sidebar collapses to a horizontal strip and panels stack — useful when running half-screen.
- **Tokens stay in the main process.** The renderer only sees connection status and synced data. If the renderer were ever compromised, Google tokens wouldn't leak with it.

## Why Electron

Tauri yields a smaller binary and WinUI3 feels even more "Windows," but both raise the setup tax for an app meant to run today from a single `npm install`. The prototype is HTML and CSS, so Electron lets it port near-verbatim. Once the data model and interactions settle, swapping the shell is a small rewrite of `main.js` / `preload.js`; the renderer and the Google integration carry over.
