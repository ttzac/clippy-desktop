import { Container, Graphics, Point } from 'pixi.js';
import { CLIP_BASE_Y, CLIP_CX, CLIP_POINTS, CLIP_TOP_Y } from './clippyShape';
import type { Pose } from './pose';

export const RIG_SCALE = 1.7;

const OUTLINE = 0x24282f;
const WIRE_DARK = 0x8a939e;
const WIRE_MID = 0xc2c9d2;
const WIRE_LIGHT = 0xf4f7fa;
const EYE_Y = 46;
const EYE_XS = [34, 54] as const;

class EyeUnit extends Container {
  readonly ball = new Container();
  private readonly pupil = new Container();
  private readonly brow = new Graphics();

  constructor(private readonly side: -1 | 1) {
    super();
    const sclera = new Graphics()
      .ellipse(0, 0, 8.8, 10.6)
      .fill(0xffffff)
      .stroke({ width: 1.7, color: OUTLINE });
    const iris = new Graphics().circle(0, 0, 3.9).fill(0x14161b);
    const glint = new Graphics().circle(-1.3, -1.5, 1.2).fill(0xffffff);
    this.pupil.addChild(iris, glint);
    this.ball.addChild(sclera, this.pupil);

    this.brow.moveTo(-7.5, 0).quadraticCurveTo(0, -3.8, 7.5, 0).stroke({ width: 2.6, color: OUTLINE, cap: 'round' });
    this.addChild(this.ball, this.brow);
  }

  apply(pose: Pose) {
    this.ball.scale.y = Math.max(0.07, pose.eyeOpen);
    this.pupil.position.set(pose.lookX * 3.4, pose.lookY * 4.2);
    this.brow.position.y = -14.5 - pose.browRaise * 4.5;
    // Positive browTilt = angry: inner ends drop. Mirror per side.
    this.brow.rotation = this.side * pose.browTilt * 0.45 * -1;
  }
}

export class ClippyRig extends Container {
  private readonly body = new Graphics();
  private readonly eyes = [new EyeUnit(-1), new EyeUnit(1)];
  private readonly pts = new Float32Array(CLIP_POINTS.length * 2);
  private home = new Point(0, 0);
  private pose!: Pose;

  constructor() {
    super();
    this.addChild(this.body, ...this.eyes);
    this.scale.set(RIG_SCALE);
    this.pivot.set(CLIP_CX, CLIP_BASE_Y);
  }

  /** Where the base of the clip sits in stage coordinates. */
  setHome(x: number, y: number) {
    this.home.set(x, y);
  }

  /** Stage-space position of the point between the eyes (for cursor tracking). */
  eyeCentre(): Point {
    return this.toGlobal(new Point(CLIP_CX, EYE_Y));
  }

  render(pose: Pose) {
    this.pose = pose;
    this.position.set(this.home.x + pose.offsetX * RIG_SCALE, this.home.y + pose.offsetY * RIG_SCALE);
    this.rotation = pose.tilt;
    this.drawBody();
    this.placeEyes();
  }

  // Flexes the wire: lean grows with height squared (base stays planted), a travelling
  // ripple adds follow-through, then squash/stretch scales about the base.
  private deform(x: number, y: number, out: { x: number; y: number }) {
    const p = this.pose;
    const h = Math.min(1, Math.max(0, (CLIP_BASE_Y - y) / (CLIP_BASE_Y - CLIP_TOP_Y)));
    const px = x + p.bend * 28 * h * h + p.wave * 6 * h * Math.sin(h * Math.PI * 1.5 + p.phase);
    out.x = CLIP_CX + (px - CLIP_CX) * p.sx;
    out.y = CLIP_BASE_Y + (y - CLIP_BASE_Y) * p.sy;
  }

  private drawBody() {
    const tmp = { x: 0, y: 0 };
    const pts = this.pts;
    for (let i = 0; i < CLIP_POINTS.length; i++) {
      this.deform(CLIP_POINTS[i][0], CLIP_POINTS[i][1], tmp);
      pts[i * 2] = tmp.x;
      pts[i * 2 + 1] = tmp.y;
    }
    const g = this.body.clear();
    const pass = (dx: number, dy: number, width: number, color: number) => {
      g.moveTo(pts[0] + dx, pts[1] + dy);
      for (let i = 1; i < CLIP_POINTS.length; i++) g.lineTo(pts[i * 2] + dx, pts[i * 2 + 1] + dy);
      g.stroke({ width, color, cap: 'round', join: 'round' });
    };
    pass(0, 0, 13, OUTLINE);
    pass(0, 0, 9, WIRE_DARK);
    pass(-0.6, -0.8, 6.4, WIRE_MID);
    pass(-1.6, -2, 1.8, WIRE_LIGHT);
  }

  private placeEyes() {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    this.eyes.forEach((eye, i) => {
      const x = EYE_XS[i];
      this.deform(x, EYE_Y, a);
      this.deform(x, EYE_Y - 6, b);
      eye.position.set(a.x, a.y);
      // Eyes ride the wire: rotate with the local tangent of the deformed head.
      eye.rotation = Math.atan2(b.x - a.x, a.y - b.y);
      eye.apply(this.pose);
    });
  }
}
