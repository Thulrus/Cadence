import type { ScriptIndex } from '../text/types';

/**
 * The script's spoken display words (words that produced match tokens), in order. Timed
 * scrolling and pace count these, not tokens, so "1,500" (four tokens) counts as one word and
 * headings / [directions] count as nothing.
 */
export class SpokenWords {
  /** tokenStart / tokenEnd of each spoken word, ascending. */
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  readonly tokenCount: number;

  constructor(index: ScriptIndex) {
    for (const w of index.script.words) {
      if (w.tokenEnd <= w.tokenStart) continue;
      this.starts.push(w.tokenStart);
      this.ends.push(w.tokenEnd);
    }
    this.tokenCount = index.tokens.length;
  }

  get count(): number {
    return this.starts.length;
  }

  /** Number of spoken words fully before position `p` (a word `p` is inside isn't counted). */
  spokenBefore(p: number): number {
    let lo = 0;
    let hi = this.ends.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ends[mid]! <= p) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Position at the start of spoken word `k` (clamped); `count` or more = end of script. */
  positionAt(k: number): number {
    if (k <= 0) return this.starts.length ? 0 : this.tokenCount;
    return k < this.starts.length ? this.starts[k]! : this.tokenCount;
  }

  /** Fraction of spoken words before `p`, 0..1 (0 for a script with no spoken words). */
  fraction(p: number): number {
    return this.count ? this.spokenBefore(p) / this.count : 0;
  }
}
