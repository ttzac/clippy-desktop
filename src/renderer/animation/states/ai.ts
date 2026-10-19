import { clamp01, smoothstep } from '../ease';
import { Priority, type Env, type StateDef } from '../StateMachine';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Pondering: gaze up and away, brow cocked, slow sway with periodic "hmm" nods, thought cloud overhead. */
export const thinking: StateDef = {
  id: 'thinking',
  priority: Priority.AI,
  blendIn: 0.3,
  blendOut: 0.4,
  fps: 30,
  create(env: Env) {
    env.fx.thought(true);
    let nextNod = 1.4;
    let nodAt = -10;
    return {
      update(t) {
        if (t > nextNod) {
          nodAt = t;
          nextNod = t + rand(2.2, 3.4);
        }
        const nodK = Math.sin(clamp01((t - nodAt) / 0.5) * Math.PI);
        const settle = smoothstep(t / 0.5);
        return {
          tilt: (0.11 + Math.sin(t * 1.3) * 0.045) * settle,
          bend: (0.22 + Math.sin(t * 0.9) * 0.1) * settle,
          sy: -0.03 * nodK,
          eyeOpenMul: 0.9,
          browRaise: 0.55 * settle,
          browTilt: 0.28 * settle,
          mouthSmile: -0.45 * settle,
          look: { x: 0.55, y: -0.85 },
          lookWeight: settle,
        };
      },
      end: () => env.fx.thought(false),
    };
  },
};

/** Speaking: mouth flaps on a syllable rhythm, body bobs with it, brows punctuate. Duration comes from the text length. */
export const talking: StateDef = {
  id: 'talking',
  priority: Priority.AI,
  blendIn: 0.12,
  blendOut: 0.3,
  duration: 3,
  create() {
    let mouth = 0;
    let target = 0;
    let nextSyllable = 0;
    let nextEmphasis = 0.7;
    let emphasisAt = -10;
    let lastT = 0;
    return {
      update(t) {
        const dt = Math.min(0.05, t - lastT);
        lastT = t;
        if (t >= nextSyllable) {
          // mostly open vowels, with occasional closed gaps between words
          target = Math.random() < 0.2 ? 0 : rand(0.3, 0.95);
          nextSyllable = t + (target === 0 ? rand(0.1, 0.22) : rand(0.08, 0.17));
        }
        mouth += (target - mouth) * Math.min(1, dt * 22);
        if (t >= nextEmphasis) {
          emphasisAt = t;
          nextEmphasis = t + rand(0.9, 1.8);
        }
        const emph = Math.sin(clamp01((t - emphasisAt) / 0.35) * Math.PI);
        return {
          mouthOpen: mouth,
          mouthSmile: 0.35,
          sy: mouth * 0.035 + emph * 0.03,
          sx: -mouth * 0.02,
          offsetY: -emph * 2.5,
          bend: Math.sin(t * 3.1) * 0.07,
          tilt: Math.sin(t * 2.2) * 0.03,
          browRaise: emph * 0.7,
          eyeOpenMul: 1 + emph * 0.06,
        };
      },
    };
  },
};
