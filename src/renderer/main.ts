import 'pixi.js/unsafe-eval'; // keeps the strict CSP (no 'unsafe-eval') intact
import { Application } from 'pixi.js';
import { Controller } from './animation/Controller';
import { StateMachine, type Env } from './animation/StateMachine';
import { ALL_STATES } from './animation/states';
import { ClippyRig } from './character/ClippyRig';
import { PixiFx } from './effects/PixiFx';
import { Bubble } from './ui/bubble';
import type { UpdateStatus } from './env';

const bridge = window.clippy; // undefined when opened in a plain browser (dev preview)
const HIT_PAD = 8;
const DRAG_THRESHOLD_PX = 5;
const CLICK_MAX_MS = 450;
const SPAM_CLICKS = 3; // this many clicks inside SPAM_WINDOW_MS startles Clippy
const SPAM_WINDOW_MS = 1000;
const SLEEP_AFTER_S = 120; // no cursor movement for this long -> nod off
const talkSeconds = (text: string) => Math.min(6, 0.7 + text.length * 0.045);

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
  const fx = new PixiFx(app, () => rig.anchor('head'));
  app.stage.addChild(rig, fx.layer);
  const placeRig = () => rig.setHome(app.screen.width / 2, app.screen.height - 28);
  placeRig();
  app.renderer.on('resize', placeRig);

  const ctrl = new Controller();
  const env: Env = { cursor: () => ctrl.cursorOffset(), anchor: (n) => rig.anchor(n), fx };
  const machine = new StateMachine(ALL_STATES, env);
  const bubble = new Bubble(() => bridge?.installUpdate());

  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __clippy: { machine, ctrl, fx } });

  let manualSleep = false; // sleeping chosen from the tray menu stays until clicked or stopped
  let lastActivity = performance.now() / 1000;
  const touch = () => { lastActivity = performance.now() / 1000; };

  /** Say something: show the bubble and animate the mouth for as long as it takes to "read" it. */
  const speak = (message: string, opts?: Parameters<Bubble['say']>[1]) => {
    bubble.say(message, opts);
    machine.request('talking', { duration: talkSeconds(message) });
  };

  // ---- animation loop: 60 fps while anything needs it, 30 when settled ----
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    const base = ctrl.update(dt);
    machine.update(dt);
    fx.update(dt);
    rig.render(machine.apply(base));

    const idleFor = performance.now() / 1000 - lastActivity;
    if (idleFor > SLEEP_AFTER_S && machine.current === null) machine.request('sleeping');

    app.ticker.maxFPS = ctrl.active || machine.needsFullRate || (fx.count > 0 && machine.current !== 'sleeping') ? 60 : 30;
  });

  // ---- gaze: global cursor from main process (works over other apps) ----
  const feedCursor = (x: number, y: number) => {
    const eye = rig.eyeCentre();
    ctrl.setCursorOffset(x - eye.x, y - eye.y);
  };
  bridge?.onCursor((p) => {
    feedCursor(p.x, p.y);
    touch();
    if (machine.current === 'sleeping' && !manualSleep) machine.stop('sleeping'); // user is back: wake gently
  });

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

  // ---- pointer: press -> (drag past threshold | click on release) ----
  type Press = { sx: number; sy: number; at: number; dragging: boolean; lastX: number; lastT: number; vx: number };
  let press: Press | null = null;
  let hovered = false;
  const clicks: number[] = [];

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !overCharacter(e.clientX, e.clientY)) return;
    touch();
    press = { sx: e.screenX, sy: e.screenY, at: performance.now(), dragging: false, lastX: e.screenX, lastT: performance.now(), vx: 0 };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  });

  window.addEventListener('pointermove', (e) => {
    touch();
    if (press) {
      const dx = e.screenX - press.sx;
      const dy = e.screenY - press.sy;
      if (!press.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        press.dragging = true;
        bridge?.dragStart();
        ctrl.beginDrag();
        machine.request('dragging', { force: true });
      }
      if (press.dragging) {
        const now = performance.now();
        const dtv = Math.max(1, now - press.lastT) / 1000;
        press.vx += ((e.screenX - press.lastX) / dtv - press.vx) * 0.25; // low-pass the velocity
        press.lastX = e.screenX;
        press.lastT = now;
        ctrl.dragVelocity(press.vx);
        bridge?.dragMove(dx, dy);
      }
      return;
    }
    setIgnore(!overSolid(e.clientX, e.clientY));
    const over = overCharacter(e.clientX, e.clientY);
    if (over !== hovered) {
      hovered = over;
      ctrl.setHovered(over);
      if (over) machine.request('curious', { duration: 6 });
      else machine.stop('curious');
    }
    if (!bridge) feedCursor(e.clientX, e.clientY); // browser preview has no global cursor
  });

  const release = () => {
    if (!press) return;
    const p = press;
    press = null;
    if (p.dragging) {
      bridge?.dragEnd();
      ctrl.endDrag();
      machine.stop('dragging');
    } else if (performance.now() - p.at < CLICK_MAX_MS) {
      const now = performance.now();
      clicks.push(now);
      while (clicks.length && now - clicks[0] > SPAM_WINDOW_MS) clicks.shift();
      if (clicks.length >= SPAM_CLICKS) {
        clicks.length = 0;
        machine.request('shocked');
      } else machine.request('happy');
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---- tray debug menu: play any state ----
  bridge?.onPlay(({ id, duration }) => {
    touch();
    manualSleep = id === 'sleeping';
    if (id === 'stop') machine.stop();
    else machine.request(id, { duration, force: true });
  });

  // ---- updater ----
  bridge?.getVersion().then((v) => console.log(`Clippy Desktop v${v}`));
  bridge?.onUpdateStatus((s: UpdateStatus) => {
    switch (s.state) {
      case 'checking': if (s.manual) bubble.say('Looking for updates...'); break;
      case 'available': speak(`Update v${s.version} found. Downloading in the background.`); break;
      case 'downloading': if (s.manual) bubble.say(`Downloading update: ${s.percent}%`, { ms: 1500 }); break;
      case 'ready': speak(`v${s.version} is ready. Restart to install.`, { sticky: true, restart: true }); break;
      case 'none': if (s.manual) speak("You're up to date. Disappointing, I know."); break;
      case 'dev': bubble.say(s.message ?? 'Updates are disabled in dev mode.'); break;
      case 'error': if (s.manual) bubble.say(`Update error: ${s.message}`, { ms: 8000 }); break;
    }
  });

  speak("It looks like you're building a desktop assistant. I'll supervise.", { ms: 4500 });
}

boot().catch((err) => console.error('Clippy failed to start', err));
