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
  /**
   * Candidates scoring within this of the best are treated as tied and the one nearest the
   * expected position wins (repeated phrases; see bestCandidate).
   */
  nearMargin: number;
  /** …among those, candidates within this many tokens of the nearest compete on score. */
  nearSlack: number;
  /**
   * The DP keeps an older tail prefix only if it matches at least this well (weighted
   * fraction); otherwise the alignment starts after it. See score.ts.
   */
  prefixRatio: number;
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
  /**
   * Most unread script words a forward move may skip (from the position to the start of the
   * matched stretch), in every mode, lost included. Voice never jumps far ahead: a stray match
   * during an ad-lib would be catastrophic live; a speaker who really skips ahead scrolls there.
   */
  maxSkipAhead: number;
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
  windowAhead: 80,
  acceptThreshold: 0.6,
  distancePenaltyPerToken: 0.004,
  lostDistancePenaltyPerToken: 0.00005,
  nearMargin: 0.1,
  nearSlack: 4,
  prefixRatio: 0.7,
  maxGaps: 3,
  gapPenalty: 0.5,
  mismatchPenalty: 0.5,
  matchSimilarity: 0.7,
  minMatchedTokens: 3,
  jumpMinMatched: 4,
  maxSkipAhead: 30,
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
  'nearSlack',
  'minMatchedTokens',
  'jumpMinMatched',
  'maxSkipAhead',
  'backtrackMinTail',
  'backtrackMinTokens',
  'backtrackWindow',
  'lostWidenSteps',
  'lostTailMin',
  'largeJumpTokens',
]);

/** UI metadata for one tunable value (Settings → Advanced). */
export interface TuningParam {
  /** Short label. */
  label: string;
  /** User-facing help text. */
  help: string;
  /** Numeric bounds and step for the form (ignored for booleans). */
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Tuning-panel metadata for every key of AlignConfig (typed as a full Record, so adding a key
 * without metadata fails the typecheck). Bounds are for the form only; resolveConfig still
 * accepts any finite value ≥ 0.
 */
export const ALIGN_TUNING: Readonly<Record<keyof AlignConfig, TuningParam>> = {
  tailMin: {
    label: 'Shortest tail',
    help: 'Fewest recent words worth matching; also the shortest matched stretch accepted.',
    min: 1,
    max: 10,
    step: 1,
  },
  tailMax: {
    label: 'Tail length',
    help: 'How many of the most recently heard words are matched against the script.',
    min: 2,
    max: 20,
    step: 1,
  },
  windowBack: {
    label: 'Window behind',
    help: 'Words behind the current position searched for a match.',
    min: 0,
    max: 40,
    step: 1,
  },
  windowAhead: {
    label: 'Window ahead',
    help: 'Words ahead of the current position searched for a match. Larger catches bigger skips sooner.',
    min: 10,
    max: 300,
    step: 1,
  },
  acceptThreshold: {
    label: 'Accept threshold',
    help: 'Minimum match score (0–1) to move. Higher = fewer false moves, more hesitation.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  distancePenaltyPerToken: {
    label: 'Distance penalty',
    help: 'Score removed per word of distance from the expected spot (prefers nearby matches).',
    min: 0,
    max: 0.05,
    step: 0.0005,
  },
  lostDistancePenaltyPerToken: {
    label: 'Distance penalty (lost)',
    help: 'Same, while lost and searching the whole script.',
    min: 0,
    max: 0.005,
    step: 0.00001,
  },
  nearMargin: {
    label: 'Tie margin',
    help: 'Matches scoring within this of the best are treated as tied; the nearest wins (repeated phrases).',
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  nearSlack: {
    label: 'Tie slack',
    help: 'Among tied matches, those within this many words of the nearest still compete on score.',
    min: 0,
    max: 20,
    step: 1,
  },
  prefixRatio: {
    label: 'Prefix ratio',
    help: 'An older part of the heard words is kept in a match only if it matches at least this well.',
    min: 0,
    max: 1,
    step: 0.05,
  },
  maxGaps: {
    label: 'Max gaps',
    help: 'Words that may be skipped or inserted inside one match.',
    min: 0,
    max: 8,
    step: 1,
  },
  gapPenalty: {
    label: 'Gap penalty',
    help: 'Cost of a skipped/inserted word, times that word’s weight.',
    min: 0,
    max: 2,
    step: 0.05,
  },
  mismatchPenalty: {
    label: 'Mismatch penalty',
    help: 'Cost of pairing two different words, times the script word’s weight.',
    min: 0,
    max: 2,
    step: 0.05,
  },
  matchSimilarity: {
    label: 'Word similarity',
    help: 'How alike (0–1) a heard word and a script word must be to count as the same word.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  minMatchedTokens: {
    label: 'Min matched words',
    help: 'Matched words needed when no distinctive (strong-anchor) word is matched.',
    min: 1,
    max: 10,
    step: 1,
  },
  jumpMinMatched: {
    label: 'Min words to skip ahead',
    help: 'Matched words needed to move forward past skipped text (stops short ad-lib phrases dragging the prompter).',
    min: 1,
    max: 12,
    step: 1,
  },
  maxSkipAhead: {
    label: 'Max skip ahead (words)',
    help: 'Furthest the voice can jump forward past unread text. Skip further by scrolling or tapping.',
    min: 0,
    max: 500,
    step: 1,
  },
  strongAnchorWeight: {
    label: 'Strong anchor weight',
    help: 'Word weight (0–1) at which a word is distinctive enough to anchor a match on its own.',
    min: 0,
    max: 1,
    step: 0.05,
  },
  allowBacktrack: {
    label: 'Allow rereading',
    help: 'Let the prompter move back when you confidently reread earlier text.',
  },
  backtrackThreshold: {
    label: 'Reread threshold',
    help: 'Score a backward move needs.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  backtrackMinTail: {
    label: 'Reread min words',
    help: 'Matched stretch a backward move needs.',
    min: 1,
    max: 12,
    step: 1,
  },
  backtrackMinTokens: {
    label: 'Reread min distance',
    help: 'Backward moves shorter than this many words are ignored as noise.',
    min: 0,
    max: 20,
    step: 1,
  },
  backtrackWindow: {
    label: 'Reread window',
    help: 'How far back (words) to look for a reread when nothing matches ahead.',
    min: 0,
    max: 300,
    step: 1,
  },
  lostAfterMs: {
    label: 'Lost after (ms)',
    help: 'Speech time without a match before the search widens.',
    min: 500,
    max: 20_000,
    step: 100,
  },
  lostStepMs: {
    label: 'Widen step (ms)',
    help: 'Further speech time per widening step while lost.',
    min: 100,
    max: 10_000,
    step: 100,
  },
  lostWidenSteps: {
    label: 'Widen steps',
    help: 'Steps until the search covers the whole script.',
    min: 1,
    max: 10,
    step: 1,
  },
  lostTailMin: {
    label: 'Lost min words',
    help: 'Matched stretch a jump needs while lost.',
    min: 1,
    max: 12,
    step: 1,
  },
  lostThreshold: {
    label: 'Lost threshold',
    help: 'Score a jump needs while lost.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  activityGapMs: {
    label: 'Silence gap (ms)',
    help: 'Pauses longer than this between results don’t count as speech time.',
    min: 100,
    max: 10_000,
    step: 100,
  },
  largeJumpTokens: {
    label: 'Large jump (words)',
    help: 'Moves bigger than this show the “Jumped … — Undo” message.',
    min: 1,
    max: 500,
    step: 1,
  },
};
