import { clamp, clamp01, easeOutBack, easeOutCubic, smoothstep, wobble } from '../ease';
import { Priority, type Env, type StateDef, type Vec } from '../StateMachine';

const gazeToward = (c: Vec) => {
  const d = Math.hypot(c.x, c.y) || 1;
  const reach = clamp(d / 160, 0, 1);
  return { x: (c.x / d) * reach, y: (c.y / d) * reach };
};

/** Hovering: tips toward the cursor, brows up, eyes a touch wider, rises on tiptoe. Loops until the hover ends. */
export const curious: StateDef = {
  id: 'curious',
  priority: Priority.CONTEXT,
  blendIn: 0.18,
  blendOut: 0.45,
  duration: 6,
  minDuration: 1.1,
  cooldown: 5,
  create(env: Env) {
    let dir = 1;
    return {
      update(t) {
        const c = env.cursor();
        if (c && Math.abs(c.x) > 12) dir = Math.sign(c.x);
        const lean = easeOutBack(t / 0.42); // overshoots, then settles
        const rise = smoothstep(t / 0.25);
        return {
          tilt: dir * 0.16 * lean + Math.sin(t * 2.3) * 0.012,
          bend: dir * 0.3 * lean,
          sy: 0.045 * rise,
          sx: -0.02 * rise,
          offsetY: -2.2 * rise,
          eyeOpenMul: 1 + 0.12 * rise,
          browRaise: 0.85 * rise,
          browTilt: -0.18 * rise * dir,
          pupilScale: 0.12 * rise,
          look: c ? gazeToward(c) : { x: dir * 0.6, y: -0.1 },
          lookWeight: 1,
        };
      },
    };
  },
};

const HOP = 0.56;
const HOPS = 3;

/** Click reaction: three excited hops with squash/stretch, sparkling eyes, grin, sparkle bursts. */
export const happy: StateDef = {
  id: 'happy',
  priority: Priority.INTERACTION,
  blendIn: 0.08,
  blendOut: 0.35,
  duration: HOP * HOPS + 0.5,
  cooldown: 0.4,
  create(env: Env) {
    let lastApexHop = -1;
    let nextTwinkle = 0.2;
    return {
      update(t) {
        const hopF = t / HOP;
        const hopI = Math.floor(hopF);
        const inHops = hopI < HOPS;
        const phase = hopF - hopI;
        const height = inHops ? 4 * phase * (1 - phase) : 0;
        const peak = 17 * (1 - hopI * 0.14);

        // anticipation crouch before the first jump, landing squash after each
        const ground = inHops ? 1 - clamp01(height / 0.2) : 1;
        const crouch = t < 0.1 ? smoothstep(t / 0.1) * 0.12 : 0;
        const stretch = inHops ? 0.13 * clamp01((height - 0.15) / 0.5) : 0;
        const squash = ground * (hopI === 0 && phase < 0.1 ? 0 : 0.15) + crouch;
        const sy = stretch - squash;

        if (inHops && phase > 0.5 && lastApexHop !== hopI) {
          lastApexHop = hopI;
          env.fx.sparkle(env.anchor('body'), 5, 52);
        }
        if (t > nextTwinkle && t < HOP * HOPS + 0.2) {
          nextTwinkle = t + 0.16;
          env.fx.sparkle(env.anchor('head'), 1, 58);
        }

        const sparkle = smoothstep(t / 0.15) * (1 - smoothstep((t - (HOP * HOPS + 0.1)) / 0.3));
        return {
          offsetY: -height * peak,
          sy,
          sx: -sy * 0.75,
          tilt: Math.sin(hopF * Math.PI * 2) * 0.07,
          bend: Math.sin(t * 11) * 0.09,
          wave: 0.25,
          sparkle,
          pupilScale: 0.28 * sparkle,
          eyeOpenMul: 1.06,
          mouthSmile: 1,
          mouthOpen: 0.55 * clamp01(height * 1.4),
          browRaise: 0.6,
        };
      },
    };
  },
};

/** Startle: crouch, snap backwards, wide eyes with pinprick pupils, "!" and shock lines, then a trembling settle. */
export const shocked: StateDef = {
  id: 'shocked',
  priority: Priority.INTERACTION,
  blendIn: 0.04,
  blendOut: 0.4,
  duration: 1.9,
  cooldown: 2.5,
  create(env: Env) {
    let fired = false;
    let away = -1;
    return {
      update(t) {
        const c = env.cursor();
        if (t < 0.05 && c) away = -(Math.sign(c.x) || 1);
        if (!fired && t >= 0.07) {
          fired = true;
          env.fx.bang(env.anchor('top'));
          env.fx.shockLines(env.anchor('head'));
        }

        // 0 -> 0.07 crouch, 0.07 -> 0.27 launch, 0.27 -> 0.6 fall + land
        const crouch = t < 0.07 ? smoothstep(t / 0.07) : 0;
        const air = t < 0.07 ? 0 : t < 0.27 ? easeOutCubic((t - 0.07) / 0.2) : 1 - smoothstep((t - 0.27) / 0.33);
        const landed = t > 0.6 ? wobble(t - 0.6, 3.2, 3.2) : 0;
        const hold = 1 - smoothstep((t - 1.2) / 0.5); // eyes stay huge for a beat
        const tremble = t > 0.3 ? Math.sin(t * 58) * 0.028 * hold : 0;

        return {
          offsetY: -21 * air,
          offsetX: away * 15 * air,
          tilt: away * 0.26 * air + tremble,
          sy: 0.2 * air - 0.12 * crouch - 0.2 * landed,
          sx: -0.15 * air + 0.1 * crouch + 0.2 * landed,
          wave: 0.5 * hold,
          eyeOpenMul: 1 + 0.28 * hold,
          pupilScale: -0.55 * hold,
          browRaise: 1 * hold,
          mouthOpen: 0.95 * hold,
          mouthSmile: 0,
          look: { x: 0, y: -0.1 },
          lookWeight: hold,
        };
      },
    };
  },
};

/** Marker state while the user is dragging: blocks other animations; the physical wobble lives in the Controller. */
export const dragging: StateDef = {
  id: 'dragging',
  priority: Priority.INTERACTION,
  blendIn: 0.1,
  blendOut: 0.2,
  interruptible: false,
  create: () => ({ update: () => ({ eyeOpenMul: 1.08, browRaise: 0.5 }) }),
};
