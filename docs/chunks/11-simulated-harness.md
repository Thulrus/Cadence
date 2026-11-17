# Chunk 11 — Simulated engine & ASR-noise harness

**Milestone:** M2 (spec lists under M3; pulled forward to tune the aligner before real-mic work) · **Depends on:** 10

## Goal

A `SimulatedEngine` for development without a mic, a seeded noise injector that mimics real ASR output, and a harness test suite that asserts tracking quality and prints an accuracy metric. Then tune `ALIGN_DEFAULTS` against it.

## Read first

- SPEC §5.3, §11 (all)
- `src/core/types.ts` (`RecognizerEngine`), `src/core/align/aligner.ts` API, `config.ts`

## Tasks

1. **Sample scripts** in `test/fixtures/scripts/`: (a) conversational YouTube script ~600 words, (b) formal church talk ~1,500 words with several scripture references (Bible and Book of Mormon) and a quoted verse, (c) script with numbers, dates, money, percentages. Write original text. Mark up (a) and (b) with a heading or two and a `[pause]`.
2. **`test/harness/speak.ts`**: turn a script's token stream into a timed sequence of `RecognitionEvent`s that mimics Web Speech: words at a natural pace (~150 wpm with jitter), grouped into utterances that end with `isFinal` after pauses, with _cumulative_ interim hypotheses.
3. **`test/harness/noise.ts`**: seeded RNG; injectors for substitutions (homophones, similar-sounding words, mangled names), dropped words, duplicated interim fragments, interim rewrites (a word changes in a later interim), ad-lib insertions (a sentence of unscripted words), skipped sentence/paragraph, repeated sentence, digits emitted instead of words. Each with a rate parameter.
4. **`test/harness/run.ts`**: drive an `Aligner` with the events, record position over time vs ground truth. Metrics: mean/95th-percentile lag in tokens, % of time within N tokens, count of backward moves on interim events (must be 0 except legit rereads), recovery time after each ad-lib/skip.
5. **`test/harness.test.ts`**: scenarios clean / light noise / heavy noise / ad-lib / skip / reread on each sample; assert thresholds (start loose, then tighten): e.g. within 5 tokens ≥ 95% of the time on light noise, zero spurious backward moves, recovery from ad-lib/skip within ~3 s simulated. Print a compact metrics table to the console.
6. **Tune** `ALIGN_DEFAULTS` using the harness. Record before/after metrics and any changed defaults in PROGRESS.md.
7. **`src/engines/simulated.ts`**: `SimulatedEngine implements RecognizerEngine` with two inputs: `typeWords(text)` (dev types "heard" words, emitted as interim then final) and `replay(events, speed)` for JSON transcripts. Uses the same `speak.ts`/`noise.ts` logic if it can import it cleanly (otherwise move shared parts into `src/engines/simulated/`).

## Done when

- `npm run check` passes and prints the metrics table; thresholds asserted.
- PROGRESS.md has the tuned metrics.

## Out of scope

UI wiring of the simulated engine (12).
