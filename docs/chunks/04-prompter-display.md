# Chunk 04 — Prompter display, scrolling, PositionController

**Milestone:** M1 · **Depends on:** 01, 02, 03

## Goal

The prompter view renders a script as word spans, keeps the current position at the reading line with smooth, stable scrolling, and supports manual control (tap a word, drag/scroll). Introduce the `PositionController` as the single source of truth for position; voice (chunk 12) and timed mode (chunk 14) feed into it later.

## Read first

- SPEC §4 (PositionController, Renderer), §8 (all), §9 first two bullets
- `docs/ARCHITECTURE.md` (Position, data model), `src/core/types.ts` (`PositionChange`)
- `src/core/text/index.ts` API

## Tasks

1. **`src/core/position/controller.ts`**: `PositionController` (pure). Holds `position` (token index), clamps to `[0, tokens.length]`. Methods: `set(p, source)`, `nudgeLines(n)` / `nudgeParagraphs(n)` (needs line/paragraph boundary info: paragraphs from `blocks`; lines can be approximated from the renderer via an injected `lineStarts` provider), `reset()`, `undo()` (one-level: return to the position before the last large jump). Emits `PositionChange`. Also holds `following: boolean` (auto-follow attached/detached) with `detach()`/`attach()` events. Unit tests.
2. **`src/ui/views/prompter.ts` renderer**:
   - Build DOM once per script: blocks → `<h*>`/`<p>`, words → `<span data-w=i>`; directions get a class; soft line breaks preserved. For 1,500–5,000 words this must build in < 100 ms; update states by toggling classes on only the words whose state changed (spoken / current / upcoming), never re-render everything.
   - `highlight: 'line'` setting: highlight the visual line of the current word instead of the word (compute line via `offsetTop` grouping).
   - Spoken text dimmed per `spokenDim`. Column width in `ch` from `columnChars`.
   - A subtle reading-line marker at `readingLinePct`.
3. **`src/ui/scroll.ts`**: `ScrollController`. Keep the current word's line at the reading line.
   - Pure, tested math: given current scrollTop, target, dt → next scrollTop (critically damped / exponential ease); **deadband** so target only updates when the current word moves to a new line; never scroll backward unless the position actually moved backward (`PositionChange.previous > position`).
   - rAF loop that sleeps when settled. Not disabled by `prefers-reduced-motion` (spec §8).
4. **Manual control**:
   - Tap/click a word → `controller.set(positionForWord(w), 'manual')` and re-attach following. Distinguish taps from drags (movement threshold + time) so scrolling doesn't set position.
   - Dragging/wheel scrolling the text detaches auto-follow; a large "Resume following" button appears; tapping it or a word re-attaches and eases back to position.
5. Route `#/prompter/<id>` loads the script from the store, marks `lastOpenedAt`, builds the index, starts at position 0. A minimal top bar with Back and Settings links is enough; full run controls are chunk 14.

## Done when

- `npm run check` passes; PositionController and scroll math have unit tests (including "no backward scroll on forward-only changes" and deadband behaviour).
- Manual: open a long script, tap words at various points: highlight jumps, view eases so that word sits at the reading line. Drag-scroll detaches; Resume re-attaches. Works in portrait and landscape and on window resize (recompute line positions on resize).

## Out of scope

Settings UI (05), keyboard (14), voice (12).
