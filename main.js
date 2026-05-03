const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const google = require('./google.js');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#f5efe6',
    title: 'Get It',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const sendState = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('window:state', {
      maximized: mainWindow.isMaximized(),
    });
  };
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Window controls.
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  // Google Calendar.
  await google.init({
    userDataPath: app.getPath('userData'),
    appPath: __dirname,
  });

  ipcMain.handle('google:status', () => google.getStatus());

  ipcMain.handle('google:connect', async () => {
    try {
      const result = await google.connect({
        openExternal: (url) => shell.openExternal(url),
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('google:sync', async () => {
    try {
      return { ok: true, ...(await google.sync()) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('google:disconnect', async () => {
    await google.disconnect();
    return { ok: true };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
