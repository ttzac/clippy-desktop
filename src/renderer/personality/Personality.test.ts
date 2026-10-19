import { describe, expect, it } from 'vitest';
import { CATEGORIES, LINES } from './lines';
import { Personality, timeOfDay, type CategoryConfig, type LineSet } from './Personality';

const text = (l: string | { t: string }) => (typeof l === 'string' ? l : l.t);

/** Controllable clock and deterministic rng. */
const make = (lines: LineSet, cfg: Record<string, CategoryConfig>, rngValue = 0) => {
  const clock = { t: 1000 };
  let seq = 0;
  const p = new Personality(lines, cfg, { now: () => clock.t, rng: () => (rngValue === -1 ? ((seq++ * 0.37 + 0.11) % 1) : rngValue) });
  return { p, clock };
};

describe('dialogue content', () => {
  const all = Object.values(LINES).flat().map(text);

  it('has 100+ unique lines', () => {
    expect(all.length).toBeGreaterThanOrEqual(100);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every category with lines has a config, and every config has lines', () => {
    expect(Object.keys(LINES).sort()).toEqual(Object.keys(CATEGORIES).sort());
    for (const [cat, pool] of Object.entries(LINES)) expect(pool.length, cat).toBeGreaterThanOrEqual(3);
  });

  it('keeps lines short enough for a speech bubble', () => {
    for (const l of all) expect(l.length, l).toBeLessThanOrEqual(120);
  });

  it('startup has lines for every time of day', () => {
    for (const tod of ['morning', 'afternoon', 'evening', 'night']) {
      expect(LINES.startup.some((l) => typeof l !== 'string' && l.tod === tod), tod).toBe(true);
    }
  });
});

describe('Personality', () => {
  const lines: LineSet = { a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], s: ['s1', 's2', 's3'] };
  const cfg: Record<string, CategoryConfig> = {
    a: { kind: 'reactive', cooldown: 10 },
    b: { kind: 'reactive', cooldown: 0 },
    s: { kind: 'spontaneous', cooldown: 0 },
    e: { kind: 'essential', cooldown: 0 },
    c: { kind: 'courtesy', cooldown: 0 },
  };
  const all = { ...lines, e: ['e1', 'e2'], c: ['c1', 'c2'] };

  it('returns null for unknown categories', () => {
    expect(make(all, cfg).p.say('nope')).toBeNull();
  });

  it('enforces per-category cooldown', () => {
    const { p, clock } = make(all, cfg);
    expect(p.say('a')).not.toBeNull();
    clock.t += 9;
    expect(p.say('a')).toBeNull();
    clock.t += 2;
    expect(p.say('a')).not.toBeNull();
  });

  it('spaces out lines globally for reactive categories (normal: 4s)', () => {
    const { p, clock } = make(all, cfg, 0.5);
    expect(p.say('a')).not.toBeNull();
    clock.t += 2;
    expect(p.say('b')).toBeNull(); // different category, still too soon
    clock.t += 3;
    expect(p.say('b')).not.toBeNull();
  });

  it('never repeats a line until the whole category has been used', () => {
    const { p, clock } = make({ x: ['1', '2', '3', '4', '5'] }, { x: { kind: 'courtesy', cooldown: 0 } }, -1);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) { seen.push(p.say('x')!); clock.t += 1; }
    expect(new Set(seen).size).toBe(5);
  });

  it('does not repeat the last line when the bag refills', () => {
    const { p, clock } = make({ x: ['1', '2', '3'] }, { x: { kind: 'courtesy', cooldown: 0 } }, -1);
    const seq: string[] = [];
    for (let i = 0; i < 30; i++) { seq.push(p.say('x')!); clock.t += 1; }
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it('avoids lines said recently in other categories', () => {
    const { p, clock } = make({ x: ['same', 'other'], y: ['same', 'different'] }, { x: { kind: 'courtesy', cooldown: 0 }, y: { kind: 'courtesy', cooldown: 0 } }, 0);
    const first = p.say('x')!;
    clock.t += 1;
    const second = p.say('y')!;
    expect(second).not.toBe(first);
  });

  it('quiet mode silences everything except essential lines', () => {
    const { p, clock } = make(all, cfg);
    p.setLevel('quiet');
    expect(p.say('a')).toBeNull();
    expect(p.say('s')).toBeNull();
    expect(p.say('c')).toBeNull();
    clock.t += 100;
    expect(p.say('e')).not.toBeNull();
  });

  it('force bypasses quiet mode, cooldown, spacing and chance', () => {
    const { p } = make(all, cfg, 0.99);
    p.setLevel('quiet');
    expect(p.say('a', { force: true })).not.toBeNull();
    expect(p.say('a', { force: true })).not.toBeNull();
  });

  it('chance scales with the level (rng decides)', () => {
    // rng = 0.5: reactive chance is 1*0.65 at normal (speaks), 0.3 at low (silent), 1 at high (speaks)
    for (const [level, speaks] of [['low', false], ['normal', true], ['high', true]] as const) {
      const { p } = make(all, cfg, 0.5);
      p.setLevel(level);
      expect(p.say('b') !== null, level).toBe(speaks);
    }
  });

  it('spontaneous gap grows with chattiness: high 30s, normal 75s, low 180s', () => {
    const gapFor = (level: 'low' | 'normal' | 'high') => {
      const { p, clock } = make(all, cfg, 0);
      p.setLevel(level);
      p.say('s');
      const t0 = clock.t;
      for (let i = 1; i < 400; i++) { clock.t = t0 + i; if (p.say('s')) return i; }
      return Infinity;
    };
    expect(gapFor('high')).toBeGreaterThanOrEqual(30);
    expect(gapFor('high')).toBeLessThan(gapFor('normal'));
    expect(gapFor('normal')).toBeLessThan(gapFor('low'));
  });

  it('backs off when spontaneous lines are ignored, and resets on interaction', () => {
    const { p, clock } = make(all, cfg, 0);
    p.say('s'); // backoff 1 -> 1.5
    clock.t += 75;
    expect(p.say('s')).toBeNull(); // normal gap 75 * 1.5 = 112
    clock.t += 40;
    expect(p.say('s')).not.toBeNull(); // backoff -> 2.25
    clock.t += 120;
    expect(p.say('s')).toBeNull(); // needs 168
    p.noteInteraction();
    expect(p.say('s')).not.toBeNull();
  });

  it('prefers time-of-day lines for the current time and ignores other times', () => {
    const tod: LineSet = { start: ['any', { t: 'morning one', tod: 'morning' }, { t: 'night one', tod: 'night' }] };
    const c = { start: { kind: 'courtesy' as const, cooldown: 0 } };
    const { p } = make(tod, c, 0);
    expect(p.say('start', { hour: 8 })).toBe('morning one');
    expect(['any', 'night one']).toContain(p.say('start', { hour: 23 }));
    for (let i = 0; i < 6; i++) expect(p.say('start', { hour: 8 })).not.toBe('night one');
  });

  it('maps hours to times of day', () => {
    expect([5, 11, 12, 16, 17, 21, 22, 0, 4].map(timeOfDay)).toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night', 'night']);
  });
});
