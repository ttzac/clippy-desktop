import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Spring } from '../animation/Spring';
import type { Fx, Vec } from '../animation/StateMachine';

type Kind = 'sparkle' | 'zed' | 'bang' | 'line';

interface Particle {
  sprite: Sprite;
  alive: boolean;
  x: number; y: number; vx: number; vy: number; ax: number; ay: number;
  life: number; max: number;
  s0: number; s1: number;
  rot: number; vrot: number;
  swayAmp: number; swayFreq: number; swayPhase: number;
  fadeIn: number; fadeOut: number;
  baseX: number;
}

interface EmitOpts {
  vx?: number; vy?: number; ax?: number; ay?: number;
  life?: number; s0?: number; s1?: number;
  rot?: number; vrot?: number;
  sway?: [amp: number, freq: number];
  fadeIn?: number; fadeOut?: number;
}

const POOL = 72;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function strokePath(g: Graphics, pts: [number, number][], width: number, color: number) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke({ width, color, cap: 'round', join: 'round' });
}

/** Pooled sprite particles plus the thought-bubble prop. Implements the Fx interface states talk to. */
export class PixiFx implements Fx {
  readonly layer = new Container();
  private readonly textures: Record<Kind, Texture>;
  private readonly pool: Particle[] = [];
  private readonly thoughtBubble: ThoughtBubble;
  private time = 0;

  constructor(app: Application, private readonly thoughtAnchor: () => Vec) {
    this.textures = {
      sparkle: this.bake(app, (g) => {
        const pts: number[] = [];
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 - Math.PI / 2;
          const r = i % 2 === 0 ? 10 : 2.6;
          pts.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.poly(pts).fill(0xffe680).stroke({ width: 1.2, color: 0xd99a00, join: 'round' });
      }),
      zed: this.bake(app, (g) => {
        const z: [number, number][] = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
        strokePath(g, z, 6.4, 0x23378f);
        strokePath(g, z, 3.2, 0xa9c0ff);
      }),
      bang: this.bake(app, (g) => {
        g.roundRect(-3.6, -15, 7.2, 18, 3.4).fill(0xff4b3e).stroke({ width: 1.8, color: 0x5a0f0a });
        g.circle(0, 9, 3.8).fill(0xff4b3e).stroke({ width: 1.8, color: 0x5a0f0a });
      }),
      line: this.bake(app, (g) => {
        g.roundRect(-2.3, -13, 4.6, 26, 2.3).fill(0x2b2f36);
      }),
    };

    for (let i = 0; i < POOL; i++) {
      const sprite = new Sprite(this.textures.sparkle);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.layer.addChild(sprite);
      this.pool.push({
        sprite, alive: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, life: 0, max: 1,
        s0: 1, s1: 1, rot: 0, vrot: 0, swayAmp: 0, swayFreq: 0, swayPhase: 0, fadeIn: 0.1, fadeOut: 0.35, baseX: 0,
      });
    }
    this.thoughtBubble = new ThoughtBubble();
    this.layer.addChild(this.thoughtBubble);
  }

  private bake(app: Application, draw: (g: Graphics) => void): Texture {
    const g = new Graphics();
    draw(g);
    const tex = app.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
    g.destroy();
    return tex;
  }

  // ---- Fx interface ----

