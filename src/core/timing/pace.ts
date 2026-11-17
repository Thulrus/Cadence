/**
 * Elapsed-time and pace math for the run timer (SPEC §9 last bullet). Pure; time is injected.
 *
 * Decision: elapsed time EXCLUDES paused time. The clock runs only while a run is active
 * (listening, timed scrolling, or the manual-mode timer), so pausing to deal with an
 * interruption doesn't count against the talk.
 */

export const PACE_CONFIG = {
  /** Within ± this many ms of schedule counts as "on pace"… */
  toleranceMs: 15_000,
  /** …or within this fraction of the target, whichever is larger. */
  toleranceFraction: 0.03,
  /** No pace verdict until this much of the script is spoken… */
  minFraction: 0.02,
  /** …and this much time has passed (early estimates swing wildly). */
  minElapsedMs: 10_000,
} as const;

export type PaceConfig = typeof PACE_CONFIG;

export type PaceState = 'early' | 'on-pace' | 'behind' | 'ahead';

export interface Pace {
  state: PaceState;
  /**
   * Schedule delta: elapsed − fraction × target. Positive = behind schedule (running long),
   * negative = ahead. 0 while `early`.
   */
  deltaMs: number;
  /** Projected total duration at the pace so far (elapsed / fraction); null while `early`. */
  projectedMs: number | null;
  /** "on pace", "1:20 behind", "0:45 ahead", or "" while early. */
  label: string;
}

/**
 * Pace against a target duration. `fraction` = share of the script spoken (by display words,
 * see SpokenWords.fraction), 0..1.
 */
export function pace(
  elapsedMs: number,
  fraction: number,
  targetMs: number,
  config: PaceConfig = PACE_CONFIG,
): Pace {
  const f = Math.min(Math.max(fraction, 0), 1);
  if (targetMs <= 0 || f < config.minFraction || elapsedMs < config.minElapsedMs) {
    return { state: 'early', deltaMs: 0, projectedMs: null, label: '' };
  }
  const deltaMs = elapsedMs - f * targetMs;
  const tolerance = Math.max(config.toleranceMs, config.toleranceFraction * targetMs);
  const projectedMs = elapsedMs / f;
  if (Math.abs(deltaMs) <= tolerance) {
    return { state: 'on-pace', deltaMs, projectedMs, label: 'on pace' };
  }
  const state = deltaMs > 0 ? 'behind' : 'ahead';
  return { state, deltaMs, projectedMs, label: `${formatClock(Math.abs(deltaMs))} ${state}` };
}

/** "m:ss" (or "h:mm:ss" from an hour), rounding down to whole seconds. Negative → 0:00. */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** A stopwatch that only counts while running. Time is injected. */
export class RunClock {
  private accumulated = 0;
  private since: number | null = null;

  get running(): boolean {
    return this.since !== null;
  }

  start(now: number): void {
    if (this.since === null) this.since = now;
  }

  pause(now: number): void {
    if (this.since === null) return;
    this.accumulated += Math.max(0, now - this.since);
    this.since = null;
  }

  /** Back to 0:00; keeps running if it was. */
  reset(now: number): void {
    this.accumulated = 0;
    if (this.since !== null) this.since = now;
  }

  elapsed(now: number): number {
    return this.accumulated + (this.since === null ? 0 : Math.max(0, now - this.since));
  }
}
