/**
 * Pure scoring core of the aligner (SPEC §7 steps 1–4). No state: given the recognized tail,
 * the script index and the current position `p`, score every candidate end position `q`.
 *
 * One banded local-alignment DP (Smith-Waterman style) runs over the script slice that can
 * end in the window, yielding a score for every end column at once:
 *   - the tail's END is anchored (the last heard token must be aligned, matched or as an
 *     inserted word), its START is local (older tail tokens may fall outside the match, e.g.
 *     an ad-lib just before the speaker returned to the script);
 *   - moves: match/substitute (gain = min(script, tail weight) · similarity, or −mismatchPenalty · weight
 *     below `matchSimilarity`), tail insertion and script deletion (each −gapPenalty · the
 *     skipped token's weight), at most `maxGaps` gaps;
 *   - the alignment must END on a true match (trailing inserted words are fine);
 *   - the DP maximizes raw − prefixRatio · (normalizer of the tail tokens it consumes), not raw,
 *     so an older tail prefix is only kept when it matches at least `prefixRatio` well
 *     (otherwise "when MOTION are in the service of your" keeps the misheard prefix, scores
 *     ~0.7 after normalization, and loses to an exact copy of the suffix further on);
 *   - score = raw alignment score / the path's normalizer (the weight of the aligned tail
 *     suffix, except that a matched pair counts the pair weight it can earn, so an exact
 *     match scores 1 and a fuzzy match of a word the script lacks isn't over-charged), minus `distancePenalty · |q − (p − 1)|`. `p − 1` is where the tail is
 *     expected to end if the speaker said nothing new, so "no movement" costs nothing.
 *
 * Weights for tail tokens come from the script's own weights for the same word; words not in
 * the script get the full weight (unknown words are strong evidence of an ad-lib).
 */
import type { ScriptIndex } from '../text/types';
import type { AlignConfig } from './config';
import { tokenSimilarity } from './similarity';
import { STOPWORDS, WEIGHT_CONFIG } from './weights';

export interface Candidate {
  /** Script token index the tail's alignment ends at. Moving to it means position = q + 1. */
  q: number;
  score: number;
  /** Aligned pairs with similarity ≥ matchSimilarity. */
  matchedCount: number;
  /** Matched pairs whose script token is not a stopword-weight token. */
  contentCount: number;
  hasStrongAnchor: boolean;
  /** [first, last] script token index of the alignment. */
  matchedSpan: [number, number];
  /** Tail tokens covered by the alignment (it ends at the last one). */
  tailSpan: number;
}

export interface WindowOptions {
  back?: number;
  ahead?: number;
  distancePenalty?: number;
}

/** Content tokens weigh more than this (stopwords / 1–2 letter tokens don't). */
export const CONTENT_MIN_WEIGHT = WEIGHT_CONFIG.shortWeight;

interface Prepared {
  normIds: Int32Array;
  norms: string[];
  weights: Float64Array;
  weightByNorm: Map<string, number>;
}

const prepared = new WeakMap<ScriptIndex, Prepared>();

function prepare(index: ScriptIndex): Prepared {
  let p = prepared.get(index);
  if (p) return p;
  const ids = new Map<string, number>();
  const norms: string[] = [];
  const normIds = new Int32Array(index.tokens.length);
  const weights = new Float64Array(index.tokens.length);
  const weightByNorm = new Map<string, number>();
  index.tokens.forEach((t, i) => {
    let id = ids.get(t.norm);
    if (id === undefined) {
      id = norms.length;
      ids.set(t.norm, id);
      norms.push(t.norm);
      weightByNorm.set(t.norm, t.weight);
    }
    normIds[i] = id;
    weights[i] = t.weight;
  });
  p = { normIds, norms, weights, weightByNorm };
  prepared.set(index, p);
  return p;
}

function tailWeight(token: string, prep: Prepared): number {
  const w = prep.weightByNorm.get(token);
  if (w !== undefined) return w;
  if (STOPWORDS.has(token)) return WEIGHT_CONFIG.stopwordWeight;
  if (token.length <= WEIGHT_CONFIG.shortMaxLength) return WEIGHT_CONFIG.shortWeight;
  return 1;
}

/**
 * Score every end position q in [p − back, p + ahead] (clamped to the script). Returns only
 * positions with a positive alignment, in ascending q.
 */
