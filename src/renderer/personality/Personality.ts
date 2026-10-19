// Pure logic (no DOM/Pixi): decides whether Clippy speaks and what it says.

export type Level = 'quiet' | 'low' | 'normal' | 'high';
export type Kind = 'essential' | 'courtesy' | 'reactive' | 'spontaneous';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface CategoryConfig {
  kind: Kind;
  cooldown: number; // seconds between lines of this category
  chance?: number; // 0..1 before the level multiplier, default 1
}

export type Line = string | { t: string; tod?: TimeOfDay };
export type LineSet = Record<string, Line[]>;

export interface SayOpts {
  hour?: number; // 0-23, enables time-of-day lines
  force?: boolean; // explicit user request: ignore cooldowns, spacing, chance and quiet mode
}

export interface Options {
  now?: () => number; // seconds
  rng?: () => number;
  historySize?: number;
}

interface LevelRule {
  chance: Record<Kind, number>; // multiplier on the category chance
  gap: { reactive: number; spontaneous: number }; // min seconds since ANY line before another of that kind
  cooldownScale: number;
}

export const LEVELS: Record<Level, LevelRule> = {
  quiet: { chance: { essential: 1, courtesy: 0, reactive: 0, spontaneous: 0 }, gap: { reactive: Infinity, spontaneous: Infinity }, cooldownScale: 1 },
  low: { chance: { essential: 1, courtesy: 1, reactive: 0.3, spontaneous: 0.6 }, gap: { reactive: 8, spontaneous: 180 }, cooldownScale: 1.5 },
  normal: { chance: { essential: 1, courtesy: 1, reactive: 0.65, spontaneous: 1 }, gap: { reactive: 4, spontaneous: 75 }, cooldownScale: 1 },
  high: { chance: { essential: 1, courtesy: 1, reactive: 1, spontaneous: 1 }, gap: { reactive: 2, spontaneous: 30 }, cooldownScale: 0.5 },
};

export const timeOfDay = (hour: number): TimeOfDay =>
  hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night';

const BACKOFF_STEP = 1.5;
const BACKOFF_MAX = 4;

export class Personality {
  level: Level = 'normal';
  private lastByCategory = new Map<string, number>();
  private lastAny = -Infinity;
  private bags = new Map<string, Line[]>();
  private recent: string[] = [];
  private backoff = 1;
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly historySize: number;

  constructor(
    private readonly lines: LineSet,
    private readonly configs: Record<string, CategoryConfig>,
    opts: Options = {},
  ) {
    this.now = opts.now ?? (() => performance.now() / 1000);
    this.rng = opts.rng ?? Math.random;
    this.historySize = opts.historySize ?? 24;
  }

  setLevel(level: Level) {
    this.level = level;
  }

  /** The user did something (click, hover, drag...). Unignored, so spontaneous chatter stops backing off. */
  noteInteraction() {
    this.backoff = 1;
  }

  /** Returns the line to speak, or null if Clippy should stay quiet right now. */
  say(category: string, opts: SayOpts = {}): string | null {
    const cfg = this.configs[category];
    const pool = this.lines[category];
    if (!cfg || !pool?.length) return null;

    const now = this.now();
    const rule = LEVELS[this.level];

    if (!opts.force) {
      const since = now - (this.lastByCategory.get(category) ?? -Infinity);
      if (since < cfg.cooldown * rule.cooldownScale) return null;

      if (cfg.kind === 'reactive' || cfg.kind === 'spontaneous') {
        const gap = rule.gap[cfg.kind] * (cfg.kind === 'spontaneous' ? this.backoff : 1);
        if (now - this.lastAny < gap) return null;
      }

      const chance = (cfg.chance ?? 1) * rule.chance[cfg.kind];
      if (chance <= 0 || (chance < 1 && this.rng() >= chance)) return null;
    }

    const text = this.pick(category, pool, opts.hour);
    this.lastByCategory.set(category, now);
    this.lastAny = now;
    this.remember(text);
    if (cfg.kind === 'spontaneous') this.backoff = Math.min(BACKOFF_MAX, this.backoff * BACKOFF_STEP);
    return text;
  }

  /** Shuffle bag per category: every line is used once before any repeats, and nothing said recently is reused if avoidable. */
  private pick(category: string, pool: Line[], hour?: number): string {
    const tod = hour === undefined ? undefined : timeOfDay(hour);
    const fits = (l: Line) => typeof l === 'string' || !l.tod || tod === undefined || l.tod === tod;
    const text = (l: Line) => (typeof l === 'string' ? l : l.t);

    let bag = this.bags.get(category) ?? [];
    let candidates = bag.filter(fits);
    if (!candidates.length) {
      bag = [...pool];
      candidates = bag.filter(fits);
    }
    // Time-of-day lines are the point of tagging them, so prefer them when one fits.
    const tagged = candidates.filter((l) => typeof l !== 'string' && l.tod);
    if (tagged.length) candidates = tagged;

    // Least recently said wins (never said = best), so a refilled bag can't open with the line just used.
    const age = (l: Line) => this.recent.lastIndexOf(text(l));
    const oldest = Math.min(...candidates.map(age));
    const from = candidates.filter((l) => age(l) === oldest);
    const chosen = from[Math.floor(this.rng() * from.length)];
    this.bags.set(category, bag.filter((l) => l !== chosen));
    return text(chosen);
  }

  private remember(text: string) {
    this.recent.push(text);
    if (this.recent.length > this.historySize) this.recent.shift();
  }
}
