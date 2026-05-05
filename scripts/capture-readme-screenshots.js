const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'docs', 'readme');
const userData = path.join(os.tmpdir(), 'get-it-readme-capture');

const demoState = {
  schemaVersion: 5,
  currentScreen: 'schedule',
  hasCompletedFirstRun: true,
  theme: 'light',
  calendars: [
    { id: 'work', name: 'Work', color: 'sage', visible: true },
    { id: 'personal', name: 'Personal', color: 'lavender', visible: true },
  ],
  events: [
    {
      id: 'evt-standup',
      calendarId: 'work',
      title: 'Design sync',
      start: '09:30',
      end: '10:00',
      location: 'Meet',
    },
    {
      id: 'evt-walk',
      calendarId: 'personal',
      title: 'Slow walk',
      start: '12:30',
      end: '13:00',
      location: 'Outside',
    },
  ],
  tasks: [
    {
      id: 'tsk-edit',
      title: 'Edit launch notes',
      note: 'Keep it soft and specific.',
      tags: ['focus'],
      mode: 'block',
      start: '10:30',
      end: '11:30',
      done: false,
    },
    {
      id: 'tsk-message',
      title: 'Send update to Zaf',
      note: 'Mention the calmer schedule flow.',
      tags: ['errand'],
      mode: 'task',
      done: false,
    },
    {
      id: 'tsk-maybe',
      title: 'Sketch weekend reset',
      note: '',
      tags: ['maybe'],
      mode: 'maybe',
      done: false,
    },
  ],
  reviewDecisions: {
    'tsk-edit': {
      decision: 'partial',
      percent: 70,
      undoTask: {
        id: 'tsk-edit',
        title: 'Edit launch notes',
        note: 'Keep it soft and specific.',
        tags: ['focus'],
        mode: 'block',
        start: '10:30',
        end: '11:30',
        done: false,
      },
    },
  },
  taskHistory: [],
  googleConnected: true,
  googleAccount: 'friend@example.com',
  googleSyncing: false,
  googleError: null,
  lastSyncedAt: Date.now(),
};

const shots = [
  { screen: 'schedule', theme: 'light', file: 'schedule.png' },
  { screen: 'bridge', theme: 'light', file: 'both-views.png' },
  { screen: 'review', theme: 'dark', file: 'review-dark.png' },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadScreen(win, screen, theme) {
  const state = { ...demoState, currentScreen: screen, theme };
  await win.webContents.executeJavaScript(
    `localStorage.setItem('get-it-state-v2', ${JSON.stringify(JSON.stringify(state))});`,
  );
  win.reload();
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  await wait(800);
}

async function main() {
  app.setPath('userData', userData);
  await app.whenReady();
  ipcMain.handle('google:status', () => ({
    connected: true,
    account: 'friend@example.com',
    calendars: demoState.calendars.length,
    events: demoState.events.length,
  }));
  ipcMain.handle('google:sync', () => ({
    ok: true,
    calendars: demoState.calendars,
    events: demoState.events,
  }));
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    backgroundColor: '#f5efe6',
    webPreferences: {
      preload: path.join(root, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadFile(path.join(root, 'renderer', 'index.html'));
  for (const shot of shots) {
    await loadScreen(win, shot.screen, shot.theme);
    const image = await win.capturePage();
    await fs.writeFile(path.join(outputDir, shot.file), image.toPNG());
  }

  win.destroy();
  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
