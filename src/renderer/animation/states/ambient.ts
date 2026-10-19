import { clamp01, smoothstep } from '../ease';
import { Priority, type Env, type StateDef } from '../StateMachine';

/**
 * Nods off: head droops, eyes sag shut after a couple of drowsy bobs, slow heavy breathing,
 * a snore bubble in the mouth, and Zs drifting up. Any interruption startles it awake (-> shocked).
 */
export const sleeping: StateDef = {
  id: 'sleeping',
  priority: Priority.AMBIENT,
  blendIn: 1.1,
  blendOut: 0.7,
  minDuration: 3,
  fps: 30,
  interruptedBy: (id) => (id === 'dragging' || id === 'shocked' ? null : 'shocked'),
  create(env: Env) {
    let nextZ = 1.6;
    let zCount = 0;
    return {
      update(t) {
        if (t >= nextZ) {
          nextZ = t + 1.7;
          const head = env.anchor('top');
          env.fx.zzz({ x: head.x + 18, y: head.y - 4 }, [0.8, 1, 1.25][zCount++ % 3]);
        }
        const drift = smoothstep(t / 1.4);
        const breath = Math.sin((t * Math.PI * 2) / 4.4);
        // two drowsy head-nods before the eyes finally close
        const nod = t < 2.4 ? Math.max(0, Math.sin(t * 3.2)) * (1 - t / 2.4) * 0.5 : 0;
        const eyes = 1 - 0.94 * smoothstep((t - 0.4) / 1.8);
        return {
          eyeOpenMul: Math.max(0.06, eyes - nod * 0.2),
          tilt: 0.15 * drift + nod * 0.06,
          bend: 0.34 * drift + nod * 0.12,
          sy: -0.055 * drift + breath * 0.03,
          sx: 0.025 * drift - breath * 0.015,
          offsetY: 6 * drift, // settles to rest instead of floating
          browRaise: -0.25 * drift,
          browTilt: -0.15 * drift,
          mouthOpen: 0.3 * drift * clamp01(0.55 + breath * 0.5),
          look: { x: 0, y: 0.4 },
          lookWeight: drift,
        };
      },
    };
  },
};
