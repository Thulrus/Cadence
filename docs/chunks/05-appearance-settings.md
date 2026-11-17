# Chunk 05 — Appearance settings panel

**Milestone:** M1 · **Depends on:** 01, 04

## Goal

A settings view (and a quick-access overlay from the prompter) for every appearance setting, applied live and persisted.

## Read first

- SPEC §8 "Appearance settings" and "Layout" bullets
- `src/storage/settings.ts`, `src/app.ts` (how settings are applied), `src/ui/views/prompter.ts` (what reads them)

## Tasks

1. **Settings view** (`#/settings`), grouped sections; this chunk builds **Appearance**, and leaves clearly marked empty sections for Run, Engine, Advanced/Tuning (later chunks fill them):
   - Font family (a short list of legible system stacks: sans, serif, rounded, monospace, plus "Atkinson Hyperlegible" only if bundled locally, so no font CDN at runtime), font size (slider + number), line height, column width (30–50 chars), side margins, theme (dark / light / high-contrast / green-on-black), spoken-text dimming, highlight mode (word/line), reading-line position, mirror horizontal, flip vertical.
   - Live preview pane with a sample paragraph showing spoken/current/upcoming/direction/heading styles.
   - "Reset appearance" button.
2. **Quick overlay in the prompter**: a compact panel (font size −/+, theme, mirror) reachable from the prompter top bar without leaving the run, so position is not lost.
3. **Mirror/flip**: implement with CSS transforms on the text container, and make sure tap-to-word hit testing and the reading line still work when mirrored/flipped (flipY means the reading line is measured from the bottom visually; decide, document, and test the math in `scroll.ts`).
4. Make all controls keyboard accessible with proper labels; touch targets ≥ 44 px.

## Done when

- `npm run check` passes (add unit tests for any new pure helpers, e.g. flip-aware reading-line math).
- Manual: each setting changes the prompter live and survives reload; mirrored + flipped text still scrolls to the right place and tap-to-word hits the right word.

## Out of scope

Run/engine/tuning settings content (14, 13, 15).
