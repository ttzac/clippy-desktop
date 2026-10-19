const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const WIN_W = 340;
const WIN_H = 380;
const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

let win = null;
let tray = null;

// The repo is private, so electron-updater needs a read-only token at runtime.
// Provide it via the GH_TOKEN env var or {userData}/config.json: { "updateToken": "..." }
function loadUpdateToken() {
  if (process.env.GH_TOKEN) return;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
    if (cfg.updateToken) process.env.GH_TOKEN = cfg.updateToken;
  } catch { /* no config yet */ }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: workArea.x + workArea.width - WIN_W - 24,
    y: workArea.y + workArea.height - WIN_H - 8,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip(`Clippy Desktop v${app.getVersion()}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Clippy Desktop v${app.getVersion()}`, enabled: false },
    { label: 'Show / hide', click: () => (win.isVisible() ? win.hide() : win.show()) },
    { label: 'Check for updates', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
}

function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) send('update:status', { state: 'dev', message: 'Updates are disabled in dev mode.' });
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    send('update:status', { state: 'error', message: String(err.message || err) });
  });
}

function setupAutoUpdate() {
  loadUpdateToken();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send('update:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => send('update:status', { state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => send('update:status', { state: 'none' }));
  autoUpdater.on('download-progress', (p) => send('update:status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('update:status', { state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => send('update:status', { state: 'error', message: String(err.message || err) }));

  ipcMain.on('update:check', () => checkForUpdates(true));
  ipcMain.on('update:install', () => autoUpdater.quitAndInstall());

  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_INTERVAL_MS);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) win.show(); });
  app.whenReady().then(() => {
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.on('app:quit', () => app.quit());
    createWindow();
    createTray();
    setupAutoUpdate();
  });
  app.on('window-all-closed', () => app.quit());
}
