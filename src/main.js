const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// The window is laid out at BASE size and uniformly scaled with the page zoom factor.
const BASE_W = 340;
const BASE_H = 420;
const SIZES = [['small', 'Small', 0.6], ['medium', 'Medium', 0.75], ['large', 'Large', 1]];
let scale = 0.75;
const winW = () => Math.round(BASE_W * scale);
const winH = () => Math.round(BASE_H * scale);
const scaleFor = (id) => (SIZES.find(([k]) => k === id) || SIZES[1])[2];
const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const CURSOR_POLL_MS = 50;

let win = null;
let tray = null;
let manualCheck = false;
let dragOrigin = null;

// ---------- settings (position, chattiness) ----------
const DEFAULTS = { chattiness: 'normal', size: 'medium' };
const CHATTINESS = [['quiet', 'Quiet (no chatter)'], ['low', 'Low'], ['normal', 'Normal'], ['high', 'Chatty']];
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}

let saveTimer = null;
let pendingSettings = {};
function saveSettings(patch) {
  pendingSettings = { ...pendingSettings, ...patch }; // accumulate, so two quick changes can't drop one
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 250);
}

function flushSettings() {
  clearTimeout(saveTimer);
  if (!Object.keys(pendingSettings).length) return;
  try { fs.writeFileSync(settingsPath(), JSON.stringify({ ...loadSettings(), ...pendingSettings })); } catch { /* ignore */ }
  pendingSettings = {};
}

// Restore the saved spot only if it is still on a connected display.
function initialPosition() {
  const saved = loadSettings();
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const cx = saved.x + winW() / 2;
    const cy = saved.y + winH() / 2;
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height);
    if (onScreen) return { x: saved.x, y: saved.y };
  }
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - winW() - 24, y: workArea.y + workArea.height - winH() - 8 };
}

// ---------- updater token (private repo) ----------
// Provide it via GH_TOKEN or {userData}/config.json: { "updateToken": "..." }
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

// ---------- window ----------
function createWindow() {
  const { x, y } = initialPosition();
  win = new BrowserWindow({
    width: winW(),
    height: winH(),
    x,
    y,
    show: false,
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
      zoomFactor: scale,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Start click-through; the renderer turns capture on while the pointer is over Clippy.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'), app.isPackaged ? undefined : { query: { debug: '1' } });
  win.once('ready-to-show', () => win.showInactive());

  // Dev/CI smoke test. CLIPPY_SMOKE=<png path> captures the idle window, then exits.
  // CLIPPY_SMOKE_STATES="happy@400,shocked@250" (with CLIPPY_SMOKE_DIR) plays each state and captures it after N ms.
  if (process.env.CLIPPY_SMOKE_STATES && !app.isPackaged) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    win.webContents.once('did-finish-load', async () => {
      await sleep(2500);
      const dir = process.env.CLIPPY_SMOKE_DIR || '.';
      let i = 0;
      for (const spec of process.env.CLIPPY_SMOKE_STATES.split(',')) {
        const [id, at] = spec.split('@');
        send('debug:play', { id: 'stop' });
        await sleep(1500);
        if (id.startsWith('say:')) await win.webContents.executeJavaScript(`window.__clippy.chat(${JSON.stringify(id.slice(4))}, true)`);
        else send('debug:play', { id, duration: 8 });
        const steps = Math.max(1, Math.floor((Number(at) || 500) / 500));
        for (let k = 0; k < steps; k++) {
          await sleep((Number(at) || 500) / steps);
          if (process.env.CLIPPY_SMOKE_TRACE) console.log('[trace]', id, k, await win.webContents.executeJavaScript('window.__clippy && window.__clippy.machine.current'));
        }
        const img = await win.webContents.capturePage();
        const file = path.join(dir, `${String(++i).padStart(2, '0')}-${id.replace(/\W/g, '_')}-${at}.png`);
        fs.writeFileSync(file, img.toPNG());
        console.log('[smoke] captured', file);
      }
      if (process.env.CLIPPY_SMOKE_QUIT) {
        const t0 = Date.now();
        app.on('will-quit', () => console.log('[smoke] quit after', Date.now() - t0, 'ms'));
        requestQuit();
        await sleep(700);
        fs.writeFileSync(path.join(dir, 'quit.png'), (await win.webContents.capturePage()).toPNG());
        return;
      }
      app.exit(0);
    });
  } else if (process.env.CLIPPY_SMOKE && !app.isPackaged) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.CLIPPY_SMOKE, img.toPNG());
      console.log('[smoke] captured', img.getSize());
      app.exit(0);
    }, 3500));
  }

  if (!app.isPackaged) {
    win.webContents.on('console-message', (...args) => {
      const e = args[0];
      console.log('[renderer]', e && e.message !== undefined ? e.message : args[2]);
    });
    win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d.reason));
  }
}

function startCursorFeed() {
  let last = '';
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const rel = { x: (p.x - b.x) / scale, y: (p.y - b.y) / scale }; // CSS px at the page's zoom
    const key = `${rel.x},${rel.y}`;
    if (key === last) return;
    last = key;
    send('cursor:pos', rel);
  }, CURSOR_POLL_MS);
}

