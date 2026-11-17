/**
 * Run state for the prompter (SPEC §5.4, §9): the mode (Voice / Timed / Manual), whether the
 * run is active, and the elapsed clock. No DOM; the view supplies one driver per mode.
 *
 *  - Timed and Manual become active as soon as their driver starts.
 *  - Voice becomes active only when the engine says so (`driverActive('voice', …)` from the
 *    status badge), since starting can be refused (privacy notice cancelled, mic denied).
 *  - Switching mode while active stops the old driver and starts the new one; while paused it
 *    only changes the mode. Position is never touched here (it lives in PositionController).
 *  - The clock runs only while active (pace.ts: paused time is excluded).
 */
import { Emitter } from '../core/emitter';
import { RunClock } from '../core/timing/pace';
import type { RunMode } from '../storage/settings';

export interface RunDriver {
  start(): void;
  stop(): void;
  /** Activation is reported later via `driverActive` (Voice). */
  readonly deferred?: boolean;
}

export interface RunState {
  mode: RunMode;
  active: boolean;
}

export interface RunEvents extends Record<string, unknown> {
  change: RunState;
}

export class RunController {
  readonly events = new Emitter<RunEvents>();
  readonly clock = new RunClock();
  private current: RunMode;
  private on = false;
  private everStarted = false;

  constructor(
    mode: RunMode,
    private readonly drivers: Readonly<Record<RunMode, RunDriver>>,
    private readonly now: () => number,
  ) {
    this.current = mode;
  }

  get mode(): RunMode {
    return this.current;
  }

  get active(): boolean {
    return this.on;
  }

  /** The run has been active at least once (the timer has something to show). */
  get started(): boolean {
    return this.everStarted;
  }

  elapsed(): number {
    return this.clock.elapsed(this.now());
  }

  toggle(): void {
    if (this.on) this.pause();
    else this.resume();
  }

  /** Start the current mode's driver. Must run inside a user gesture (Web Speech). */
  resume(): void {
    const d = this.drivers[this.current];
    d.start();
    if (!d.deferred) this.setActive(true);
  }

  pause(): void {
    this.drivers[this.current].stop();
    this.setActive(false);
  }

  setMode(mode: RunMode): void {
    if (mode === this.current) return;
    const wasActive = this.on;
    this.drivers[this.current].stop();
    this.current = mode;
    this.on = false; // re-established by resume() below, without pausing the clock in between
    if (wasActive) this.resume();
    if (!this.on) this.clock.pause(this.now());
    this.emit();
  }

  /** A deferred driver became active / inactive (engine status). Ignored for other modes. */
  driverActive(mode: RunMode, active: boolean): void {
    if (mode === this.current) this.setActive(active);
  }

  resetClock(): void {
    this.clock.reset(this.now());
    this.emit();
  }

  private setActive(active: boolean): void {
    if (active === this.on) return;
    this.on = active;
    if (active) {
      this.everStarted = true;
      this.clock.start(this.now());
    } else {
      this.clock.pause(this.now());
    }
    this.emit();
  }

  private emit(): void {
    this.events.emit('change', { mode: this.current, active: this.on });
  }
}

export const CONTROLS_CONFIG = {
  /** A tap within this fraction of the view height from the top or bottom edge counts as "near an edge". */
  edgeFraction: 0.15,
  /** …but at least this many px (small phones). */
  edgeMinPx: 64,
} as const;

/** True if a tap at `y` (px from the top of a view `height` px tall) is near the top/bottom edge. */
export function nearEdge(y: number, height: number, cfg = CONTROLS_CONFIG): boolean {
  const zone = Math.max(cfg.edgeMinPx, height * cfg.edgeFraction);
  return y <= zone || y >= height - zone;
}

/** Can the controls auto-hide right now? */
export function canAutoHide(s: {
  active: boolean;
  delayMs: number;
  overlayOpen: boolean;
  pointerInControls: boolean;
}): boolean {
  return s.active && s.delayMs > 0 && !s.overlayOpen && !s.pointerInControls;
}
