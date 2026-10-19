import type { Pose } from '../character/pose';
import { Spring } from './Spring';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const BLINK_LEN = 0.17;
const CURSOR_ATTENTION_S = 4;

/**
 * Idle + direct-manipulation layer.
 * Reactive motion (drag, landing) lives in springs so impulses overshoot naturally.
 * Ambient motion (breathing, float, blinking, glances) is procedural and summed on top.
 */
export class Controller {
  private t = 0;

  // reactive springs
  private sx = new Spring(3.4, 0.3, 1);
  private sy = new Spring(3.4, 0.3, 1);
  private tilt = new Spring(2.6, 0.38, 0);
  private bend = new Spring(2.4, 0.4, 0);
  private lookX = new Spring(9, 0.7, 0);
  private lookY = new Spring(9, 0.7, 0);
  private brow = new Spring(6, 0.55, 0);
  private wide = new Spring(8, 0.6, 1);

  // ambient state
  private blinkIn = rand(1.5, 4);
  private blinkT = -1;
  private blinkAgain = false;
  private wanderIn = rand(1, 2.5);
  private wander = { x: 0, y: 0 };

  // input state
  private dragging = false;
  private dragVx = 0;
  private hovered = false;
  private lastPoke = -10;
  private cursor: { x: number; y: number; at: number } | null = null;

  /** Cursor position relative to Clippy's eyes, in stage px. */
  setCursorOffset(dx: number, dy: number) {
    this.cursor = { x: dx, y: dy, at: this.t };
  }

  setHovered(h: boolean) {
    this.hovered = h;
    if (h) this.lastPoke = this.t;
  }

  beginDrag() {
    this.dragging = true;
    this.lastPoke = this.t;
    this.sy.target = 1.08;
    this.sx.target = 0.94;
    this.wide.target = 1.12;
    this.brow.target = 0.9;
  }

  /** Horizontal drag velocity in px/s (already smoothed by the caller). */
  dragVelocity(vx: number) {
    this.dragVx = vx;
  }

  endDrag() {
    this.dragging = false;
    this.dragVx = 0;
    this.lastPoke = this.t;
    this.sy.target = 1;
    this.sx.target = 1;
    this.wide.target = 1;
    this.brow.target = 0;
    // Landing: slam into a squash and let the springs overshoot back.
    this.sy.kick(0.76, 0);
    this.sx.kick(1.2, 0);
    this.tilt.vel += 0.5;
  }

  /** True when something is moving fast enough to deserve full frame rate. */
  get active() {
    return (
      this.dragging ||
      this.blinkT >= 0 ||
      this.t - this.lastPoke < 1.5 ||
      this.sx.energy + this.sy.energy + this.tilt.energy + this.bend.energy > 0.06
    );
  }

  update(dt: number): Pose {
    this.t += dt;
    const t = this.t;

    this.updateBlink(dt);
    this.updateGaze(dt);

    // drag: lean against motion, trail the head behind it
    this.tilt.target = this.dragging ? clamp(-this.dragVx * 0.0011, -0.4, 0.4) : 0;
    this.bend.target = this.dragging ? clamp(-this.dragVx * 0.0016, -1, 1) : 0;
    if (!this.dragging) this.brow.target = this.hovered ? 0.7 : 0;

    for (const s of [this.sx, this.sy, this.tilt, this.bend, this.lookX, this.lookY, this.brow, this.wide]) s.step(dt);

    const breath = Math.sin((t * TAU) / 3.4);
    const floatY = Math.sin((t * TAU) / 4.6 + 1);

    return {
      sx: this.sx.value - breath * 0.012,
      sy: this.sy.value + breath * 0.022,
      bend: this.bend.value + this.lookX.value * 0.12 + Math.sin((t * TAU) / 5.5) * 0.13,
      wave: 0.2 + 0.1 * Math.sin((t * TAU) / 3.1) + Math.abs(this.dragVx) * 0.0006,
      phase: t * 1.7,
      tilt: this.tilt.value + Math.sin((t * TAU) / 6.1) * 0.018,
      offsetX: 0,
      offsetY: -3 - 2.5 * floatY,
      eyeOpen: this.eyeOpen() * this.wide.value,
      lookX: this.lookX.value,
      lookY: this.lookY.value,
      browRaise: this.brow.value + (this.lookY.value < -0.4 ? 0.25 : 0),
      browTilt: 0,
    };
  }

  private eyeOpen() {
    if (this.blinkT < 0) return 1;
    const k = Math.sin((this.blinkT / BLINK_LEN) * Math.PI); // 0 -> 1 -> 0
    return 1 - 0.93 * k * k * (3 - 2 * k); // smoothstep, ends fully open
  }

  private updateBlink(dt: number) {
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT >= BLINK_LEN) {
        this.blinkT = -1;
        this.blinkIn = this.blinkAgain ? 0.1 : rand(2, 6);
        this.blinkAgain = false;
      }
      return;
    }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0;
      this.blinkAgain = !this.blinkAgain && Math.random() < 0.22;
    }
  }

  private updateGaze(dt: number) {
    const c = this.cursor;
    if (c && this.t - c.at < CURSOR_ATTENTION_S) {
      const d = Math.hypot(c.x, c.y) || 1;
      const reach = clamp(d / 160, 0, 1); // looks straight at the cursor when it's close
      this.lookX.target = (c.x / d) * reach;
      this.lookY.target = (c.y / d) * reach;
      return;
    }
    // Nothing to watch: idle saccades.
    this.wanderIn -= dt;
    if (this.wanderIn <= 0) {
      this.wanderIn = rand(1.2, 3.6);
      this.wander = Math.random() < 0.35 ? { x: 0, y: 0 } : { x: rand(-0.7, 0.7), y: rand(-0.4, 0.4) };
    }
    this.lookX.target = this.wander.x;
    this.lookY.target = this.wander.y;
  }
}
