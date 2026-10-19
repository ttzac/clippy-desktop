import { Container, Graphics, Point } from 'pixi.js';
import { CLIP_BASE_Y, CLIP_CX, CLIP_POINTS, CLIP_TOP_Y } from './clippyShape';
import type { Pose } from './pose';
import type { AnchorName } from '../animation/StateMachine';

export const RIG_SCALE = 1.7;

const OUTLINE = 0x24282f;
const WIRE_DARK = 0x8a939e;
const WIRE_MID = 0xc2c9d2;
const WIRE_LIGHT = 0xf4f7fa;
const EYE_Y = 46;
const EYE_XS = [34, 54] as const;
const MOUTH = { x: 44, y: 68 };

const ANCHORS: Record<AnchorName, [number, number]> = {
  head: [CLIP_CX, EYE_Y],
  top: [CLIP_CX, 6],
  mouth: [MOUTH.x, MOUTH.y],
  body: [CLIP_CX, 78],
  eyeL: [EYE_XS[0], EYE_Y],
  eyeR: [EYE_XS[1], EYE_Y],
};

function star(g: Graphics, r1: number, r2: number) {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return g.poly(pts).fill(0xffffff);
}

class EyeUnit extends Container {
  readonly ball = new Container();
  private readonly pupil = new Container();
  private readonly iris = new Graphics().circle(0, 0, 3.9).fill(0x14161b);
  private readonly glint = new Graphics().circle(-1.3, -1.5, 1.2).fill(0xffffff);
  private readonly star = star(new Graphics(), 3.1, 0.8);
  private readonly brow = new Graphics();
  private readonly lid = new Graphics().moveTo(-7.6, -1).quadraticCurveTo(0, 5.2, 7.6, -1).stroke({ width: 2.6, color: OUTLINE, cap: 'round' });

  constructor(private readonly side: -1 | 1) {
    super();
    const sclera = new Graphics()
      .ellipse(0, 0, 8.8, 10.6)
      .fill(0xffffff)
      .stroke({ width: 1.7, color: OUTLINE });
    this.star.visible = false;
    this.pupil.addChild(this.iris, this.glint, this.star);
    this.ball.addChild(sclera, this.pupil);

    this.brow.moveTo(-7.5, 0).quadraticCurveTo(0, -3.8, 7.5, 0).stroke({ width: 2.6, color: OUTLINE, cap: 'round' });
    this.lid.visible = false;
    this.addChild(this.ball, this.lid, this.brow);
  }

  apply(pose: Pose) {
    // Nearly shut: swap the squashed ball for a clean curved lid line (a scaled outline looks dotted).
    const shut = pose.eyeOpen < 0.17;
    this.lid.visible = shut;
    this.ball.visible = !shut;
    this.ball.scale.y = Math.max(0.17, pose.eyeOpen);
    this.pupil.position.set(pose.lookX * 3.4, pose.lookY * 4.2);
    this.pupil.scale.set(Math.max(0.2, pose.pupilScale));

    const s = pose.sparkle;
    this.star.visible = s > 0.04;
    if (this.star.visible) {
      const pulse = 1 + 0.18 * Math.sin(pose.phase * 5 + this.side);
      this.star.position.set(-1.5, -1.7);
      this.star.scale.set(s * pulse * 1.1);
      this.star.rotation = Math.sin(pose.phase * 2.4 + this.side) * 0.25;
      this.glint.alpha = 1;
    } else this.glint.alpha = 1;

    this.brow.position.y = -14.5 - pose.browRaise * 4.5;
    // Positive browTilt = angry: inner ends drop. Mirror per side.
    this.brow.rotation = this.side * pose.browTilt * 0.45 * -1;
  }
}

export class ClippyRig extends Container {
  private readonly body = new Graphics();
  private readonly mouth = new Graphics();
  private readonly eyes = [new EyeUnit(-1), new EyeUnit(1)];
  private readonly pts = new Float32Array(CLIP_POINTS.length * 2);
  private home = new Point(0, 0);
  private pose!: Pose;

  constructor() {
    super();
    this.addChild(this.body, this.mouth, ...this.eyes);
    this.scale.set(RIG_SCALE);
    this.pivot.set(CLIP_CX, CLIP_BASE_Y);
  }

  /** Where the base of the clip sits in stage coordinates. */
  setHome(x: number, y: number) {
    this.home.set(x, y);
  }

  /** Stage-space position of a named point on the character (for cursor tracking and effects). */
  anchor(name: AnchorName): { x: number; y: number } {
    const [x, y] = ANCHORS[name];
    const p = this.toGlobal(new Point(x, y));
    return { x: p.x, y: p.y };
  }

  eyeCentre() {
    return this.anchor('head');
  }

  render(pose: Pose) {
    this.pose = pose;
    this.position.set(this.home.x + pose.offsetX * RIG_SCALE, this.home.y + pose.offsetY * RIG_SCALE);
    this.rotation = pose.tilt;
    this.drawBody();
    this.placeFace();
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

  private placeFace() {
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

    this.deform(MOUTH.x, MOUTH.y, a);
    this.deform(MOUTH.x, MOUTH.y - 6, b);
    this.mouth.position.set(a.x, a.y);
    this.mouth.rotation = Math.atan2(b.x - a.x, a.y - b.y);
    this.drawMouth(this.pose.mouthOpen, this.pose.mouthSmile);
  }

  private drawMouth(open: number, smile: number) {
    const g = this.mouth.clear();
    if (open < 0.04 && Math.abs(smile) < 0.04) return;
    if (open < 0.08) {
      // closed: a simple curve, smile > 0 curls up at the corners
      g.moveTo(-6, 0).quadraticCurveTo(0, smile * 7, 6, 0).stroke({ width: 2.3, color: OUTLINE, cap: 'round' });
      return;
    }
    const w = 4.4 + open * 1.8 + Math.max(0, smile) * 3.4;
    const h = 1.2 + open * 6;
    g.ellipse(0, h * 0.35, w, h).fill(0x3a1218).stroke({ width: 1.5, color: OUTLINE });
    if (h > 3.4) g.ellipse(0, h * 0.35 + h * 0.5, w * 0.55, h * 0.38).fill(0xe0707f);
  }
}