function registerWindowIpc() {
  ipcMain.on('mouse:ignore', (_e, ignore) => {
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, ignore ? { forward: true } : undefined);
  });
  ipcMain.on('drag:start', () => { dragOrigin = { pos: win.getPosition(), cursor: screen.getCursorScreenPoint() }; });
  ipcMain.on('drag:move', () => {
    if (!dragOrigin) return;
    const c = screen.getCursorScreenPoint();
    const dx = c.x - dragOrigin.cursor.x;
    const dy = c.y - dragOrigin.cursor.y;
    // setBounds with a fixed size avoids the DPI size-drift setPosition causes on scaled displays.
    win.setBounds({ x: Math.round(dragOrigin.pos[0] + dx), y: Math.round(dragOrigin.pos[1] + dy), width: winW(), height: winH() });
  });
  ipcMain.on('drag:end', () => {
    dragOrigin = null;
    const [x, y] = win.getPosition();
    saveSettings({ x, y });
  });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('settings:get', () => ({ ...loadSettings(), ...pendingSettings }));
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('app:quit-now', () => app.quit());
}

// ---------- tray ----------
// Tiny generated silver-clip-ish icon so the tray entry is visible without shipping a binary asset.
function trayIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b, a = 255) => { const i = (y * size + x) * 4; buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d < 14) put(x, y, 36, 40, 47);
      if (d < 12) put(x, y, 196, 203, 211);
    }
  }
  for (const [ex, ey] of [[11, 13], [20, 13]]) {
    for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) put(ex + x, ey + y, 255, 255, 255);
    put(ex, ey + 1, 20, 22, 27); put(ex, ey + 2, 20, 22, 27);
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// Quit with a goodbye line: ask the renderer, which replies with app:quit-now when it has finished talking.
let closing = false;
function requestQuit() {
  if (closing || !win || win.isDestroyed()) return app.quit();
  closing = true;
  send('app:closing');
  setTimeout(() => app.quit(), 3000); // fallback if the renderer never answers
}

// Resize about the bottom-centre so Clippy stays put on screen.
function setSize(id) {
  saveSettings({ size: id });
  const next = scaleFor(id);
  if (win && !win.isDestroyed() && next !== scale) {
    const b = win.getBounds();
    scale = next;
    win.webContents.setZoomFactor(scale);
    win.setBounds({ x: Math.round(b.x + (b.width - winW()) / 2), y: b.y + b.height - winH(), width: winW(), height: winH() });
    saveSettings({ x: win.getPosition()[0], y: win.getPosition()[1] });
  }
  buildTrayMenu();
}

function setChattiness(level) {
  saveSettings({ chattiness: level });
  send('settings:changed', { chattiness: level });
  buildTrayMenu();
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip(`Clippy Desktop v${app.getVersion()}`);
  tray.on('click', () => (win.isVisible() ? win.hide() : win.showInactive()));
  buildTrayMenu();
}

function buildTrayMenu() {
  const settings = { ...loadSettings(), ...pendingSettings };
  const current = settings.chattiness;
  const currentSize = settings.size;
  const toggle = () => (win.isVisible() ? win.hide() : win.showInactive());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Clippy Desktop v${app.getVersion()}`, enabled: false },
    { label: 'Show / hide', click: toggle },
    { label: 'Say something', click: () => { win.showInactive(); send('personality:say', { category: 'ambient+wisdom' }); } },
    {
      label: 'Size',
      submenu: SIZES.map(([id, label]) => ({ label, type: 'radio', checked: currentSize === id, click: () => setSize(id) })),
    },
    {
      label: 'Chattiness',
      submenu: CHATTINESS.map(([id, label]) => ({ label, type: 'radio', checked: current === id, click: () => setChattiness(id) })),
    },
    { label: 'Check for updates', click: () => { win.showInactive(); checkForUpdates(true); } },
    {
      label: 'Play animation',
      submenu: [
        ...['curious', 'happy', 'thinking', 'talking', 'sleeping', 'shocked'].map((id) => ({
          label: id[0].toUpperCase() + id.slice(1),
          click: () => { win.showInactive(); send('debug:play', { id, duration: id === 'talking' ? 4 : undefined }); },
        })),
        { type: 'separator' },
        { label: 'Stop', click: () => send('debug:play', { id: 'stop' }) },
      ],
    },
    { type: 'separator' },
    { label: 'Quit', click: requestQuit },
  ]));
}

// ---------- auto-update ----------
function sendUpdate(status) {
  send('update:status', { ...status, manual: manualCheck });
}

function checkForUpdates(manual = false) {
  manualCheck = manual;
  if (!app.isPackaged) {
    if (manual) sendUpdate({ state: 'dev', message: 'Updates are disabled in dev mode.' });
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => sendUpdate({ state: 'error', message: String(err.message || err) }));
}

function setupAutoUpdate() {
  loadUpdateToken();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdate({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => sendUpdate({ state: 'error', message: String(err.message || err) }));

  ipcMain.on('update:check', () => checkForUpdates(true));
  ipcMain.on('update:install', () => autoUpdater.quitAndInstall());

  checkForUpdates();
  setInterval(() => checkForUpdates(), UPDATE_INTERVAL_MS);
}

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) win.showInactive(); });
  app.whenReady().then(() => {
    scale = scaleFor(loadSettings().size);
    registerWindowIpc();
    createWindow();
    createTray();
    startCursorFeed();
    setupAutoUpdate();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', flushSettings);
}
