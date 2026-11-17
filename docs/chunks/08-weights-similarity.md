# Chunk 08 — Weights, phonetics, token similarity

**Milestone:** M2 · **Depends on:** 02, 07

## Goal

The building blocks the aligner scores with: per-token anchor weights over the script, a phonetic key, and a fast token similarity function.

## Read first

- SPEC §6 last bullet (IDF), §7 step 3 (similarity)
- `src/core/text/index.ts` (`MatchToken.weight`, `phonetic`)

## Tasks

1. **`src/core/align/weights.ts`**: compute IDF-style weights over the script. Treat the script as documents of sentences or fixed ~20-token windows (choose, document why) for document frequency. Combine with: stopword list (the, and, of, a, to, in, is, that, it, ...) forced low; 1–2 letter tokens low; longer tokens a mild boost. Normalize to roughly `[0.1, 1]`. Export `isStrongAnchor(token)` with a named threshold. `buildScriptIndex` (or a follow-up `weighIndex`) fills `weight`.
2. **`src/core/align/phonetic.ts`**: Double Metaphone (primary + alternate key). Either implement it, or use a small well-known ESM package (e.g. `double-metaphone`) if it bundles cleanly; record the choice. Precompute keys for script tokens into `MatchToken.phonetic`.
3. **`src/core/align/similarity.ts`**: `tokenSimilarity(a, b): number` in `[0, 1]` = max(exact → 1.0, normalized Levenshtein ratio, phonetic-key equality → e.g. 0.85 constant). Named constants for all values. Fast: early-exit on exact match; bail on large length differences; memoize per (recognized token, script token) pair with a bounded cache, since the aligner calls this a lot. Include a small homophone table (there/their/they're, to/too/two, for/four, write/right, know/no, ...) treated as near-exact.
4. Tests: weights ordering (rare names > common verbs > stopwords), phonetic keys for known words, similarity edge cases (empty, single letters, plurals, homophones, recognizer-typical errors like "nephi"/"knee fight" won't match well; document such known limits).
5. A micro-benchmark test (skip by default or keep fast): 10k similarity calls complete in a few ms.

## Done when

- `npm run check` passes; all three modules tested.
- ScriptIndex for a sample script has sensible weights (spot-check printed in a test snapshot).

## Out of scope

Window/alignment scoring (09).
