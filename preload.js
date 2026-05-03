const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  onWindowState: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
});

contextBridge.exposeInMainWorld('googleAPI', {
  status:     () => ipcRenderer.invoke('google:status'),
  connect:    () => ipcRenderer.invoke('google:connect'),
  sync:       () => ipcRenderer.invoke('google:sync'),
  disconnect: () => ipcRenderer.invoke('google:disconnect'),
});
