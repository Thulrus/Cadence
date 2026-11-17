# Chunk 13 — Web Speech engine & status UI

**Milestone:** M2 (ends milestone) · **Depends on:** 12

## Goal

Real voice following on Chrome via the Web Speech API, robust to the browser stopping recognition, with clear status, a mic level meter, capability detection, and the privacy notice.

## Read first

- SPEC §2, §5.1, §9 "Mic level meter and status badge" bullet, §10
- `src/core/types.ts`, `src/engines/simulated.ts` (reference implementation of the interface), `src/ui/follow.ts`

## Tasks

1. **`src/engines/webspeech.ts`**: `WebSpeechEngine implements RecognizerEngine`.
   - `SpeechRecognition ?? webkitSpeechRecognition`; `continuous = true`, `interimResults = true`, `lang` from settings, `maxAlternatives = 1`.
   - Emit `result` events with the _current utterance's_ words (concatenate `results[resultIndex..]` transcripts appropriately; final results end an utterance). Don't compute deltas here; the aligner dedups (chunk 10).
   - **Auto-restart** on `end` and recoverable `error`s (`no-speech`, `aborted`, `network`, `audio-capture` with care) with backoff (e.g. 250 ms → 2 s cap, reset after a successful result), unless the user stopped. Status `restarting` during gaps. `not-allowed`/`service-not-allowed` → `no-permission`, don't loop.
   - Add DOM typings for SpeechRecognition locally if TS lib lacks them.
2. **Mic level meter:** `getUserMedia` + `AnalyserNode` → `level` events at ~20 Hz. Running getUserMedia concurrently with Web Speech can fail or degrade on some Android devices: make the meter optional (setting, default on), fail soft, and note results in PROGRESS.md.
3. **Capability detection** at startup (`src/ui/capabilities.ts`): Web Speech present? secure context? → choose `auto` engine accordingly; on Firefox/unsupported show "Voice following isn't available in this browser; timed and manual modes work" and default to manual. iOS Safari: best effort, show note.
4. **Prompter UI:** big Start/Pause listening button (start must come from a user gesture), status badge (_listening_, _paused_, _lost_, _no mic permission_, _recognizer restarting_), level meter. Settings → Engine section: engine choice, language, mic meter toggle.
5. **Privacy notice:** first time voice mode starts, a one-time in-app notice that Chrome sends audio to Google's speech service and needs connectivity; link to README. Remember dismissal in settings.
6. Make the `auto` engine choice resolve to Web Speech, falling back to simulated in dev only.

## Done when

- `npm run check` passes; unit-test the restart/backoff policy and result→event mapping with a fake `SpeechRecognition` class.
- Manual on desktop Chrome (`npm run dev`, localhost): reading a sample aloud tracks; staying silent for a minute then resuming still works (auto-restart); denying mic permission shows the right status.

## Human check (copy to PROGRESS.md)

- Android tablet, Chrome, built-in mic at arm's length, in a room with some echo: read the 1,500-word sample at natural pace. Note: lag, any backward jitter, restart gaps, whether the mic meter breaks recognition. M2 complete: push and redeploy.

## Out of scope

Mode switch/timed mode/keyboard (14), wake lock (15).
