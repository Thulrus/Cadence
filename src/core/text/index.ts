import { normalizeWords } from './normalize';
import type { DisplayWord, MatchToken, ParsedScript, ScriptIndex } from './types';

/** Placeholder anchor weight until chunk 08 computes IDF weights. */
export const DEFAULT_TOKEN_WEIGHT = 1;

/**
 * Build match tokens from `speech` words only and fill every word's [tokenStart, tokenEnd).
 * Consecutive speech words in a block are normalized together (so multi-word rules like
 * scripture references can see the run). Words that produce no tokens, and all non-speech
 * words, get an empty range at the position of the next token.
 * Mutates and returns `parsed.words` ranges inside the returned index.
 */
export function buildScriptIndex(parsed: ParsedScript): ScriptIndex {
  const tokens: MatchToken[] = [];
  const words = parsed.words;
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    if (w.kind !== 'speech') {
      setRange(w, tokens.length, tokens.length);
      i++;
      continue;
    }
    let end = i;
    while (end < words.length && isSameRun(words[end]!, w)) end++;
    indexRun(words, i, end, tokens);
    i = end;
  }
  return { script: parsed, tokens };
}

function isSameRun(w: DisplayWord, first: DisplayWord): boolean {
  return w.kind === 'speech' && w.block === first.block;
}

function indexRun(words: DisplayWord[], start: number, end: number, tokens: MatchToken[]) {
  const segments = normalizeWords(words.slice(start, end).map((w) => w.text));
  let s = 0;
  for (let wi = start; wi < end; wi++) {
    const from = tokens.length;
    while (s < segments.length && segments[s]!.src === wi - start) {
      tokens.push({ norm: segments[s]!.text, word: wi, weight: DEFAULT_TOKEN_WEIGHT });
      s++;
    }
    setRange(words[wi]!, from, tokens.length);
  }
}

function setRange(w: DisplayWord, start: number, end: number) {
  w.tokenStart = start;
  w.tokenEnd = end;
}

/**
 * Display word for position `p` (index of the next expected token). Positions past the end
 * map to the last token's word. Returns -1 if the script has no tokens.
 */
export function wordForPosition(index: ScriptIndex, p: number): number {
  const { tokens } = index;
  if (tokens.length === 0) return -1;
  const clamped = Math.min(Math.max(0, Math.floor(p)), tokens.length - 1);
  return tokens[clamped]!.word;
}

/**
 * Position for a display word: its first token, or (if it has none) the first token of the
 * next speech word. Returns `tokens.length` when no speech follows.
 */
export function positionForWord(index: ScriptIndex, wordIdx: number): number {
  const w = index.script.words[wordIdx];
  if (!w) return wordIdx < 0 ? 0 : index.tokens.length;
  return w.tokenStart;
}
