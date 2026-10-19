export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);
/** Overshoots past 1 then settles; the workhorse for anticipation/overshoot poses. */
export const easeOutBack = (t: number, s = 1.70158) => {
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
/** Exponentially decaying sine, for wobble that dies out. */
export const wobble = (t: number, freq: number, decay: number) => Math.sin(t * freq * Math.PI * 2) * Math.exp(-t * decay);
