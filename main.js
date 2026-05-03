const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

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
      sandbox: true,
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

app.whenReady().then(() => {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
