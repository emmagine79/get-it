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

Get It uses your own Google Cloud OAuth client so credentials never live in this repo. One-time setup:

1. **Create a Google Cloud project.**
   Go to <https://console.cloud.google.com/projectcreate>, name it `Get It` (or anything), and create.
2. **Enable the Calendar API.**
   In the project, open <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com> and click **Enable**.
3. **Configure the OAuth consent screen.**
   Open **APIs & Services → OAuth consent screen**.
   - Choose **External**.
   - Fill in the app name (`Get It`), your email as user support contact, and your email as developer contact.
   - On **Scopes**, add `https://www.googleapis.com/auth/calendar.readonly`.
   - On **Test users**, add your own Google email.
4. **Create OAuth credentials.**
   Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Desktop app**
   - Name: `Get It desktop`
   - Click **Create**, then **Download JSON**.
5. **Drop the JSON into the app's data folder.**
   Rename the downloaded file to `credentials.json` and put it at:
   - **macOS:** `~/Library/Application Support/get-it/credentials.json`
   - **Windows:** `%APPDATA%\get-it\credentials.json`
   - **Linux:** `~/.config/get-it/credentials.json`

   (The folder is created the first time you launch the app.)

6. **Click "Connect Google Calendar"** in Get It. Your default browser opens, you grant access, and the redirect lands back in the app. Today's events sync immediately and appear as read-only blocks. Tokens are stored next to `credentials.json` as `google-tokens.json`.

If anything goes wrong, the connect screen shows the exact error. The most common one is a missing `credentials.json` — the message includes the path it expected.

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
