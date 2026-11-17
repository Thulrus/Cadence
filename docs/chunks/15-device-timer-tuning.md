# Chunk 15 — Fullscreen, wake lock, timer/pace, tuning panel

**Milestone:** M3 · **Depends on:** 14

## Goal

The remaining real-use features: fullscreen, keep-awake, elapsed timer with target-duration pace indicator, and the hidden advanced tuning panel for aligner constants.

## Read first

- SPEC §7 step 10, §8 last bullet, §9 last bullet
- `src/ui/views/prompter.ts` (control bar), `src/core/align/config.ts`, `src/storage/settings.ts`

## Tasks

1. **Fullscreen:** toggle button + `f` key (hook from 14). Handle `fullscreenchange`; hide the button where unsupported (iOS Safari).
2. **Wake lock:** acquire `navigator.wakeLock.request('screen')` while a run is active; re-acquire on `visibilitychange` back to visible; release on leaving the prompter. Where unsupported, show a one-time message ("Set your screen timeout to the maximum").
3. **`src/core/timing/pace.ts`**: pure pace math. Inputs: elapsed run time (excluding paused time, decide and document), fraction of script spoken (by display words), target duration. Output: projected total, delta vs target ("on pace", "1:20 behind", "0:45 ahead"), with a tolerance band. Tests.
4. **Timer UI:** elapsed time (mm:ss) in the control bar; when a target duration is set (Settings → Run, and quick-set from the prompter), show the subtle pace indicator. Visible even when controls auto-hide? Make it a setting (default: small, unobtrusive corner, stays visible).
5. **Tuning panel:** Settings → Advanced (hidden behind a "Show advanced" toggle): an auto-generated form for every key in `ALIGN_DEFAULTS` with its doc comment as help text, numeric bounds, "reset to defaults". Writes to `Settings.align`; the active Aligner picks up changes on the next session (or live, if simple).
6. Settings → Run section: default mode, timed WPM, target duration, controls auto-hide delay.

## Done when

- `npm run check` passes; pace math unit-tested.
- Manual: fullscreen toggles; device doesn't dim during a 5-minute run on desktop Chrome; changing a tuning value persists and takes effect.

## Human check (copy to PROGRESS.md)

- On the Android tablet: screen stays awake through a 15-minute run in voice mode.

## Out of scope

Docs and sample-loading UI (16).
