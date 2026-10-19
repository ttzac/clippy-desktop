// Everything the rig needs to draw one frame. Animation code only ever produces Poses;
// the rig only ever consumes them, so new characters/animation packs can share either side.

export interface Pose {
  sx: number; // horizontal scale about the base (squash/stretch)
  sy: number; // vertical scale about the base
  bend: number; // head lean, -1..1 (flexes the wire, not a rigid rotate)
  wave: number; // S-curve ripple amplitude (secondary motion)
  phase: number; // ripple phase, radians
  tilt: number; // whole-body rotation about the base, radians
  offsetX: number; // design units
  offsetY: number; // design units, negative = up
  eyeOpen: number; // 0 closed .. 1 open (can exceed 1 for wide eyes)
  lookX: number; // -1..1
  lookY: number; // -1..1
  browRaise: number; // -1..1
  browTilt: number; // -1..1, positive = angry/inward
}

export const NEUTRAL_POSE: Pose = {
  sx: 1, sy: 1, bend: 0, wave: 0, phase: 0, tilt: 0, offsetX: 0, offsetY: 0,
  eyeOpen: 1, lookX: 0, lookY: 0, browRaise: 0, browTilt: 0,
};
