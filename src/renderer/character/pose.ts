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
  mouthOpen: number; // 0 closed .. 1 wide open
  mouthSmile: number; // -1 frown .. 1 smile (curve of the closed mouth / corners of the open one)
  sparkle: number; // 0..1 star-shaped eye glints
  pupilScale: number; // 1 = normal
}

export const NEUTRAL_POSE: Pose = {
  sx: 1, sy: 1, bend: 0, wave: 0, phase: 0, tilt: 0, offsetX: 0, offsetY: 0,
  eyeOpen: 1, lookX: 0, lookY: 0, browRaise: 0, browTilt: 0,
  mouthOpen: 0, mouthSmile: 0, sparkle: 0, pupilScale: 1,
};

/**
 * What a state contributes on top of the base (idle) pose. Numeric fields are additive deltas;
 * eyeOpenMul multiplies; look overrides gaze with its own weight. All are scaled by the state's blend weight.
 */
export interface PoseMod {
  sx?: number; sy?: number; bend?: number; wave?: number; tilt?: number;
  offsetX?: number; offsetY?: number;
  browRaise?: number; browTilt?: number;
  mouthOpen?: number; mouthSmile?: number; sparkle?: number; pupilScale?: number;
  eyeOpenMul?: number;
  look?: { x: number; y: number };
  lookWeight?: number;
}

export const ADDITIVE_KEYS = [
  'sx', 'sy', 'bend', 'wave', 'tilt', 'offsetX', 'offsetY',
  'browRaise', 'browTilt', 'mouthOpen', 'mouthSmile', 'sparkle', 'pupilScale',
] as const;
