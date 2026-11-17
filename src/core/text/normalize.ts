/**
 * Text normalizer, applied identically to script text and recognized speech.
 *
 * Pipeline (in order):
 *  1. prepare: lowercase, curly quotes/apostrophes → straight.
 *  2. SEQUENCE_RULES: rules over the whole word sequence (hook for chunk 07: numbers,
 *     scripture references like "John 3:16", which span several raw words).
 *  3. split on hyphens / en / em dashes.
 *  4. contractions (CONTRACTIONS table + suffix rules), then strip remaining punctuation.
 *
 * Every output token carries `src`, the index of the raw word that produced it, so the
 * script index can map tokens back to display words exactly.
 */

/** A piece of text attributed to a raw input word. */
export interface Segment {
  text: string;
  /** Index of the raw input word this came from. */
  src: number;
}

/**
 * A rule over the whole segment sequence. Invariant: output `src` values must be
 * non-decreasing and each must come from the input. Rules may emit final tokens
 * (e.g. "three", "sixteen"); later stages leave plain lowercase words unchanged.
 */
export type SequenceRule = (segments: Segment[]) => Segment[];

/** Hook: chunk 07 inserts number and scripture expansion here. Order matters. */
export const SEQUENCE_RULES: SequenceRule[] = [];

/**
 * Whole-word contractions that the suffix rules would get wrong. Keys are lowercase
 * with straight apostrophes.
 */
export const CONTRACTIONS: Readonly<Record<string, readonly string[]>> = {
  "won't": ['will', 'not'],
  "can't": ['can', 'not'],
  "shan't": ['shall', 'not'],
  "ain't": ['is', 'not'],
  "let's": ['let', 'us'],
  "y'all": ['you', 'all'],
};

/**
 * Suffix contractions: `n't`→not, `'re`→are, `'ve`→have, `'d`→would, `'ll`→will, `'m`→am.
 * (`'d` is had/would-ambiguous; we always pick "would", consistently on both sides.)
 */
export const CONTRACTION_SUFFIXES: readonly [suffix: string, expansion: string][] = [
  ["n't", 'not'],
  ["'re", 'are'],
  ["'ve", 'have'],
  ["'d", 'would'],
  ["'ll", 'will'],
  ["'m", 'am'],
];

/**
 * Words whose `'s` means "is" (it's → it is). Any other `'s` is treated as possessive
 * and just loses its apostrophe (john's → johns). is/has ambiguity is resolved as "is".
 */
export const IS_CONTRACTION_STEMS: ReadonlySet<string> = new Set([
  'it',
  'he',
  'she',
  'that',
  'there',
  'here',
  'what',
  'where',
  'who',
  'how',
  'when',
  'why',
]);

const CURLY_APOSTROPHES = /[‘’‛′ʼ]/g;
const CURLY_DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[-‐‑‒–—―−]+/;
const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const NON_WORD = /[^\p{L}\p{N}]+/gu;

function prepare(raw: string): string {
  return raw.toLowerCase().replace(CURLY_APOSTROPHES, "'").replace(CURLY_DOUBLE_QUOTES, '"');
}

/** Expand one dash-free piece into tokens. */
function expandPiece(piece: string): string[] {
  const core = piece.replace(EDGE_PUNCT, '');
  if (!core) return [];
  if (core.includes("'")) {
    const whole = CONTRACTIONS[core];
    if (whole) return [...whole];
    for (const [suffix, expansion] of CONTRACTION_SUFFIXES) {
      if (core.endsWith(suffix) && core.length > suffix.length) {
        return [...expandPiece(core.slice(0, -suffix.length)), expansion];
      }
    }
    if (core.endsWith("'s")) {
      const stem = core.slice(0, -2);
      if (IS_CONTRACTION_STEMS.has(stem)) return [stem, 'is'];
    }
  }
  const cleaned = core.replace(NON_WORD, '');
  return cleaned ? [cleaned] : [];
}

/** Normalize a sequence of raw words. Output tokens are in `src` order. */
export function normalizeWords(raw: readonly string[]): Segment[] {
  let segments: Segment[] = raw.map((text, src) => ({ text: prepare(text), src }));
  for (const rule of SEQUENCE_RULES) segments = rule(segments);
  const out: Segment[] = [];
  for (const seg of segments) {
    for (const piece of seg.text.split(DASHES)) {
      for (const part of piece.split(/\s+/)) {
        for (const text of expandPiece(part)) out.push({ text, src: seg.src });
      }
    }
  }
  return out;
}

/** One raw word → zero or more normalized tokens. */
export function normalizeWord(raw: string): string[] {
  return normalizeWords([raw]).map((s) => s.text);
}

/** Free text (e.g. a recognizer hypothesis) → normalized tokens. */
export function normalizeText(raw: string): string[] {
  const words = raw.split(/\s+/).filter(Boolean);
  return normalizeWords(words).map((s) => s.text);
}
