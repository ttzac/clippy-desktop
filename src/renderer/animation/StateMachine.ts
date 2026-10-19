// Pure logic (no Pixi/DOM) so it can be unit tested.
import { ADDITIVE_KEYS, type Pose, type PoseMod } from '../character/pose';
import { lerp, smoothstep } from './ease';

/** Higher wins. A state may only interrupt one of equal or lower priority. */
export const Priority = { IDLE: 0, AMBIENT: 1, CONTEXT: 2, AI: 3, INTERACTION: 4 } as const;

export type AnchorName = 'head' | 'top' | 'mouth' | 'body' | 'eyeL' | 'eyeR';
export interface Vec { x: number; y: number }

/** Visual effects a state may trigger. Implemented on top of Pixi in effects/. */
export interface Fx {
  sparkle(at: Vec, count: number, radius: number): void;
  zzz(at: Vec, size: number): void;
  bang(at: Vec): void;
  shockLines(at: Vec): void;
  thought(show: boolean): void;
}

export interface Env {
  /** Cursor offset from Clippy's eyes in stage px, or null if the cursor hasn't moved recently. */
  cursor(): Vec | null;
  anchor(name: AnchorName): Vec;
  fx: Fx;
}

export interface PlayOpts {
  duration?: number; // seconds; omit for the state's default (or loop until stopped)
  force?: boolean; // ignore priority and cooldown (debug menu, drag)
}

export interface StateInstance {
  update(t: number, dt: number): PoseMod;
  end?(): void; // called once when the state starts fading out
}

export interface StateDef {
  id: string;
  priority: number;
  blendIn: number; // seconds
  blendOut: number;
  duration?: number; // undefined = loops until stopped
  minDuration?: number; // stop() requests are deferred until this much time has played
  cooldown?: number; // seconds after ending before it can start again
  interruptible?: boolean; // default true
  /** If something interrupts this state, play another state instead (e.g. sleeping -> shocked). */
  interruptedBy?(newId: string): string | null;
  /** 30 when the state is calm enough not to need full frame rate. Default 60. */
  fps?: 30 | 60;
  create(env: Env): StateInstance;
}

interface Entry {
  def: StateDef;
  inst: StateInstance;
  t: number;
  weight: number;
  target: 0 | 1;
  duration?: number;
  mod: PoseMod;
}

export class StateMachine {
  private entries: Entry[] = [];
  private defs = new Map<string, StateDef>();
  private lastEnd = new Map<string, number>();
  private clock = 0;

  constructor(defs: StateDef[], private env: Env) {
    for (const d of defs) this.defs.set(d.id, d);
  }

  /** Id of the state currently playing (not fading out), or null when idle. */
  get current(): string | null {
    return this.live()?.def.id ?? null;
  }

  /** Seconds the current state has been playing. */
  get currentTime(): number {
    return this.live()?.t ?? 0;
  }

  /** True if anything needs the full 60 fps. */
  get needsFullRate(): boolean {
    return this.entries.some((e) => e.def.fps !== 30 || e.target === 0);
  }

  get busy(): boolean {
    return this.entries.length > 0;
  }

  request(id: string, opts: PlayOpts = {}, redirected = false): boolean {
    const def = this.defs.get(id);
    if (!def) return false;
    const cur = this.live();

    // Re-requesting the running state just extends it (e.g. talking while text keeps streaming).
    if (cur && cur.def.id === id) {
      if (opts.duration !== undefined) cur.duration = Math.max(cur.duration ?? 0, cur.t + opts.duration);
      return true;
    }

    if (!opts.force) {
      const ended = this.lastEnd.get(id);
      if (def.cooldown && ended !== undefined && this.clock - ended < def.cooldown) return false;
      if (cur) {
        if (def.priority < cur.def.priority) return false;
        if (def.priority === cur.def.priority && cur.def.interruptible === false) return false;
      }
    }

    if (cur && !redirected) {
      const redirect = cur.def.interruptedBy?.(id);
      if (redirect && redirect !== id && this.request(redirect, opts, true)) return true;
    }

    if (cur) this.release(cur);
    this.entries.push({
      def,
      inst: def.create(this.env),
      t: 0,
      weight: 0,
      target: 1,
      duration: opts.duration ?? def.duration,
      mod: {},
    });
    return true;
  }

  /** Fade the state out (optionally only if it is `id`). Honours minDuration. */
  stop(id?: string) {
    const cur = this.live();
    if (!cur || (id && cur.def.id !== id)) return;
    const min = cur.def.minDuration ?? 0;
    if (cur.t < min) cur.duration = min;
    else this.release(cur);
  }

  update(dt: number) {
    this.clock += dt;
    for (const e of this.entries) {
      e.t += dt;
      if (e.target === 1 && e.duration !== undefined && e.t >= e.duration) this.release(e);
      const rate = e.target === 1 ? e.def.blendIn : e.def.blendOut;
      e.weight = e.target === 1 ? Math.min(1, e.weight + dt / rate) : Math.max(0, e.weight - dt / rate);
      e.mod = e.inst.update(e.t, dt);
    }
    this.entries = this.entries.filter((e) => e.target === 1 || e.weight > 0);
  }

  /** Layer every active state's contribution (cross-faded by weight) over the base pose. */
  apply(base: Pose): Pose {
    const out: Pose = { ...base };
    for (const e of this.entries) {
      const w = smoothstep(e.weight);
      const m = e.mod;
      for (const k of ADDITIVE_KEYS) {
        const v = m[k];
        if (v !== undefined) out[k] += v * w;
      }
      if (m.eyeOpenMul !== undefined) out.eyeOpen *= lerp(1, m.eyeOpenMul, w);
      if (m.look) {
        const lw = w * (m.lookWeight ?? 1);
        out.lookX = lerp(out.lookX, m.look.x, lw);
        out.lookY = lerp(out.lookY, m.look.y, lw);
      }
    }
    return out;
  }

  private live(): Entry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].target === 1) return this.entries[i];
    return undefined;
  }

  private release(e: Entry) {
    if (e.target === 0) return;
    e.target = 0;
    e.inst.end?.();
    this.lastEnd.set(e.def.id, this.clock);
  }
}
