# Cadence — Development Plan

Work is split into sequential chunks. **One fresh agent per chunk.** Each chunk has a self-contained brief in `docs/chunks/`. Agents work strictly in order; a chunk may assume every earlier chunk is done.

Status values: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` (reason in PROGRESS.md). The agent working a chunk updates its row.

Milestones follow SPEC §12. Each milestone ends with `main` deployable. Some spec M3 items were pulled earlier (normalization, simulated engine, noise harness) because the aligner can't be built or tuned without them.

| #   | Chunk                                                                               | Milestone | Status |
| --- | ----------------------------------------------------------------------------------- | --------- | ------ |
| 00  | Project scaffold & plan (done by planning session)                                  | M1        | DONE   |
| 01  | [App shell, view routing, settings store](chunks/01-app-shell.md)                   | M1        | DONE   |
| 02  | [Script parsing, normalizer, ScriptIndex](chunks/02-script-parsing.md)              | M1        | DONE   |
| 03  | [Script library & import/export](chunks/03-script-library.md)                       | M1        | DONE   |
| 04  | [Prompter display, scrolling, PositionController](chunks/04-prompter-display.md)    | M1        | DONE   |
| 05  | [Appearance settings panel](chunks/05-appearance-settings.md)                       | M1        | DONE   |
| 06  | [PWA, offline shell, deploy, README](chunks/06-pwa-deploy.md)                       | M1 ✅     | DONE   |
| 07  | [Numbers & scripture normalization](chunks/07-numbers-scripture.md)                 | M2        | DONE   |
| 08  | [Weights, phonetics, token similarity](chunks/08-weights-similarity.md)             | M2        | DONE   |
| 09  | [Aligner scoring function](chunks/09-aligner-scoring.md)                            | M2        | TODO   |
| 10  | [Aligner state machine](chunks/10-aligner-state-machine.md)                         | M2        | TODO   |
| 11  | [Simulated engine & ASR-noise harness](chunks/11-simulated-harness.md)              | M2        | TODO   |
| 12  | [Voice-follow integration](chunks/12-voice-integration.md)                          | M2        | TODO   |
| 13  | [Web Speech engine & status UI](chunks/13-webspeech-engine.md)                      | M2 ✅     | TODO   |
| 14  | [Run controls, timed mode, keyboard/clicker](chunks/14-run-controls.md)             | M3        | TODO   |
| 15  | [Fullscreen, wake lock, timer/pace, tuning panel](chunks/15-device-timer-tuning.md) | M3        | TODO   |
| 16  | [v1 hardening, samples, docs, acceptance pass](chunks/16-v1-hardening.md)           | M3 ✅     | TODO   |
| 17  | [Offline ASR evaluation spike](chunks/17-offline-asr-spike.md)                      | M4        | TODO   |
| 18  | [Offline engine integration](chunks/18-offline-engine.md)                           | M4 ✅     | TODO   |

✅ = milestone boundary: after this chunk, `main` must be deployable and the owner should run the human checks listed in PROGRESS.md.

## Chunk brief format

Every brief has: **Goal**, **Read first** (only what's needed — keep context small), **Tasks**, **Done when** (automated acceptance), **Human check** (things an agent can't verify, e.g. a real mic; copied into PROGRESS.md for the owner), **Out of scope**.

## Owner decisions already made (SPEC §14)

- Church device: Android tablet, Chrome. Built-in mic preferred (so thresholds must tolerate arm's-length, reverberant audio).
- Input: plain text primary; simple markdown (`#` headings, `[directions]`) is a nice-to-have, implemented.
- Name: **Cadence** (GitHub repo `Cadence`, Pages path `/Cadence/`).
