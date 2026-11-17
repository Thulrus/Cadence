import type { ScriptIndex } from '../core/text/types';

/**
 * Display cursor for a position: words with index < cursor are "spoken", the word at `cursor`
 * is "current" (if it exists). At the end, cursor = words.length (everything spoken). A script
 * with no spoken tokens has cursor 0 and no current word.
 */
export function cursorForPosition(index: ScriptIndex, p: number): number {
  const { tokens, script } = index;
  if (tokens.length === 0) return 0;
  if (p >= tokens.length) return script.words.length;
  return tokens[Math.max(0, Math.floor(p))]!.word;
}

export interface SpokenDelta {
  /** [start, end) of words that become spoken. Empty when start === end. */
  add: [number, number];
  /** [start, end) of words that stop being spoken. */
  remove: [number, number];
}

/** Which words change spoken state when the cursor moves `from` → `to`. Touches only those. */
export function spokenDelta(from: number, to: number): SpokenDelta {
  return to >= from ? { add: [from, to], remove: [to, to] } : { add: [to, to], remove: [to, from] };
}
