/**
 * Every tunable value for the aligner (SPEC §7 step 10), in one object. The tuning panel
 * (chunk 15) edits `Settings.align`, a sparse set of overrides merged by `resolveConfig`.
 *
 * Score units: a candidate's score is a weighted matched fraction in ~[0, 1] (1 = the aligned
 * tail matches exactly), minus the distance penalty. Gap/mismatch penalties are in units of
 * the skipped token's own weight, so dropping "the" costs far less than dropping "Nephi".
 */
import { WEIGHT_CONFIG } from './weights';

export interface AlignConfig {
  /** Fewest tail tokens worth scoring; also the shortest aligned tail suffix accepted. */
  tailMin: number;
  /** Tail length K: the most recent recognized tokens that are scored. */
  tailMax: number;
  /** Search window behind / ahead of the position (in tokens) for candidate end positions. */
  windowBack: number;
  windowAhead: number;
  /** Minimum score to accept a match in the normal window. */
  acceptThreshold: number;
  /** Score subtracted per token of distance from the expected end (position − 1). */
  distancePenaltyPerToken: number;
  /** Same, while lost (the window is huge, so it must be much smaller). */
  lostDistancePenaltyPerToken: number;
  /** Max insertions + deletions inside one alignment. */
  maxGaps: number;
  /** Cost of a gap, times the skipped token's weight. */
  gapPenalty: number;
  /** Cost of aligning two dissimilar tokens, times the script token's weight. */
  mismatchPenalty: number;
  /** Similarity at/above which an aligned pair counts as a match (below: a mismatch). */
  matchSimilarity: number;
  /** Matched tokens needed when no strong anchor is matched (SPEC §7 step 4). */
  minMatchedTokens: number;
  /**
   * A forward move whose alignment starts more than `maxGaps` past the position skips script
   * text; it needs at least this many matched tokens (a short phrase in an ad-lib that happens
   * to appear a few lines ahead must not drag the prompter forward).
   */
  jumpMinMatched: number;
  /** Script-token weight that makes a strong anchor. */
  strongAnchorWeight: number;
  /** Rereading: allow confident backward moves at all. */
  allowBacktrack: boolean;
  /** Score and aligned-tail length a backward move needs. */
  backtrackThreshold: number;
  backtrackMinTail: number;
  /**
   * How far behind the position to look for a reread when the normal window finds nothing.
   * Only searched backward, and only after the forward window fails, so a phrase the script
   * repeats later still resolves forward.
   */
  backtrackWindow: number;
  /** Backward moves shorter than this are always ignored (they are interim noise). */
  backtrackMinTokens: number;
  /** ms of speech activity without an accepted match before lost mode widens the search. */
  lostAfterMs: number;
  /** ms of further activity per widening step; after `lostWidenSteps` steps it's the whole script. */
  lostStepMs: number;
  lostWidenSteps: number;
  /** Aligned-tail length and score a lost-mode jump needs. */
  lostTailMin: number;
  lostThreshold: number;
  /** Gaps between events longer than this don't count as speech activity. */
  activityGapMs: number;
  /** |Δposition| above this is reported as a jump (UI may offer undo). */
  largeJumpTokens: number;
}

export const ALIGN_DEFAULTS: Readonly<AlignConfig> = {
  tailMin: 3,
  tailMax: 8,
  windowBack: 5,
  windowAhead: 40,
  acceptThreshold: 0.6,
  distancePenaltyPerToken: 0.004,
  lostDistancePenaltyPerToken: 0.00005,
  maxGaps: 2,
  gapPenalty: 0.5,
  mismatchPenalty: 0.5,
  matchSimilarity: 0.7,
  minMatchedTokens: 3,
  jumpMinMatched: 4,
  strongAnchorWeight: WEIGHT_CONFIG.strongAnchorWeight,
  allowBacktrack: true,
  backtrackThreshold: 0.85,
  backtrackMinTail: 4,
  backtrackMinTokens: 3,
  backtrackWindow: 60,
  lostAfterMs: 4000,
  lostStepMs: 1500,
  lostWidenSteps: 3,
  lostTailMin: 5,
  lostThreshold: 0.75,
  activityGapMs: 1000,
  largeJumpTokens: 60,
};

/**
 * Merge sparse overrides (e.g. `Settings.align`) onto the defaults. Unknown keys and values
 * of the wrong type are ignored; numbers must be finite and ≥ 0; counts are floored to ints.
 */
export function resolveConfig(overrides: Readonly<Record<string, unknown>> = {}): AlignConfig {
  const out: AlignConfig = { ...ALIGN_DEFAULTS };
  const target = out as unknown as Record<string, number | boolean>;
  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in ALIGN_DEFAULTS)) continue;
    const def = target[k];
    if (typeof def === 'boolean' && typeof v === 'boolean') target[k] = v;
    if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      target[k] = INTEGER_KEYS.has(k as keyof AlignConfig) ? Math.floor(v) : v;
    }
  }
  out.tailMin = Math.max(1, out.tailMin);
  out.tailMax = Math.max(out.tailMin, out.tailMax);
  out.lostWidenSteps = Math.max(1, out.lostWidenSteps);
  return out;
}

const INTEGER_KEYS = new Set<keyof AlignConfig>([
  'tailMin',
  'tailMax',
  'windowBack',
  'windowAhead',
  'maxGaps',
  'minMatchedTokens',
  'jumpMinMatched',
  'backtrackMinTail',
  'backtrackMinTokens',
  'backtrackWindow',
  'lostWidenSteps',
  'lostTailMin',
  'largeJumpTokens',
]);