export function scoreWindow(
  tail: readonly string[],
  index: ScriptIndex,
  p: number,
  config: AlignConfig,
  opts: WindowOptions = {},
): Candidate[] {
  const K = tail.length;
  const n = index.tokens.length;
  if (K === 0 || n === 0) return [];
  const back = opts.back ?? config.windowBack;
  const ahead = opts.ahead ?? config.windowAhead;
  const distPenalty = opts.distancePenalty ?? config.distancePenaltyPerToken;
  const qLo = Math.max(0, p - back);
  const qHi = Math.min(n - 1, p + ahead);
  if (qLo > qHi) return [];
  const G = config.maxGaps;
  const colStart = Math.max(0, qLo - K - G + 1);
  const W = qHi - colStart + 1;
  const prep = prepare(index);
  const tw = tail.map((t) => tailWeight(t, prep));

  // Similarity per (tail token, unique script word), computed lazily.
  const simCache = tail.map(() => new Map<number, number>());
  const sim = (i: number, col: number): number => {
    const id = prep.normIds[col]!;
    const m = simCache[i]!;
    let v = m.get(id);
    if (v === undefined) {
      v = tokenSimilarity(tail[i]!, prep.norms[id]!);
      m.set(id, v);
    }
    return v;
  };

  const size = K * W;
  const layer = () => ({
    /** DP objective: raw − prefixRatio · weight of the tail tokens consumed (see module doc). */
    obj: new Float64Array(size).fill(-Infinity),
    /** Raw alignment score of the path chosen by `obj`. */
    score: new Float64Array(size).fill(-Infinity),
    /** Normalizer of that path: Σ over consumed tail tokens of (matched ? pair : tail) weight. */
    den: new Float64Array(size),
    start: new Int32Array(size),
    row0: new Int32Array(size),
    matched: new Int32Array(size),
    content: new Int32Array(size),
    anchor: new Uint8Array(size),
    /** 1 if the last script token consumed was a true match (not a substitution/deletion). */
    endMatch: new Uint8Array(size),
  });
  const L = Array.from({ length: G + 1 }, layer);
  const { matchSimilarity, mismatchPenalty, gapPenalty, strongAnchorWeight, prefixRatio } = config;

  for (let i = 0; i < K; i++) {
    for (let c = 0; c < W; c++) {
      const col = colStart + c;
      const w = prep.weights[col]!;
      // Credit the lesser of the two weights, so the score stays a fraction of the tail's
      // weight even when a stopword fuzzy-matches a rare script word (or vice versa).
      const pairW = Math.min(w, tw[i]!);
      const s = sim(i, col);
      const isMatch = s >= matchSimilarity;
      const gain = isMatch ? pairW * s : -mismatchPenalty * w;
      const isContent = isMatch && pairW > CONTENT_MIN_WEIGHT ? 1 : 0;
      const isAnchor = isMatch && pairW >= strongAnchorWeight ? 1 : 0;
      const cell = i * W + c;
      // A matched pair normalizes by the weight it can earn (a fuzzy match of a word the script
      // lacks would otherwise weigh 1 but earn only the script word's weight).
      const matchDen = isMatch ? pairW : tw[i]!;
      const rowCost = prefixRatio * tw[i]!;
      const matchCost = prefixRatio * matchDen;
      for (let g = 0; g <= G; g++) {
        const cur = L[g]!;
        let best = -Infinity;
        let raw = -Infinity;
        let den = 0;
        let from = -1; // -1 fresh start, else cell index in `src` layer
        let src = cur;
        // Diagonal: match / substitution.
        if (i > 0 && c > 0) {
          const d = cur.obj[cell - W - 1]!;
          if (d > -Infinity && d + gain - matchCost > best) {
            best = d + gain - matchCost;
            raw = cur.score[cell - W - 1]! + gain;
            den = cur.den[cell - W - 1]! + matchDen;
            from = cell - W - 1;
            src = cur;
          }
        }
        if (g === 0 && isMatch && gain - matchCost > best) {
          best = gain - matchCost;
          raw = gain;
          den = matchDen;
          from = -1;
        }
        if (g > 0) {
          const prev = L[g - 1]!;
          // Tail insertion: tail[i] heard but not in the script.
          if (i > 0) {
            const u = prev.obj[cell - W]!;
            const cost = gapPenalty * tw[i]!;
            if (u > -Infinity && u - cost - rowCost > best) {
              best = u - cost - rowCost;
              raw = prev.score[cell - W]! - cost;
              den = prev.den[cell - W]! + tw[i]!;
              from = cell - W;
              src = prev;
            }
          }
          // Script deletion: script[col] skipped. Never useful after the last tail token.
          if (c > 0 && i < K - 1) {
            const l = prev.obj[cell - 1]!;
            if (l > -Infinity && l - gapPenalty * w > best) {
              best = l - gapPenalty * w;
              raw = prev.score[cell - 1]! - gapPenalty * w;
              den = prev.den[cell - 1]!;
              from = cell - 1;
              src = prev;
            }
          }
        }
        if (!(raw > 0)) continue;
        cur.obj[cell] = best;
        cur.score[cell] = raw;
        cur.den[cell] = den;
        const viaDiag = from === cell - W - 1 && src === cur;
        if (from === -1) {
          cur.start[cell] = col;
          cur.row0[cell] = i;
          cur.matched[cell] = 1;
          cur.content[cell] = isContent;
          cur.anchor[cell] = isAnchor;
          cur.endMatch[cell] = 1;
        } else {
          const aligned = viaDiag && isMatch ? 1 : 0;
          cur.start[cell] = src.start[from]!;
          cur.row0[cell] = src.row0[from]!;
          cur.matched[cell] = src.matched[from]! + aligned;
          cur.content[cell] = src.content[from]! + (viaDiag ? isContent : 0);
          cur.anchor[cell] = src.anchor[from]! | (viaDiag ? isAnchor : 0);
          const viaInsertion = from === cell - W;
          cur.endMatch[cell] = viaDiag ? (isMatch ? 1 : 0) : viaInsertion ? src.endMatch[from]! : 0;
        }
      }
    }
  }

  const minSpan = Math.min(config.tailMin, K);
  const expected = p - 1;
  const out: Candidate[] = [];
  for (let q = qLo; q <= qHi; q++) {
    const cell = (K - 1) * W + (q - colStart);
    let bestC: Candidate | null = null;
    for (const cur of L) {
      const raw = cur.score[cell]!;
      // The end position must be a real match: a substitution or skipped script word at the
      // end would let a stray trailing word drag the position forward.
      if (!(raw > 0) || !cur.endMatch[cell]) continue;
      const row0 = cur.row0[cell]!;
      const tailSpan = K - row0;
      if (tailSpan < minSpan) continue;
      const score = raw / cur.den[cell]! - distPenalty * Math.abs(q - expected);
      if (bestC && bestC.score >= score) continue;
      bestC = {
        q,
        score,
        matchedCount: cur.matched[cell]!,
        contentCount: cur.content[cell]!,
        hasStrongAnchor: cur.anchor[cell] === 1,
        matchedSpan: [cur.start[cell]!, q],
        tailSpan,
      };
    }
    if (bestC) out.push(bestC);
  }
  return out;
}

