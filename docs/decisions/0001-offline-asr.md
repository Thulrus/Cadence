# 0001 — On-device speech recognizer (Engine B)

**Status:** accepted and shipped (chunks 17+18, 2026-11-17). Pending the owner's tablet check (see end).

## Decision

**Vosk (Kaldi) via `vosk-browser` 0.0.8 + the Vosk small English model (`vosk-model-small-en-us-0.15`) with its general language model stripped, decoding against a grammar built from the script.**

- 29.3 MB one-time model download (served from this site), plus a 2.4 MB (gzipped) runtime chunk that is lazy-loaded and precached. ~46 MB on disk once unpacked.
- Single-threaded WASM in a Web Worker. No SharedArrayBuffer, so **no COOP/COEP headers or `coi-serviceworker` shim needed** on GitHub Pages.
- `auto` now prefers on-device when the model is downloaded (it measured faster and more accurate than the browser service is in practice, and is private). Web Speech remains the default until the user downloads the model.

## Options considered

| Option                                        | Streaming                                        | English size                              | Licence    | Threads / COOP-COEP                | Status (Nov 2026)                                                                                                                                                        | Verdict                                                                   |
| --------------------------------------------- | ------------------------------------------------ | ----------------------------------------- | ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Vosk** (`vosk-browser`)                     | True streaming, partials every chunk, word times | 41 MB (29 MB with the LM stubbed)         | Apache-2.0 | Single thread; none                | Unmaintained since Dec 2022, but stable and used in production (e.g. lichess voice moves; a lichess fork exists). Pinned, so it won't move                               | **Chosen**: runtime **grammar** support is decisive                       |
| sherpa-onnx streaming Zipformer (20M int8)    | True streaming (chunked encoder)                 | 44 MB model + 13.8 MB WASM (3.8 MB gz)    | Apache-2.0 | Single thread works                | Upstream active, but the npm package is Node-only; browser builds ship per-model as 180 MB tarballs. Tested via `@sherpaw/asr` 0.3.0, a one-person wrapper 10 months old | Slower and less accurate here; hotwords need a BPE vocab this model lacks |
| Whisper-family (transformers.js, WebGPU/WASM) | No (30 s windows; chunked pseudo-streaming)      | 40–150 MB+                                | MIT        | WebGPU or threads for usable speed | Active                                                                                                                                                                   | Latency and phone CPU cost rule it out for live following                 |
| Moonshine (v2 streaming)                      | Yes (newer streaming line)                       | Tiny ~30 MB (ONNX), bigger models heavier | MIT        | ONNX Runtime Web                   | Active; browser path via transformers.js/ORT, no word-level streaming API off the shelf                                                                                  | Promising future candidate; no grammar/biasing                            |

Why the grammar matters: a teleprompter knows what the speaker is about to say. Vosk compiles a phrase list into the decoding graph at runtime, so recognition is constrained to the script's words and phrases (plus `[unk]` for anything else). None of the neural options offers that; sherpa's hotword boosting is a soft bias and isn't available for the small English model.

## Measurements

Setup: three sample scripts synthesized with Piper TTS (en_US ryan/amy, ~210–240 wpm, faster than a typical talk), in two versions: **clean**, and **room** (3-tap echo 40–120 ms, 120 Hz–6 kHz band-limit, pink noise), resampled to 16 kHz. Recognizers ran in headless Chrome on a desktop (Linux, 4 cores), fed in real time in 100 ms chunks. The recorded events were replayed through the real `Aligner`. **Display latency** = time from the speaker finishing a word (reference word end times) to the aligner's position passing it, which is what the user sees. WER is against the script's normalized tokens.

Room audio unless noted. Latency is p50 / p90 / p99 in ms.

| Script (tokens)      | Free LM: WER, latency   | Script word list        | **Script phrases (chosen)** | sherpa Zipformer 20M     |
| -------------------- | ----------------------- | ----------------------- | --------------------------- | ------------------------ |
| Numbers report (371) | 9.4%, 240 / 618 / 1206  | 14.6%, 186 / 466 / 974  | **6.2%, 73 / 281 / 548**    | 17.0%, 405 / 1077 / 2896 |
| Conversational (561) | 7.8%, 222 / 455 / 997   | 13.5%, 196 / 475 / 911  | **4.6%, 60 / 295 / 671**    | –                        |
| Church talk (1441)   | 11.2%, 241 / 520 / 1390 | 24.5%, 259 / 639 / 1653 | **4.3%, 125 / 312 / 559**   | –                        |
| Numbers, clean audio | 10.2%, 237 / 539 / 1011 | 12.7%, 189 / 428 / 789  | 6.2% (phrases, room)        | 15.1%, 382 / 842 / 2426  |

