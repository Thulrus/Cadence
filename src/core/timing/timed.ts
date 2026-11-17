import type { SpokenWords } from './words';

export const TIMED_CONFIG = {
  /**
   * Longest gap between ticks that counts in full. A longer gap (tab in the background, device
   * asleep) counts as this much, so coming back never leaps ahead.
   */
  maxTickMs: 500,
  /** Lowest accepted WPM (avoids divide-by-zero / frozen scroll). */
  minWpm: 1,
} as const;

export type TimedConfig = typeof TIMED_CONFIG;

const MS_PER_MINUTE = 60_000;
/** Float slack so 0.2 + 0.2 + … reaching a whole word counts as that word. */
const WORD_EPSILON = 1e-9;

/**
 * Timed-scroll fallback (SPEC §5.4): advances the position at a constant words-per-minute,
 * counting display words (see SpokenWords). Pure; time is injected via `start(now)` / `tick(now)`.
 *
 * Invariants: `tick` never moves backward; `setWpm` keeps the position; `setPosition` (a tap,
 * nudge, or voice move) restarts counting from there.
 */
export class TimedScroller {
  private cursor = 0; // fractional spoken words elapsed
  private pos = 0;
  private last: number | null = null; // time of the previous tick while running
  private rate: number;

  constructor(
    private readonly words: SpokenWords,
    wpm: number,
    private readonly config: TimedConfig = TIMED_CONFIG,
  ) {
    this.rate = this.clampWpm(wpm);
  }

  get running(): boolean {
    return this.last !== null;
  }

  get position(): number {
    return this.pos;
  }

  get wpm(): number {
    return this.rate;
  }

  /** True when the position has reached the end of the script. */
  get finished(): boolean {
    return this.pos >= this.words.tokenCount;
  }

  start(now: number): void {
    if (this.last === null) this.last = now;
  }

  pause(): void {
    this.last = null;
  }

  /** Change speed; the position and the progress into the current word are kept. */
  setWpm(wpm: number): void {
    this.rate = this.clampWpm(wpm);
  }

  /** Jump to `p` (from elsewhere: tap, keys, voice). Counting resumes from the word at `p`. */
  setPosition(p: number): void {
    this.pos = Math.min(Math.max(0, p), this.words.tokenCount);
    this.cursor = this.words.spokenBefore(this.pos);
  }

  /** Advance to `now`. Returns the new position if it moved forward, else null. */
  tick(now: number): number | null {
    if (this.last === null) return null;
    const dt = Math.min(Math.max(0, now - this.last), this.config.maxTickMs);
    this.last = now;
    this.cursor += (dt * this.rate) / MS_PER_MINUTE;
    const next = this.words.positionAt(Math.floor(this.cursor + WORD_EPSILON));
    if (next <= this.pos) return null;
    this.pos = next;
    return next;
  }

  private clampWpm(wpm: number): number {
    return Number.isFinite(wpm) ? Math.max(this.config.minWpm, wpm) : this.config.minWpm;
  }
}
