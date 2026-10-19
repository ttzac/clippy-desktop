// Builds docs/hero.png and docs/states/*.png from state captures (see README "Dev smoke test").
// Usage: npx electron scripts/make-hero.js <capture-dir>
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SHOTS = [
  ['idle', '01-stop-600.png'],
  ['curious', '02-curious-800.png'],
  ['happy', '03-happy-430.png'],
  ['thinking', '04-thinking-1500.png'],
  ['talking', '05-say_ambient-800.png'],
  ['sleeping', '06-sleeping-5200.png'],
  ['shocked', '07-shocked-300.png'],
];
const dir = process.argv[2];
const root = path.join(__dirname, '..');
// Region that holds the character, as fractions of the capture (tuned on an 854x1023 capture); scaled to the real size below.
const FRAC = { x: 80 / 854, y: 300 / 1023, w: 700 / 854, h: 723 / 1023 };
const TILE_W = 188;

const tiles = SHOTS.map(([name, file]) => {
  const p = path.join(dir, file);
  const img = nativeImage.createFromPath(p);
  const { width, height } = img.getSize();
  return { name, url: pathToFileURL(p).href, width, height, alpha: img.toBitmap()[3] };
});
const W0 = tiles[0].width;
const H0 = tiles[0].height;
const CROP = { x: Math.round(FRAC.x * W0), y: Math.round(FRAC.y * H0), w: Math.round(FRAC.w * W0), h: Math.round(FRAC.h * H0) };
const k = TILE_W / CROP.w;
const TILE_H = Math.round(CROP.h * k);
console.log('capture size', tiles[0].width, 'x', tiles[0].height, '| corner alpha', tiles.map((t) => t.alpha).join(','));

const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1600px;height:640px;overflow:hidden;font-family:Tahoma,"Segoe UI",sans-serif;color:#000;
 background:
  radial-gradient(circle at 18% 20%,#12b5b0 0,transparent 45%),
  radial-gradient(circle at 85% 80%,#0b7a8a 0,transparent 50%),
  repeating-conic-gradient(#0a8f8f 0 25%,#0c9a98 0 50%) 0 0/8px 8px;position:relative}
.win{position:absolute;left:70px;top:40px;width:1460px;height:520px;background:#c0c0c0;
 border:2px solid;border-color:#fff #404040 #404040 #fff;box-shadow:6px 6px 0 rgba(0,0,0,.35)}
.title{height:34px;background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:bold;font-size:18px;
 display:flex;align-items:center;justify-content:space-between;padding:0 8px}
.title i{display:flex;gap:4px}.title b{width:24px;height:22px;background:#c0c0c0;color:#000;font-size:14px;text-align:center;line-height:20px;
 border:2px solid;border-color:#fff #404040 #404040 #fff}
.body{padding:26px 34px}
h1{font-size:84px;letter-spacing:-2px;line-height:1;color:#000080;text-shadow:3px 3px 0 #fff,6px 6px 0 rgba(0,0,0,.25)}
h1 span{color:#d4145a}
p.tag{margin-top:12px;font-size:25px;line-height:1.3;max-width:1100px}
.well{margin-top:20px;background:#fff;border:2px solid;border-color:#808080 #fff #fff #808080;padding:14px 8px 8px;display:flex;gap:6px;justify-content:space-between}
.tile{text-align:center;width:${TILE_W}px}
.crop{width:${TILE_W}px;height:${TILE_H}px;overflow:hidden;position:relative}
.crop img{position:absolute;width:${Math.round(tiles[0].width * k)}px;left:${-CROP.x * k}px;top:${-CROP.y * k}px}
.tile span{display:block;margin-top:-2px;font-weight:bold;font-size:19px;letter-spacing:.5px;text-transform:uppercase;color:#000080}
.bar{position:absolute;left:0;right:0;bottom:0;height:56px;background:#c0c0c0;border-top:3px solid #fff;display:flex;align-items:center;padding:0 10px;gap:14px;font-size:20px}
.start{font-weight:bold;padding:5px 16px;border:2px solid;border-color:#fff #404040 #404040 #fff}
.task{padding:5px 16px;border:2px solid;border-color:#404040 #fff #fff #404040;background:#d8d8d8;min-width:340px}
.clock{margin-left:auto;padding:5px 14px;border:2px solid;border-color:#808080 #fff #fff #808080}
</style>
<div class="win"><div class="title"><span>Clippy Desktop.exe</span><i><b>_</b><b>□</b><b>x</b></i></div>
<div class="body"><h1>CLIPPY <span>DESKTOP</span></h1>
<p class="tag">A silver paperclip with opinions, living on your desktop. 7 hand-rigged moods (and counting), 118 original quips, zero sprites. Helpful first, funny second.</p>
<div class="well">${tiles.map((t) => `<div class="tile"><div class="crop"><img src="${t.url}"></div><span>${t.name}</span></div>`).join('')}</div></div></div>
<div class="bar"><div class="start">Start</div><div class="task">Clippy Desktop.exe</div><div class="clock">9:41 AM</div></div>`;

app.whenReady().then(async () => {
  const tmp = path.join(require('os').tmpdir(), 'clippy-hero.html');
  fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ width: 1600, height: 640, useContentSize: true, show: true, frame: false, webPreferences: { zoomFactor: 1, backgroundThrottling: false } });
  await win.loadFile(tmp);
  win.webContents.setZoomFactor(1);
  await new Promise((r) => setTimeout(r, 1200));
  const full = await win.webContents.capturePage();
  const size = full.getSize();
  const sf = size.width / 1600;
  fs.writeFileSync(path.join(root, 'docs', 'hero.png'), full.toPNG());
  console.log('hero', size);

  // individual state images straight from the captures (cropped, native resolution)
  for (const t of tiles) {
    const img = nativeImage.createFromPath(path.join(dir, SHOTS.find((s) => s[0] === t.name)[1]));
    const cropped = img.crop({ x: CROP.x, y: CROP.y, width: Math.min(CROP.w, t.width - CROP.x), height: Math.min(CROP.h, t.height - CROP.y) });
    fs.writeFileSync(path.join(root, 'docs', 'states', `${t.name}.png`), cropped.toPNG());
  }
  void sf;
  if (process.argv[3]) {
    const b = nativeImage.createFromPath(path.join(process.argv[3], fs.readdirSync(process.argv[3]).find((f) => f.endsWith('.png'))));
    const { width, height } = b.getSize();
    fs.writeFileSync(path.join(root, 'docs', 'bubble.png'), b.crop({ x: 0, y: Math.round(height * 0.22), width, height: height - Math.round(height * 0.22) }).toPNG());
  }
  app.exit(0);
});
