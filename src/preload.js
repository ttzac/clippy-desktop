const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clippy', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  quit: () => ipcRenderer.send('app:quit'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', ignore),
  dragStart: () => ipcRenderer.send('drag:start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag:move', { dx, dy }),
  dragEnd: () => ipcRenderer.send('drag:end'),
  onCursor: (cb) => ipcRenderer.on('cursor:pos', (_e, pos) => cb(pos)),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  onClosing: (cb) => ipcRenderer.on('app:closing', () => cb()),
  onSay: (cb) => ipcRenderer.on('personality:say', (_e, req) => cb(req)),
  quitNow: () => ipcRenderer.send('app:quit-now'),
  onPlay: (cb) => ipcRenderer.on('debug:play', (_e, req) => cb(req)),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, status) => cb(status)),
});
