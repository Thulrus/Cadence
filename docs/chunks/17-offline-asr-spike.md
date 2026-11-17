# Chunk 17 — Offline ASR evaluation spike

**Milestone:** M4 · **Depends on:** 16 (v1 complete)

## Goal

Choose the on-device streaming recognizer for Engine B by evidence, not guesswork. Output a decision record and a throwaway prototype; **no production integration** in this chunk.

## Read first

- SPEC §5.2, §3 last bullet, §10
- `src/core/types.ts` (`RecognizerEngine`), `src/engines/webspeech.ts` (how events are shaped)

## Tasks

1. Research current options (use web search; check maintenance status, licence, last release): Vosk-browser, sherpa-onnx WASM (streaming Zipformer/Paraformer models), Whisper-family via transformers.js (WebGPU/WASM), Moonshine, and anything newer. For each: streaming support (true streaming vs chunked), latency to first word, English model sizes, licence, WASM SIMD/threads requirements (threads need cross-origin isolation, i.e. COOP/COEP headers, which **GitHub Pages cannot set**; note workarounds such as a `coi-serviceworker` shim and their caveats), Android Chrome feasibility, word-level output.
2. Build a minimal prototype page (`proto/offline-asr/`, excluded from the main build or behind a dev-only route) for the top 1–2 candidates: load model, stream mic audio via AudioWorklet, print interim/final words with timestamps, measure latency and real-time factor on desktop.
3. Feed prototype output for a read-aloud sample into the existing harness metrics if practical (record a transcript JSON while reading a fixture, replay through the Aligner).
4. Write `docs/decisions/0001-offline-asr.md`: options table, measurements, recommendation, model choice + size, caching plan (Cache Storage vs IndexedDB, quota/persistence via `navigator.storage.persist()`), COOP/COEP plan, risks.
5. Write the chunk 18 brief adjustments (if the recommended engine changes chunk 18's plan, edit `docs/chunks/18-offline-engine.md` accordingly).

## Done when

- Decision record exists with measurements; prototype committed (not shipped in the app bundle); `npm run check` still passes.
- Set the chunk to `BLOCKED` pending owner approval of the recommendation **if** it needs a decision (e.g. large model download size, licence concerns). Otherwise `DONE`.

## Human check (copy to PROGRESS.md)

- Run the prototype on the Android tablet and report latency / whether it keeps up in real time. This likely gates chunk 18.

## Out of scope

Shipping the engine (18).
