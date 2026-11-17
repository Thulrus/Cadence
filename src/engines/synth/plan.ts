/**
 * Turn a script into the sequence of things a speaker says (one `SpokenItem` per spoken display
 * word), each tagged with the ground-truth position after it is said. Noise (noise.ts) then
 * edits this plan; speak.ts gives it timing and turns it into recognizer events.
 */
import type { ScriptIndex } from '../../core/text/types';

export type PauseKind = 'none' | 'sentence' | 'paragraph' | 'direction';
export type ItemKind = 'script' | 'adlib' | 'reread';
/** A place where the speaker leaves the script's natural order (used for recovery metrics). */
export type Disruption = 'skip' | 'adlib' | 'reread';

export interface SpokenItem {
  /** Raw words the recognizer reports for this item; empty = said but not recognized. */
  words: string[];
  /** Ground-truth position (next expected token) once this item has been said. */
  truth: number;
  kind: ItemKind;
  /** Pause the speaker takes after this item. */
  pause: PauseKind;
  /** Sentence and paragraph (block) the item came from; -1 for ad-libs. */
  sentence: number;
  paragraph: number;
  /** First item after a disruption. */
  mark?: Disruption;
}

const SENTENCE_END = /[.?!]["”’')\]]*$/;
const EDGE_QUOTES = /^[“”"‘’'([]+|[“”"‘’')\]]+$/g;

/** What a recognizer would print for a script word: no quotes, no trailing commas or periods. */
export function heardForm(text: string): string {
  let s = text.replace(EDGE_QUOTES, '').replace(/[,;:!?]+$/, '');
  // Keep "a.m." / "p.m." intact; drop a sentence-final period otherwise.
  if (s.endsWith('.') && !/\..+\.$/.test(s)) s = s.slice(0, -1);
  return s.replace(EDGE_QUOTES, '');
}

/** The script read straight through, with no noise. */
export function planSpeech(index: ScriptIndex): SpokenItem[] {
  const words = index.script.words;
  const items: SpokenItem[] = [];
  let sentence = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const last = items[items.length - 1];
    if (w.kind === 'direction') {
      if (last) last.pause = 'direction';
      continue;
    }
    if (w.kind !== 'speech' || w.tokenEnd <= w.tokenStart) continue;
    if (last && last.paragraph !== w.block && last.pause !== 'direction') {
      last.pause = 'paragraph';
    }
    if (last && last.pause !== 'none') sentence++;
    const heard = heardForm(w.text);
    items.push({
      words: heard ? [heard] : [],
      truth: w.tokenEnd,
      kind: 'script',
      pause: SENTENCE_END.test(w.text) ? 'sentence' : 'none',
      sentence,
      paragraph: w.block,
    });
  }
  const tail = items[items.length - 1];
  if (tail) tail.pause = 'paragraph';
  return items;
}
