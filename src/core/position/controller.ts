import { Emitter } from '../emitter';
import type { ScriptIndex } from '../text/types';
import type { PositionChange, PositionSource } from '../types';

export const POSITION_CONFIG = {
  /** A move of at least this many tokens counts as a "large jump" that undo() can revert. */
  undoJumpTokens: 12,
} as const;

export type PositionConfig = typeof POSITION_CONFIG;

export interface PositionControllerEvents extends Record<string, unknown> {
  change: PositionChange;
  /** Auto-follow attached (true) or detached (false). */
  follow: { following: boolean };
}

/**
 * Returns the token positions at which visual lines start, ascending. Supplied by the renderer
 * (lines depend on layout). Lines without spoken tokens are omitted.
 */
export type LineStartsProvider = () => readonly number[];

/**
 * Token positions where each paragraph (or heading) with spoken tokens starts, ascending.
 * Pure; derived from `blocks`.
 */
export function paragraphStarts(index: ScriptIndex): number[] {
  const { blocks, words } = index.script;
  const starts: number[] = [];
  for (const b of blocks) {
    for (let w = b.wordStart; w < b.wordEnd; w++) {
      const word = words[w]!;
      if (word.tokenEnd > word.tokenStart) {
        starts.push(word.tokenStart);
        break;
      }
    }
  }
  return starts;
}

/**
 * Move `n` boundaries from `position` within ascending `starts`. The current boundary is the
 * last start ≤ position; n = -1 from mid-unit goes to the previous unit's start (not the
 * current one), matching how readers expect "back one line" to behave. Result is clamped to
 * `[0, length]`; moving past the last start goes to `length` (end).
 */
export function stepBoundary(
  starts: readonly number[],
  position: number,
  n: number,
  length: number,
): number {
  if (starts.length === 0 || n === 0) return position;
  let cur = -1;
  for (let i = 0; i < starts.length && starts[i]! <= position; i++) cur = i;
  const target = cur + n;
  if (target < 0) return 0;
  if (target >= starts.length) return length;
  return starts[target]!;
}

/**
 * Single source of truth for the reading position (index of the next expected token, see
 * ARCHITECTURE "Position"). Invariant: `0 ≤ position ≤ tokens.length`. Also owns whether the
 * display auto-follows the position. Pure: no DOM, no clock.
 */
export class PositionController {
  readonly events = new Emitter<PositionControllerEvents>();
  private pos = 0;
  private follow = true;
  private undoTarget: number | null = null;
  private lineStarts: LineStartsProvider | null = null;
  private readonly paragraphs: number[];

  constructor(
    private readonly index: ScriptIndex,
    private readonly config: PositionConfig = POSITION_CONFIG,
  ) {
    this.paragraphs = paragraphStarts(index);
  }

  get position(): number {
    return this.pos;
  }

  get length(): number {
    return this.index.tokens.length;
  }

  get following(): boolean {
    return this.follow;
  }

  /** True when undo() would do something. */
  get canUndo(): boolean {
    return this.undoTarget !== null;
  }

  /** Inject the renderer's visual line boundaries (used by nudgeLines). */
  setLineStarts(provider: LineStartsProvider | null): void {
    this.lineStarts = provider;
  }

  /** Set the position (clamped, floored). Emits `change` only if it actually changed. */
  set(p: number, source: PositionSource): void {
    const next = Math.min(Math.max(0, Math.floor(Number.isFinite(p) ? p : 0)), this.length);
    const previous = this.pos;
    if (next === previous) return;
    if (source !== 'undo' && Math.abs(next - previous) >= this.config.undoJumpTokens) {
      this.undoTarget = previous;
    }
    this.pos = next;
    this.events.emit('change', { position: next, previous, source });
  }

  /** Move by `n` visual lines (falls back to paragraphs when no line provider is set). */
  nudgeLines(n: number): void {
    const starts = this.lineStarts?.() ?? this.paragraphs;
    this.set(stepBoundary(starts, this.pos, n, this.length), 'manual');
  }

  /** Move by `n` paragraphs/headings. */
  nudgeParagraphs(n: number): void {
    this.set(stepBoundary(this.paragraphs, this.pos, n, this.length), 'manual');
  }

  /** Back to the start; re-attaches following. */
  reset(): void {
    this.set(0, 'reset');
    this.attach();
  }

  /**
   * One-level undo: return to where we were before the last large jump. Undoing again swaps
   * back (so a mistaken undo is recoverable). No-op when there is nothing to undo.
   */
  undo(): void {
    if (this.undoTarget === null) return;
    const target = this.undoTarget;
    this.undoTarget = this.pos;
    this.set(target, 'undo');
  }

  /** Stop auto-following (user is scrolling by hand). */
  detach(): void {
    if (!this.follow) return;
    this.follow = false;
    this.events.emit('follow', { following: false });
  }

  /** Resume auto-following. */
  attach(): void {
    if (this.follow) return;
    this.follow = true;
    this.events.emit('follow', { following: true });
  }
}
