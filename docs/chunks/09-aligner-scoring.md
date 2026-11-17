# Chunk 09 — Aligner scoring function

**Milestone:** M2 · **Depends on:** 08

## Goal

The pure scoring core of SPEC §7: given a tail of recognized tokens and a window of script tokens, find the best end position and its score. Separate from the state machine (chunk 10) per the spec.

## Read first

- SPEC §7 steps 1–4 and the closing paragraph
- `src/core/align/similarity.ts`, `weights.ts`, `src/core/text/index.ts`

## Tasks

1. **`src/core/align/config.ts`**: `AlignConfig` type and `ALIGN_DEFAULTS` holding every tunable named value: `tailMin`, `tailMax` (K≈4–8), `windowBack` (5), `windowAhead` (40), `acceptThreshold`, `distancePenaltyPerToken`, `maxGaps`, `gapPenalty`, `minMatchedTokens` (3), `strongAnchorWeight`, plus the state-machine values chunk 10 will use (`backtrackThreshold`, `backtrackMinTail`, `lostAfterMs`, `lostTailMin`, `lostThreshold`, `lostWidenSteps`, `largeJumpTokens` (60)). Document each with a comment. `resolveConfig(overrides)` merges `Settings.align` overrides safely.
2. **`src/core/align/score.ts`**: `scoreWindow(tail: string[], index, p, config): Candidate[]` / `bestCandidate(...)`.
   - For each candidate end position `q` in `[p − back, p + ahead]` (clamped), run a **banded local alignment** (Smith-Waterman-style DP) of the tail against script tokens ending at `q`, using `tokenSimilarity` for substitution scores, IDF weights on script tokens, and allowing up to `maxGaps` insertions/deletions with `gapPenalty`.
   - Score = weighted matched fraction of the tail, minus `distancePenaltyPerToken · |q − p|`.
   - Return `{ q, score, matchedCount, hasStrongAnchor, matchedSpan: [start, end] }`.
   - Avoid recomputing the full DP per `q` where possible (one DP pass over the window yielding scores for every end position is the natural approach). Budget: a single call with tail 8 and window 45 should be well under 1 ms; with a whole-script window (lost mode, ~1,500–5,000 tokens) under ~10 ms.
3. `isAcceptable(candidate, tail, config, mode)` implementing step 4 (threshold + strong anchor or ≥ `minMatchedTokens`), with a stricter variant for lost mode.
4. Thorough tests: exact tail → exact q; one substitution; one dropped word; one inserted word; repeated phrases in the script (prefer nearest to p); tail entirely ad-lib → nothing acceptable; stopword-only tails rejected; distance penalty tie-breaking; window clamping at script start/end.

## Done when

- `npm run check` passes; scoring tests cover the cases above; perf budget asserted loosely in a test.
- Module is pure, deterministic, documented.

## Out of scope

Tail buffer, dedup, backtrack/lost logic (10).