  sparkle(at: Vec, count: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(radius * 0.4, radius);
      this.emit('sparkle', at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, {
        vx: Math.cos(a) * 12, vy: Math.sin(a) * 12 - 18, ay: 30, life: rand(0.55, 0.95),
        s0: 0.3, s1: rand(1.0, 1.7), rot: rand(-0.5, 0.5), vrot: rand(-3, 3), fadeIn: 0.12, fadeOut: 0.5,
      });
    }
  }

  zzz(at: Vec, size: number) {
    this.emit('zed', at.x, at.y, {
      vx: 14, vy: -26, life: 2.6, s0: 0.35 * size, s1: 1.15 * size, rot: -0.2, vrot: 0.12,
      sway: [7, 1.6], fadeIn: 0.25, fadeOut: 0.45,
    });
  }

  bang(at: Vec) {
    this.emit('bang', at.x, at.y, { vy: -14, ay: 20, life: 1.15, s0: 0.2, s1: 1.5, rot: 0, fadeIn: 0.05, fadeOut: 0.3 });
  }

  shockLines(at: Vec) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const r0 = 68;
      this.emit('line', at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0, {
        vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, life: 0.5, s0: 1.3, s1: 0.5,
        rot: a + Math.PI / 2, fadeIn: 0.02, fadeOut: 0.6,
      });
    }
  }

  thought(show: boolean) {
    this.thoughtBubble.setVisible(show);
  }

  // ---- internals ----

  private emit(kind: Kind, x: number, y: number, o: EmitOpts) {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.sprite.texture = this.textures[kind];
    p.sprite.visible = true;
    p.x = x; p.y = y; p.baseX = x;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.ax = o.ax ?? 0; p.ay = o.ay ?? 0;
    p.life = 0; p.max = o.life ?? 1;
    p.s0 = o.s0 ?? 1; p.s1 = o.s1 ?? 1;
    p.rot = o.rot ?? 0; p.vrot = o.vrot ?? 0;
    p.swayAmp = o.sway?.[0] ?? 0; p.swayFreq = o.sway?.[1] ?? 0; p.swayPhase = rand(0, 6.28);
    p.fadeIn = o.fadeIn ?? 0.1; p.fadeOut = o.fadeOut ?? 0.35;
  }

  get count() {
    let n = 0;
    for (const p of this.pool) if (p.alive) n++;
    return n;
  }

  update(dt: number) {
    this.time += dt;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.alive = false;
        p.sprite.visible = false;
        continue;
      }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const sway = p.swayAmp ? Math.sin(p.life * p.swayFreq * Math.PI * 2 + p.swayPhase) * p.swayAmp : 0;
      const s = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, 2));
      const aIn = Math.min(1, k / p.fadeIn);
      const aOut = Math.min(1, (1 - k) / p.fadeOut);
      p.sprite.position.set(p.x + sway, p.y);
      p.sprite.scale.set(s);
      p.sprite.rotation = p.rot;
      p.sprite.alpha = Math.min(aIn, aOut);
    }
    const head = this.thoughtAnchor();
    this.thoughtBubble.position.set(head.x + 70, head.y - 112);
    this.thoughtBubble.update(dt, this.time);
  }
}

class ThoughtBubble extends Container {
  private scaleSpring = new Spring(3.2, 0.42, 0);
  private dots = new Graphics();
  private wanted = false;

  constructor() {
    super();
    const cloud = new Graphics();
    const lobes: [number, number, number][] = [[-24, 4, 15], [-8, -9, 19], [14, -8, 18], [28, 5, 14], [6, 10, 17]];
    const trail: [number, number, number][] = [[-34, 34, 6], [-43, 49, 4.2], [-49, 61, 2.8]];
    for (const [x, y, r] of [...lobes, ...trail]) cloud.circle(x, y, r + 1.7).fill(0x24282f);
    for (const [x, y, r] of [...lobes, ...trail]) cloud.circle(x, y, r).fill(0xffffff);
    this.addChild(cloud, this.dots);
    this.visible = false;
  }

  setVisible(v: boolean) {
    this.wanted = v;
    this.scaleSpring.target = v ? 1 : 0;
    if (v) this.visible = true;
  }

  update(dt: number, time: number) {
    if (!this.visible) return;
    this.scaleSpring.step(dt);
    const s = Math.max(0, this.scaleSpring.value);
    this.scale.set(s);
    if (!this.wanted && s < 0.02) {
      this.visible = false;
      return;
    }
    this.dots.clear();
    for (let i = 0; i < 3; i++) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 5.5 - i * 0.95);
      this.dots.circle(-14 + i * 16, 2 - pulse * 2.2, 2.6 + pulse * 1.6).fill(0x24282f);
    }
  }
}
