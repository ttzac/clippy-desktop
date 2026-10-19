import { describe, expect, it } from 'vitest';
import { NEUTRAL_POSE } from '../character/pose';
import { Priority, StateMachine, type Env, type StateDef } from './StateMachine';

const env: Env = {
  cursor: () => null,
  anchor: () => ({ x: 0, y: 0 }),
  fx: { sparkle() {}, zzz() {}, bang() {}, shockLines() {}, thought() {} },
};

const def = (id: string, priority: number, extra: Partial<StateDef> = {}): StateDef => ({
  id,
  priority,
  blendIn: 0.2,
  blendOut: 0.2,
  create: () => ({ update: () => ({ offsetY: -10, eyeOpenMul: 0.5 }) }),
  ...extra,
});

const run = (m: StateMachine, seconds: number, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) m.update(step);
};

describe('StateMachine', () => {
  it('starts a state and fades it in', () => {
    const m = new StateMachine([def('a', Priority.CONTEXT)], env);
    expect(m.request('a')).toBe(true);
    expect(m.apply(NEUTRAL_POSE).offsetY).toBe(0); // weight 0 before first update
    run(m, 0.5);
    expect(m.current).toBe('a');
    expect(m.apply(NEUTRAL_POSE).offsetY).toBeCloseTo(-10);
    expect(m.apply(NEUTRAL_POSE).eyeOpen).toBeCloseTo(0.5);
  });

  it('rejects lower priority and accepts equal or higher', () => {
    const m = new StateMachine([def('hi', Priority.AI), def('lo', Priority.CONTEXT), def('eq', Priority.AI), def('top', Priority.INTERACTION)], env);
    m.request('hi');
    expect(m.request('lo')).toBe(false);
    expect(m.current).toBe('hi');
    expect(m.request('eq')).toBe(true);
    expect(m.current).toBe('eq');
    expect(m.request('top')).toBe(true);
    expect(m.current).toBe('top');
  });

  it('respects interruptible: false at equal priority', () => {
    const m = new StateMachine([def('a', Priority.AI, { interruptible: false }), def('b', Priority.AI)], env);
    m.request('a');
    expect(m.request('b')).toBe(false);
    expect(m.request('b', { force: true })).toBe(true);
  });

  it('ends after its duration and returns to idle', () => {
    const m = new StateMachine([def('a', Priority.CONTEXT, { duration: 1 })], env);
    m.request('a');
    run(m, 0.9);
    expect(m.current).toBe('a');
    run(m, 0.3);
    expect(m.current).toBeNull();
    run(m, 0.5);
    expect(m.busy).toBe(false);
    expect(m.apply(NEUTRAL_POSE)).toEqual(NEUTRAL_POSE);
  });

  it('cross-fades old and new states instead of snapping', () => {
    const m = new StateMachine(
      [
        def('a', Priority.CONTEXT, { create: () => ({ update: () => ({ offsetY: -10 }) }) }),
        def('b', Priority.CONTEXT, { create: () => ({ update: () => ({ offsetX: 6 }) }) }),
      ],
      env,
    );
    m.request('a');
    run(m, 0.5);
    m.request('b');
    run(m, 0.1); // mid-blend: both partially present
    const mid = m.apply(NEUTRAL_POSE);
    expect(mid.offsetY).toBeLessThan(0);
    expect(mid.offsetY).toBeGreaterThan(-10);
    expect(mid.offsetX).toBeGreaterThan(0);
    expect(mid.offsetX).toBeLessThan(6);
    run(m, 0.5);
    const end = m.apply(NEUTRAL_POSE);
    expect(end.offsetY).toBeCloseTo(0);
    expect(end.offsetX).toBeCloseTo(6);
  });

  it('enforces cooldown after a state ends, unless forced', () => {
    const m = new StateMachine([def('a', Priority.CONTEXT, { duration: 0.2, cooldown: 2 })], env);
    m.request('a');
    run(m, 0.5);
    expect(m.request('a')).toBe(false);
    run(m, 2);
    expect(m.request('a')).toBe(true);
    run(m, 0.5);
    expect(m.request('a', { force: true })).toBe(true);
  });

  it('redirects an interrupted state (sleeping -> shocked) but not for exemptions', () => {
    const sleeping = def('sleeping', Priority.AMBIENT, { interruptedBy: (id) => (id === 'dragging' || id === 'shocked' ? null : 'shocked') });
    const m = new StateMachine([sleeping, def('shocked', Priority.INTERACTION), def('happy', Priority.INTERACTION), def('dragging', Priority.INTERACTION)], env);
    m.request('sleeping');
    expect(m.request('happy')).toBe(true);
    expect(m.current).toBe('shocked');

    const m2 = new StateMachine([sleeping, def('shocked', Priority.INTERACTION), def('dragging', Priority.INTERACTION)], env);
    m2.request('sleeping');
    m2.request('dragging');
    expect(m2.current).toBe('dragging');
  });

  it('extends a running state when re-requested, and defers stop() until minDuration', () => {
    const m = new StateMachine([def('talk', Priority.AI, { duration: 1 }), def('c', Priority.CONTEXT, { minDuration: 1 })], env);
    m.request('talk');
    run(m, 0.8);
    m.request('talk', { duration: 1 });
    run(m, 0.8);
    expect(m.current).toBe('talk'); // would have ended at 1s without the extension
    run(m, 0.5);
    expect(m.current).toBeNull();

    m.request('c');
    run(m, 0.3);
    m.stop('c');
    run(m, 0.4);
    expect(m.current).toBe('c');
    run(m, 0.5);
    expect(m.current).toBeNull();
  });

  it('calls end() exactly once and reports frame-rate needs', () => {
    let ended = 0;
    const calm = def('calm', Priority.AMBIENT, { fps: 30, create: () => ({ update: () => ({}), end: () => ended++ }) });
    const m = new StateMachine([calm], env);
    m.request('calm');
    run(m, 0.3);
    expect(m.needsFullRate).toBe(false);
    m.stop();
    m.stop();
    expect(ended).toBe(1);
    expect(m.needsFullRate).toBe(true); // fading out runs at full rate so the blend is smooth
  });
});
