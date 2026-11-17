# Chunk 18 — Offline engine integration

**Milestone:** M4 (ends milestone) · **Depends on:** 17 (and the owner's sign-off on its recommendation)

> Chunk 17 may revise this brief based on the chosen engine. Read `docs/decisions/0001-offline-asr.md` first; where it conflicts with this file, the decision record wins.
>
> **Done together with chunk 17 (2026-11-17).** Deviations from this brief, per the decision record: `auto` prefers on-device when the model is installed (not Web Speech first); the model lives in vosk-browser's own IndexedDB file system rather than Cache Storage; the runtime is precached but the model is not; no COOP/COEP needed.

## Goal

Ship Engine B: a fully on-device recognizer behind the same `RecognizerEngine` interface, with model download/caching, an engine selector, and automatic fallback.

## Read first

- `docs/decisions/0001-offline-asr.md`
- SPEC §5.2, §10
- `src/core/types.ts`, `src/engines/webspeech.ts`, `src/ui/capabilities.ts`, PWA config in `vite.config.ts`

## Tasks

1. **`src/engines/offline/`**: `OfflineEngine implements RecognizerEngine`. Mic capture via AudioWorklet → resample to the model's rate → recognizer in a Web Worker (keep the main thread free for scrolling). Emit cumulative `result` events per utterance like Web Speech does, plus `level` events.
2. **Model management:** download on first use with progress UI (bytes, %, cancel), store in Cache Storage or IndexedDB per the decision record, request `navigator.storage.persist()`, verify integrity (size/hash), "Delete downloaded model" in settings showing disk usage. Lazy-load the WASM/runtime so it's not in the main bundle.
3. **Engine selector:** Settings → Engine: Auto / Web Speech / On-device, showing status (model downloaded? size?). `auto` = Web Speech when available and online, else on-device if the model is downloaded, else manual/timed with an explanation. Switching engines mid-run keeps position.
4. **Service worker:** precache the engine runtime (not the model; that's on-demand), make sure the model is served from cache offline. Handle COOP/COEP per the decision record.
5. **Tests:** unit-test the model manager (fake Cache/IDB), the auto-selection logic, and the audio chunking/resampling helpers. Offline end-to-end: a test (or documented manual procedure if a headless browser can't run the WASM) that feeds a recorded audio fixture through the engine and the aligner and checks tracking.
6. Update README privacy/browser sections: on-device mode keeps all audio local.

## Done when

- `npm run check` passes; main bundle size not materially increased (engine lazy-loaded).
- Manual: with the model downloaded, airplane mode on, voice following works on desktop Chrome.

## Human check (copy to PROGRESS.md)

- Android tablet, airplane mode, built-in mic: read the 1,500-word sample; compare tracking against Web Speech from chunk 13's notes.

## Out of scope

Non-English models, multiple model choices (note as future work).
