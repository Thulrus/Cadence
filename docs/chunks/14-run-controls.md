# Chunk 14 — Run controls, timed mode, keyboard/clicker

**Milestone:** M3 · **Depends on:** 13

## Goal

One-thumb run controls: mode switch (Voice / Timed / Manual) usable mid-talk, timed-scroll fallback, auto-hiding controls, and full keyboard / Bluetooth presentation-clicker support.

## Read first

- SPEC §5.4, §9 (all)
- `src/ui/views/prompter.ts`, `src/ui/follow.ts`, `src/core/position/controller.ts`, `src/storage/settings.ts`

## Tasks

1. **`src/core/timing/timed.ts`**: pure `TimedScroller`. Given WPM and the index, advances position at a constant words-per-minute from the current position, driven by injected time (`tick(now)`). Pausable; changing WPM mid-run keeps position; respects `setPosition` from taps. Counts display words, not tokens, so expanded numbers don't slow it. Tests.
2. **Mode switch:** one tap switches Voice ↔ Timed ↔ Manual without losing position. Switching away from Voice stops the engine; switching to Voice restarts it and re-centres the aligner at the current position. Persist last mode.
3. **Control bar:** big Pause/Resume (pauses listening in Voice, pauses scroll in Timed), mode segmented control, WPM −/+ in Timed, status badge + meter (from 13), Back, quick settings. Large targets, high contrast.
4. **Auto-hide:** during a run, controls fade out after ~3 s of no interaction; reappear on a tap near the top/bottom edge (taps in the text area still mean "set position"). Never hide while a toast or the settings overlay is open.
5. **Keyboard / clicker** (`src/ui/keys.ts` with a pure, tested keymap): Space = pause/resume; ArrowUp/ArrowDown = nudge one line; PageUp/PageDown = nudge one paragraph (presentation clickers send these; some send ArrowLeft/Right or `b`/`.` too; map those sensibly and document); Home = start; `[` / `]` = font size −/+; `f` = fullscreen (wired in 15; leave the hook); `Esc` = show controls. Ignore keys while typing in inputs. Nudges call the controller and resync the aligner.

## Done when

- `npm run check` passes; TimedScroller and keymap unit-tested.
- Manual: switch modes mid-run repeatedly with no position loss; timed mode scrolls smoothly at the set WPM; controls auto-hide and come back; arrow/page keys nudge.

## Human check (copy to PROGRESS.md)

- Pair a Bluetooth presentation clicker with the tablet; confirm forward/back buttons nudge position.

## Out of scope

Fullscreen/wake lock/timer/tuning (15).
