import 'pixi.js/unsafe-eval'; // keeps the strict CSP (no 'unsafe-eval') intact
import { Application } from 'pixi.js';
import { Controller } from './animation/Controller';
import { ClippyRig } from './character/ClippyRig';
import { Bubble } from './ui/bubble';
import type { UpdateStatus } from './env';

const bridge = window.clippy; // undefined when opened in a plain browser (dev preview)
const HIT_PAD = 8;

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  const rig = new ClippyRig();
  app.stage.addChild(rig);
  const placeRig = () => rig.setHome(app.screen.width / 2, app.screen.height - 28);
  placeRig();
  app.renderer.on('resize', placeRig);

  const ctrl = new Controller();
  const bubble = new Bubble(() => bridge?.installUpdate());

  // ---- animation loop: 60 fps while anything is moving, 30 when settled ----
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    rig.render(ctrl.update(dt));
    app.ticker.maxFPS = ctrl.active ? 60 : 30;
  });

  // ---- gaze: global cursor from main process (works over other apps) ----
  const feedCursor = (x: number, y: number) => {
    const eye = rig.eyeCentre();
    ctrl.setCursorOffset(x - eye.x, y - eye.y);
  };
  bridge?.onCursor((p) => feedCursor(p.x, p.y));

  // ---- click-through: only the character and bubble catch the mouse ----
  let ignoring = true;
  const setIgnore = (v: boolean) => {
    if (v === ignoring) return;
    ignoring = v;
    bridge?.setIgnoreMouse(v);
  };
  const overCharacter = (x: number, y: number) => {
    const b = rig.getBounds();
    return x >= b.minX - HIT_PAD && x <= b.maxX + HIT_PAD && y >= b.minY - HIT_PAD && y <= b.maxY + HIT_PAD;
  };
  const overSolid = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    return overCharacter(x, y) || !!el?.closest('#bubble:not([hidden])');
  };

  // ---- drag ----
  let drag: { sx: number; sy: number; lastX: number; lastT: number; vx: number } | null = null;

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !overCharacter(e.clientX, e.clientY)) return;
    drag = { sx: e.screenX, sy: e.screenY, lastX: e.screenX, lastT: performance.now(), vx: 0 };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    bridge?.dragStart();
    ctrl.beginDrag();
  });

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      const now = performance.now();
      const dt = Math.max(1, now - drag.lastT) / 1000;
      drag.vx += ((e.screenX - drag.lastX) / dt - drag.vx) * 0.25; // low-pass the velocity
      drag.lastX = e.screenX;
      drag.lastT = now;
      ctrl.dragVelocity(drag.vx);
      bridge?.dragMove(e.screenX - drag.sx, e.screenY - drag.sy);
      return;
    }
    const solid = overSolid(e.clientX, e.clientY);
    setIgnore(!solid);
    ctrl.setHovered(overCharacter(e.clientX, e.clientY));
    if (!bridge) feedCursor(e.clientX, e.clientY); // browser preview has no global cursor
  });

  const release = () => {
    if (!drag) return;
    drag = null;
    bridge?.dragEnd();
    ctrl.endDrag();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---- updater ----
  bridge?.getVersion().then((v) => console.log(`Clippy Desktop v${v}`));
  bridge?.onUpdateStatus((s: UpdateStatus) => {
    switch (s.state) {
      case 'checking': if (s.manual) bubble.say('Looking for updates...'); break;
      case 'available': bubble.say(`Update v${s.version} found. Downloading in the background.`); break;
      case 'downloading': if (s.manual) bubble.say(`Downloading update: ${s.percent}%`, { ms: 1500 }); break;
      case 'ready': bubble.say(`v${s.version} is ready. Restart to install.`, { sticky: true, restart: true }); break;
      case 'none': if (s.manual) bubble.say("You're up to date. Disappointing, I know."); break;
      case 'dev': bubble.say(s.message ?? 'Updates are disabled in dev mode.'); break;
      case 'error': if (s.manual) bubble.say(`Update error: ${s.message}`, { ms: 8000 }); break;
    }
  });

  bubble.say("It looks like you're building a desktop assistant. I'll supervise.", { ms: 4500 });
}

boot().catch((err) => console.error('Clippy failed to start', err));
