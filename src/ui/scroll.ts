/**
 * Prompter scrolling. Pure math (easeStep, planScroll, classifyGesture) is unit-tested; the
 * ScrollController class is a thin rAF loop around it. Scrolling is functional, not decorative,
 * so it is intentionally NOT disabled by prefers-reduced-motion (SPEC §8).
 */

export const SCROLL_CONFIG = {
  /** Exponential ease time constant: ~63% of the remaining distance is covered per tau. */
  easeTauMs: 160,
  /** Snap to the target and stop the loop when closer than this. */
  settlePx: 0.5,
  /** Clamp frame delta so a backgrounded tab doesn't teleport on return. */
  maxFrameMs: 64,
  /** Lines whose tops differ by less than this are the same line (deadband). */
  lineEpsilonPx: 2,
} as const;

export type ScrollConfig = typeof SCROLL_CONFIG;

export const GESTURE_CONFIG = {
  /** A pointer that moved more than this is a drag, never a tap. */
  tapMaxMovePx: 10,
  /** A press longer than this is not a tap (lets slow, deliberate drags through). */
  tapMaxMs: 500,
} as const;

export type GestureConfig = typeof GESTURE_CONFIG;

/**
 * One frame of critically-damped-like exponential easing from `current` toward `target`.
 * Never overshoots; snaps when within `settlePx`.
 */
export function easeStep(
  current: number,
  target: number,
  dtMs: number,
  cfg: ScrollConfig = SCROLL_CONFIG,
): number {
  const diff = target - current;
  if (Math.abs(diff) <= cfg.settlePx) return target;
  const dt = Math.min(Math.max(dtMs, 0), cfg.maxFrameMs);
  const next = current + diff * (1 - Math.exp(-dt / cfg.easeTauMs));
  return Math.abs(target - next) <= cfg.settlePx ? target : next;
}

export interface ScrollPlan {
  /** Desired scrollTop. */
  target: number;
  /** Top (px, content coords) of the line the target was computed for. */
  lineTop: number;
}

export interface LineGeometry {
  /** Top of the current word's line in scroll-content coordinates. */
  top: number;
  height: number;
}

export interface Viewport {
  /** Visible height of the scroller. */
  height: number;
  /** Reading line, percent from the top of the viewport. */
  readingPct: number;
  /** scrollHeight - clientHeight. */
  maxScroll: number;
}

export interface PlanOptions {
  /** The position genuinely moved backward (PositionChange.previous > position). */
  backward: boolean;
  /** Recompute regardless of deadband/direction (initial, resize, re-attach, settings). */
  force: boolean;
}

/**
 * Where to scroll so the current line is centred on the reading line.
 * - Deadband: if the line hasn't changed, keep the previous plan (moves by line, not word).
 * - Never plans a backward scroll unless `backward` or `force`.
 */
export function planScroll(
  prev: ScrollPlan | null,
  line: LineGeometry,
  vp: Viewport,
  opts: PlanOptions,
  cfg: ScrollConfig = SCROLL_CONFIG,
): ScrollPlan {
  const desired = Math.min(
    Math.max(0, line.top + line.height / 2 - (vp.height * vp.readingPct) / 100),
    Math.max(0, vp.maxScroll),
  );
  if (opts.force || !prev) return { target: desired, lineTop: line.top };
  if (Math.abs(line.top - prev.lineTop) <= cfg.lineEpsilonPx) return prev;
  if (!opts.backward && desired < prev.target) return { target: prev.target, lineTop: line.top };
  return { target: desired, lineTop: line.top };
}

export type Gesture = 'tap' | 'drag' | 'none';

/** Classify a finished pointer press. `moved` = max distance from the start point. */
export function classifyGesture(
  movedPx: number,
  durationMs: number,
  cfg: GestureConfig = GESTURE_CONFIG,
): Gesture {
  if (movedPx > cfg.tapMaxMovePx) return 'drag';
  if (durationMs > cfg.tapMaxMs) return 'none';
  return 'tap';
}

/**
 * Eases an element's scrollTop toward a target with a rAF loop that sleeps when settled.
 * Tracks its own float position so sub-pixel progress isn't lost to scrollTop rounding.
 */
export class ScrollController {
  private target = 0;
  private current: number;
  private frame = 0;
  private lastTs: number | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly cfg: ScrollConfig = SCROLL_CONFIG,
  ) {
    this.current = el.scrollTop;
  }

  /** Ease toward `px`. */
  easeTo(px: number): void {
    this.target = px;
    if (!this.frame) {
      this.current = this.el.scrollTop; // pick up any manual scroll since we last ran
      this.lastTs = null;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  /** Jump immediately (no animation). */
  jumpTo(px: number): void {
    this.stop();
    this.target = this.current = px;
    this.el.scrollTop = px;
  }

  /** Stop animating (e.g. the user grabbed the text). */
  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  get animating(): boolean {
    return this.frame !== 0;
  }

  private readonly tick = (ts: number): void => {
    const dt = this.lastTs === null ? 16 : ts - this.lastTs;
    this.lastTs = ts;
    this.current = easeStep(this.current, this.target, dt, this.cfg);
    this.el.scrollTop = this.current;
    this.frame = this.current === this.target ? 0 : requestAnimationFrame(this.tick);
  };
}
