# Chunk 12 — Voice-follow integration

**Milestone:** M2 · **Depends on:** 04, 10, 11

## Goal

Wire engine → Aligner → PositionController → renderer in the prompter, using the SimulatedEngine, so the full voice-follow loop works end-to-end in the browser before touching the real mic.

## Read first

- SPEC §4, §7 step 8 (undo toast), §9 first two bullets
- `src/app.ts`, `src/ui/views/prompter.ts`, `src/core/position/controller.ts`, `src/core/align/aligner.ts`, `src/engines/simulated.ts`

## Tasks

1. **`src/ui/follow.ts`** (or similar): a `VoiceFollowSession` that owns one engine + one Aligner for the open script: subscribes to engine `result` events, feeds the aligner, applies accepted results to the PositionController with source `'align'`. Manual position changes (tap, later keys) call `aligner.setPosition`. Clean teardown on leaving the prompter.
2. **Detached follow:** while the user has detached (drag-scrolled), the aligner keeps tracking and position keeps updating (highlight moves) but the view doesn't scroll; Resume eases back.
3. **Large jump toast:** when a result has `jumped`, show a one-line toast "Jumped ahead N lines — Undo" for ~5 s; Undo calls `controller.undo()` + `aligner.setPosition`.
4. **Lost status:** when `aligner.state.lost`, show a subtle "Lost — tap a word to resync" indicator.
5. **Dev simulator panel** (dev builds or `?sim` query param): a text box to type "heard" words, and a "Replay sample with noise" button driving the SimulatedEngine at real-time speed, so a developer can watch tracking.
6. Performance: per-event handling (normalize + score + DOM class updates) must stay well under one frame for a 1,500-word script; add a dev-only timing log.

## Done when

- `npm run check` passes (unit-test any pure glue logic; e.g. the session with a fake engine and fake controller).
- Manual with `?sim`: replaying a noisy sample visibly tracks, never jitters backward, toast/undo works, tapping a word resyncs instantly.

## Out of scope

Web Speech (13), run control bar & mode switch (14).
