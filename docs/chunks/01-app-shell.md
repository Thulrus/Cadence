# Chunk 01 — App shell, view routing, settings store

**Milestone:** M1 · **Depends on:** 00

## Goal

Replace the placeholder `src/main.ts` with a real app skeleton: a composition root, a tiny view router, a typed persisted settings store, and theme CSS variables. Later chunks plug views into this.

## Read first

- `docs/ARCHITECTURE.md` (Settings section and directory layout)
- SPEC §8 "Appearance settings" bullet (so the settings shape covers it), §5.4, §9 (run mode names)
- `src/core/emitter.ts`

## Tasks

1. **`src/storage/settings.ts`**: `Settings` type and `DEFAULT_SETTINGS`, grouped as in ARCHITECTURE.md:
   - `appearance`: `fontFamily`, `fontSizePx`, `lineHeight`, `columnChars` (30–50), `marginPct`, `theme` (`'dark' | 'light' | 'high-contrast' | 'green-on-black'`), `spokenDim` (0..1), `mirrorX`, `flipY`, `highlight` (`'word' | 'line'`), `readingLinePct` (default 33).
   - `run`: `mode` (`'voice' | 'timed' | 'manual'`), `timedWpm` (default 150), `targetDurationSec` (nullable).
   - `engine`: `choice` (`'auto' | 'webspeech' | 'offline'`), `lang` (`'en-US'`).
   - `align`: `Record<string, number | boolean>` overrides (empty by default; chunk 10 defines the keys).
   - `SettingsStore` class: `get()`, `update(partial-by-group)`, `reset(group?)`, emits `change`. Takes a storage adapter (`{ getItem, setItem }`) so tests can use an in-memory one. Key `cadence.settings.v1`; deep-merge stored JSON over defaults; ignore invalid/corrupt values per field; include `version: 1` and a `migrate()` hook.
   - Tests: defaults, merge, corrupt JSON, invalid field types, reset, change events.
2. **`src/ui/router.ts`**: minimal view router. Views: `library`, `editor`, `prompter`, `settings`. Use the URL hash (`#/library`, `#/editor/<id>`, `#/prompter/<id>`, `#/settings`) so the back button works and GitHub Pages needs no rewrites. A view is `{ mount(container, params): void; unmount(): void }`. Unknown routes → library.
3. **Placeholder views** in `src/ui/views/` for each route (a heading and nav links is enough); later chunks fill them in.
4. **`src/app.ts`**: composition root that creates the `SettingsStore`, the router, and applies appearance settings to the document (`data-theme` on `<html>`, CSS vars for font/size/line height/column width). Re-applies on settings `change`.
5. **`src/style.css`**: theme tokens for all four themes under `:root[data-theme=...]` (bg, fg, spoken-dim colour, highlight, direction colour, heading colour, UI chrome colours). Large, legible defaults. Full-viewport app layout that works portrait and landscape.

## Done when

- `npm run check` passes; settings store is unit-tested.
- `npm run dev` shows the shell; hash navigation between the four placeholder views works; changing `data-theme` via a quick dev-console `settings.update` call visibly changes colours (expose the store on `window.__cadence` in dev builds only, via `import.meta.env.DEV`).

## Out of scope

Real view content (chunks 03–05), any persistence besides settings.