/**
 * Highest score, except when the script repeats a phrase: candidates within `margin` of the
 * best are in contention, and only those within `slack` tokens of the nearest contender
 * (to the expected end p − 1) are kept; the highest score among them wins (ties: nearer, then
 * lower q). The margin matters because the DP keeps the best *raw* path per end, so a nearby
 * match with one misheard word can score a little below an exact copy of a short phrase the
 * script repeats further on ("in the service of your … in the service of your"). The slack
 * keeps a one-word step forward from losing to "hold" (the new word read as an insertion).
 */
export function bestCandidate(
  candidates: readonly Candidate[],
  p: number,
  margin = 0,
  slack = 0,
): Candidate | null {
  let top = -Infinity;
  for (const c of candidates) top = Math.max(top, c.score);
  const dist = (c: Candidate) => Math.abs(c.q - (p - 1));
  let nearest = Infinity;
  for (const c of candidates) if (c.score >= top - margin) nearest = Math.min(nearest, dist(c));
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (c.score < top - margin || dist(c) > nearest + slack) continue;
    if (!best || c.score > best.score || (c.score === best.score && dist(c) < dist(best))) {
      best = c;
    }
  }
  return best;
}

export type AcceptMode = 'normal' | 'lost';

/**
 * SPEC §7 step 4: score ≥ threshold, and a strong anchor or ≥ minMatchedTokens matches
 * (with at least one content word, so stopword-only tails never move the prompter).
 * Lost mode is stricter: higher threshold, longer aligned tail, and both conditions.
 */
export function isAcceptable(
  c: Candidate,
  config: AlignConfig,
  mode: AcceptMode = 'normal',
): boolean {
  if (c.contentCount < 1) return false;
  const enough = c.matchedCount >= config.minMatchedTokens;
  if (mode === 'lost') {
    return (
      c.score >= config.lostThreshold &&
      c.tailSpan >= config.lostTailMin &&
      enough &&
      c.hasStrongAnchor
    );
  }
  return c.score >= config.acceptThreshold && (c.hasStrongAnchor || enough);
}
