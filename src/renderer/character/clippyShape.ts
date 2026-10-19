// Master silhouette of the paperclip, in design units (90 x 140 box).
// Sampled once into a dense polyline so the rig can deform it per frame.

export const CLIP_CX = 44;
export const CLIP_BASE_Y = 118; // lowest centre-line point (pivot for squash and tilt)
export const CLIP_TOP_Y = 10; // highest centre-line point

type Pt = [number, number];
const STEP = 2.5;

function line(a: Pt, b: Pt, out: Pt[]) {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
  for (let i = out.length ? 1 : 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, out: Pt[]) {
  const n = Math.max(2, Math.round((Math.abs(a1 - a0) * r) / STEP));
  for (let i = out.length ? 1 : 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}

function build(): Pt[] {
  const p: Pt[] = [];
  line([58, 82], [58, 100], p); // free end of the outer wire
  arc(40, 100, 18, 0, Math.PI, p); // bottom bend
  line([22, 100], [22, 32], p); // left strand
  arc(44, 32, 22, Math.PI, Math.PI * 2, p); // head loop
  line([66, 32], [66, 90], p); // right strand
  arc(57, 90, 9, 0, Math.PI, p); // inner bend
  line([48, 90], [48, 62], p); // inner strand, stops under the eyes
  return p;
}

export const CLIP_POINTS: readonly Pt[] = build();
