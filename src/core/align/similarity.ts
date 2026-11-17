/**
 * Token similarity for the aligner (SPEC §7 step 3):
 *   max(exact → 1, homophone → HOMOPHONE, normalized Levenshtein ratio, phonetic-key match → PHONETIC)
 * in [0, 1]. Levenshtein ratios below `levFloor` count as 0 so unrelated words earn nothing.
 *
 * Inputs are normalized tokens (lowercase, no punctuation). Results are memoized in a bounded
 * cache because the aligner scores the same (heard, script) pairs over and over.
 *
 * Known limits: split/merged words ("nephi" heard as "knee fight") score low per token; the
 * aligner's gap handling, not this function, has to absorb those. Very short tokens rely on
 * exact/homophone matches because Levenshtein and phonetic keys are unreliable there.
 */
import { phoneticKeys } from './phonetic';

export const SIMILARITY_CONFIG = {
  homophone: 0.95,
  phonetic: 0.85,
  /** Levenshtein ratios below this are treated as no match. */
  levFloor: 0.5,
  /** Skip Levenshtein when the shorter token is under this fraction of the longer one. */
  minLengthRatio: 0.5,
  /** Phonetic matches need tokens at least this long and keys at least this long. */
  phoneticMinToken: 3,
  phoneticMinKey: 2,
  cacheLimit: 50_000,
} as const;

/** Groups of words a recognizer routinely swaps for each other. */
export const HOMOPHONES: readonly (readonly string[])[] = [
  ['there', 'their', 'theyre'],
  ['to', 'too', 'two'],
  ['for', 'four', 'fore'],
  ['write', 'right', 'rite'],
  ['know', 'no'],
  ['knew', 'new'],
  ['hear', 'here'],
  ['its', 'it'],
  ['your', 'youre'],
  ['whose', 'whos'],
  ['by', 'buy', 'bye'],
  ['one', 'won'],
  ['eight', 'ate'],
  ['son', 'sun'],
  ['prophet', 'profit'],
  ['prophets', 'profits'],
  ['pray', 'prey'],
  ['peace', 'piece'],
  ['whole', 'hole'],
  ['holy', 'wholly'],
  ['see', 'sea'],
  ['be', 'bee'],
  ['sole', 'soul'],
  ['meet', 'meat'],
  ['weak', 'week'],
  ['would', 'wood'],
  ['through', 'threw', 'thru'],
  ['led', 'lead'],
  ['which', 'witch'],
  ['ok', 'okay'],
];

const HOMOPHONE_GROUP = new Map<string, number>();
HOMOPHONES.forEach((g, i) => g.forEach((w) => HOMOPHONE_GROUP.set(w, i)));

/** Levenshtein distance with a single rolling row. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      row[j] = Math.min(up + 1, row[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length]!;
}

function compute(a: string, b: string, c: typeof SIMILARITY_CONFIG): number {
  if (!a || !b) return 0;
  const ga = HOMOPHONE_GROUP.get(a);
  if (ga !== undefined && ga === HOMOPHONE_GROUP.get(b)) return c.homophone;
  let best = 0;
  const long = Math.max(a.length, b.length);
  const short = Math.min(a.length, b.length);
  if (short / long >= c.minLengthRatio) {
    const ratio = 1 - levenshtein(a, b) / long;
    if (ratio >= c.levFloor) best = ratio;
  }
  if (best < c.phonetic && short >= c.phoneticMinToken) {
    const [pa, aa] = phoneticKeys(a);
    const [pb, ab] = phoneticKeys(b);
    const ok = (x: string, y: string) => x.length >= c.phoneticMinKey && x === y;
    if (ok(pa, pb) || ok(pa, ab) || ok(aa, pb) || ok(aa, ab)) best = c.phonetic;
  }
  return best;
}

const cache = new Map<string, number>();

/** Similarity of a recognized token and a script token, in [0, 1]. Symmetric, memoized. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  let v = cache.get(key);
  if (v === undefined) {
    v = compute(a, b, SIMILARITY_CONFIG);
    if (cache.size >= SIMILARITY_CONFIG.cacheLimit) cache.clear();
    cache.set(key, v);
  }
  return v;
}
