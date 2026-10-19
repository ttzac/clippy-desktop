const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clippy', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  quit: () => ipcRenderer.send('app:quit'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, status) => cb(status)),
});