- Every run tracked to the end of the script; 0 backward moves of the position from interim results.
- For comparison, the owner's M2 notes put Web Speech on Android at **3–8 words behind (~1–3 s)**.
- A bare word list is _worse_ than the free model (it loses all sequence context); overlapping 8-word phrases (stride 4) plus single words is best. 4-word and 8-word phrases measured the same.
- **Ad-lib / skip** (church talk with a 30-word off-script aside and a 3-paragraph skip): during the aside the phrase-grammar recognizer emitted garbled script words ("after there true to arouse own"). The aligner went Lost and **held position, no false jump**, resynced on the first script words, and found the speaker after the skip in ~2.5 s, the same as with the free model.
- **Speed (desktop, one core):** real-time factor 0.042 with the grammar (0.073 free LM); sherpa 0.09–0.12. Model load 1.8 s (stubbed LM) vs 2.1 s (full). With the whole browser capped to 40% of one core (cgroup), it still kept up (p50 127 ms); at 25% it fell behind. Most of that budget is Chrome itself. CDP CPU throttling doesn't reach workers, so this was the best available phone proxy. **The real tablet is the gate.**
- **Stubbing the LM:** in grammar mode Vosk uses `HCLr.fst` and the word symbol table, not the 24 MB `Gr.fst` n-gram LM. Replacing `Gr.fst` with a one-state FST that keeps the symbol tables gave identical results (WER, latency) and cut the download from 41.2 to 29.3 MB.
- Not measured: real human speech, real rooms, Android hardware. TTS is cleaner and more regular than a person.

## Plan as built

- **Model hosting:** `scripts/build-model.mjs` (no dependencies) downloads the upstream zip (pinned SHA-256, cached in `.cache/`), stubs `Gr.fst`, and writes a deterministic `public/models/vosk-small-en-us-0.15-lite.tar.gz.bin` plus a `.json` manifest (bytes + SHA-256). CI runs it before `check`; the model is not in git. Named `.bin` because static servers label `.gz` as `Content-Encoding: gzip` and the browser would inflate it.
- **Storage:** `vosk-browser` already persists the unpacked model in IndexedDB (Emscripten IDBFS, DB `/vosk`), keyed by the model URL. We download the archive ourselves (progress, cancel, size + hash check, `navigator.storage.persist()`) and write it into that IDBFS directory with the "downloaded" marker, so Vosk skips its own fetch and unpacks in place. One copy on disk, no Cache Storage duplicate. The IDBFS layout is pinned by `model.test.ts`.
- **Runtime:** `vosk-browser` is a separate lazy chunk (5.8 MB), **precached** by the service worker so it works offline and updates atomically with the app. It's also imported during the model download, so a first-visit page that goes offline still works. Main bundle unchanged apart from ~10 kB of glue.
- **COOP/COEP:** not needed (no threads). If a threaded build is ever wanted, GitHub Pages can't set the headers; `coi-serviceworker` would work but forces a reload on first visit and breaks some cross-origin features. Not worth it at RTF 0.04.
- **Audio:** AudioWorklet (batches 50 ms on the audio thread) → box-filter downsample to 16 kHz on the main thread (~1 µs/sample) → Vosk worker. We don't create a 16 kHz AudioContext because Firefox refuses to connect a mic at a different rate. The level meter uses the same stream, so it works on Android with this engine.

## Risks

- **Unmaintained dependency.** `vosk-browser` 0.0.8 is frozen. Mitigation: pinned exact version; small API surface wrapped in `engines/offline/vosk.ts`; Web Speech remains the fallback. If it breaks in a future browser, sherpa-onnx (via a self-built WASM) is the next candidate.
- **Phone performance and memory** are unverified on real hardware. Expect ~100–150 MB in the worker and a 3–10 s first load (unpacking 46 MB). If a tablet can't keep up, latency grows without bound; the debug log (`?debug`) shows recognizer timing.
- **Grammar forcing.** Off-script speech becomes script words. The aligner handled it in testing (Lost, no jump), but a long ad-lib that happens to use script phrases could cause a false jump. Undo exists.
- **Storage eviction** if `persist()` is denied: the app re-checks storage on each prompter open and falls back to Web Speech with a note.
- **English only.** Other languages would need their own models and builds (future work).

## Human check (gates M4)

Android tablet, airplane mode, built-in mic at arm's length: download the model in Settings (on Wi-Fi), enable airplane mode, read the 1,500-word sample. Note: time from Start to "Listening" (first time and second time), lag behind the voice, any falling-behind over 10 minutes, and how it compares to Web Speech.
