import 'pixi.js/unsafe-eval'; // keeps the strict CSP (no 'unsafe-eval') intact
import { Application } from 'pixi.js';
import { Controller } from './animation/Controller';
import { StateMachine, type Env } from './animation/StateMachine';
import { ALL_STATES } from './animation/states';
import { ClippyRig } from './character/ClippyRig';
import { PixiFx } from './effects/PixiFx';
import { CATEGORIES, LINES } from './personality/lines';
import { Personality } from './personality/Personality';
import { Bubble } from './ui/bubble';
import type { UpdateStatus } from './env';

const bridge = window.clippy; // undefined when opened in a plain browser (dev preview)
const HIT_PAD = 8;
const DRAG_THRESHOLD_PX = 5;
const CLICK_MAX_MS = 450;
const SPAM_CLICKS = 3; // this many clicks inside SPAM_WINDOW_MS startles Clippy
const SPAM_WINDOW_MS = 1000;
const SLEEP_AFTER_S = 120; // no cursor movement for this long -> nod off
const IDLE_QUIP_S = 45; // ...and this long -> a remark, before dozing off
const SESSION_QUIP_S = 90 * 60; // active this long -> a gentle break reminder
const AMBIENT_EVERY_S: [number, number] = [180, 420];
const GOODBYE_MS = 2000;
const readMs = (text: string) => Math.min(9000, 3200 + text.length * 55);
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
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
  // Page zoom (tray > Size) changes devicePixelRatio; keep the canvas crisp.
  window.addEventListener('resize', () => {
    if (app.renderer.resolution !== window.devicePixelRatio) app.renderer.resolution = window.devicePixelRatio;
  });

  const ctrl = new Controller();
  const env: Env = { cursor: () => ctrl.cursorOffset(), anchor: (n) => rig.anchor(n), fx };
  const machine = new StateMachine(ALL_STATES, env);
  const bubble = new Bubble(() => bridge?.installUpdate());
  const personality = new Personality(LINES, CATEGORIES);
  bridge?.getSettings().then((s) => personality.setLevel(s.chattiness));
  bridge?.onSettings((s) => personality.setLevel(s.chattiness));

  let idleQuipped = false;
  let nextAmbientAt = performance.now() / 1000 + between(...AMBIENT_EVERY_S);
  let nextSessionAt = performance.now() / 1000 + SESSION_QUIP_S;
  let manualSleep = false; // sleeping chosen from the tray menu stays until clicked or stopped
  let lastActivity = performance.now() / 1000;
  const touch = () => {
    lastActivity = performance.now() / 1000;
    idleQuipped = false;
  };

  /** Ask the personality engine for a line in this category and speak it, if it decides to. */
  const chat = (category: string, force = false): string | null => {
    const line = personality.say(category, { hour: new Date().getHours(), force });
    if (line) speak(line, { ms: readMs(line) });
    return line;
  };

  /** Say something: show the bubble and animate the mouth for as long as it takes to "read" it. */
  const speak = (message: string, opts?: Parameters<Bubble['say']>[1]) => {
    bubble.say(message, opts);
    machine.request('talking', { duration: talkSeconds(message) });
  };

  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __clippy: { machine, ctrl, fx, personality, chat } });

  // ---- animation loop: 60 fps while anything needs it, 30 when settled ----
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    const base = ctrl.update(dt);
    machine.update(dt);
    fx.update(dt);
    rig.render(machine.apply(base));

    const nowS = performance.now() / 1000;
    const idleFor = nowS - lastActivity;
    if (idleFor > SLEEP_AFTER_S && machine.current === null) {
      if (machine.request('sleeping')) chat('sleepStart');
    } else if (idleFor > IDLE_QUIP_S && !idleQuipped && machine.current === null) {
      idleQuipped = true;
      chat('idle');
    }
    // Spontaneous remarks only while the user is around and nothing else is going on.
    if (idleFor < 30 && machine.current === null && !bubble.visible) {
      if (nowS > nextAmbientAt) {
        nextAmbientAt = nowS + between(...AMBIENT_EVERY_S);
        chat('ambient');
      }
      if (nowS > nextSessionAt) {
        nextSessionAt = nowS + SESSION_QUIP_S;
        chat('session');
      }
    }

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
    if (machine.current === 'sleeping' && !manualSleep) {
      machine.stop('sleeping'); // user is back: wake gently
      chat('wake');
    }
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
    personality.noteInteraction();
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
        chat('dragStart');
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
      if (over) {
        machine.request('curious', { duration: 6 });
        personality.noteInteraction();
        chat('hover');
      } else machine.stop('curious');
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
      chat('drop');
    } else if (performance.now() - p.at < CLICK_MAX_MS) {
      const now = performance.now();
      clicks.push(now);
      while (clicks.length && now - clicks[0] > SPAM_WINDOW_MS) clicks.shift();
      const wasSleeping = machine.current === 'sleeping';
      if (clicks.length >= SPAM_CLICKS) {
        clicks.length = 0;
        machine.request('shocked');
        chat('clickSpam');
      } else {
        machine.request('happy');
        chat(wasSleeping ? 'startled' : 'click'); // a click on a sleeper startles it awake
      }
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---- tray: say something on request, graceful quit ----
  bridge?.onSay(({ category }) => {
    touch();
    const pool = category.split('+');
    chat(pool[Math.floor(Math.random() * pool.length)], true);
  });
  bridge?.onClosing(() => {
    const line = chat('quit');
    window.setTimeout(() => bridge.quitNow(), line ? GOODBYE_MS : 0);
  });

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
      case 'available': {
        const line = chat('updateAvailable');
        if (line) bubble.say(`${line} (v${s.version})`, { ms: readMs(line) + 1500 });
        break;
      }
      case 'downloading': if (s.manual) bubble.say(`Downloading update: ${s.percent}%`, { ms: 1500 }); break;
      case 'ready': {
        const line = personality.say('updateReady') ?? 'Update ready.'; // essential: always speaks
        speak(`${line} (v${s.version})`, { sticky: true, restart: true });
        break;
      }
      case 'none': if (s.manual) chat('upToDate', true); break;
      case 'dev': bubble.say(s.message ?? 'Updates are disabled in dev mode.'); break;
      case 'error': if (s.manual) bubble.say(`Update error: ${s.message}`, { ms: 8000 }); break;
    }
  });

  chat('startup');
}

boot().catch((err) => console.error('Clippy failed to start', err));
