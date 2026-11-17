# Progress & Handoff Log

Newest entry at the bottom. Each agent appends **one** entry when finishing (or blocking on) a chunk. Keep entries short (≤ ~15 lines) — the next agent reads this whole file. Record only what the next agents need: deviations from the brief, contract changes, gotchas, deferred items. Don't restate the brief.

Entry template:

```
## Chunk NN — <title> — DONE | BLOCKED (YYYY-MM-DD)
- Built: <one or two lines>
- Deviations / contract changes: <or "none">
- Gotchas for later chunks: <or "none">
- Deferred: <items pushed to a later chunk, with chunk #>
- Human check pending: <copied from brief, or "none">
```

---

## Chunk 00 — Project scaffold & plan — DONE (2026-11-17)

- Built: Vite 8 + TypeScript 7 + Vitest 5 + Prettier scaffold; `npm run check` (format, typecheck, test, build) passes. Contracts in `src/core/types.ts`, typed `Emitter` in `src/core/emitter.ts`. GitHub Actions workflow `.github/workflows/ci.yml` runs `check` on every push/PR and deploys `dist/` to Pages on `main` with `BASE_PATH=/<repo>/`.
- Deviations / contract changes: none.
- Gotchas: TypeScript 7 is the native (Go) compiler; `tsc` works as usual. `@types/node` is in `types` only so `vite.config.ts` can read `process.env` — don't use Node APIs in `src/`.
- Deferred: none.
- Human check pending: owner must create the GitHub repo `Cadence`, push `main`, and set **Settings → Pages → Source: GitHub Actions**. Agents do not push.

## Chunk 01 — App shell, view routing, settings store — DONE (2026-11-17)

- Built: `storage/settings.ts` (typed `SettingsStore`, per-field validation + clamping via `SETTINGS_LIMITS`, `migrate()` hook, `memoryStorage()` for tests); `ui/router.ts` (hash router, pure `parseRoute`/`routeHash`); placeholder views in `ui/views/`; `ui/appearance.ts` (settings → `data-theme`/`data-highlight` + `--prompt-*` CSS vars); `app.ts` composition root; four themes in `style.css`.
- Deviations / contract changes: `readingLinePct` lives in `appearance` (per brief), not `run`; ARCHITECTURE.md updated. `#/editor` with no id is a valid route (new script).
- Gotchas for later chunks: `update()` merges within a group and silently drops invalid values; `align` overrides can only be removed via `reset('align')`. Prompter CSS should consume `--prompt-*` vars (`--prompt-scale-x/y` for mirror/flip, `--prompt-spoken-opacity`, `--prompt-reading-line`). Dev console handle: `__cadence.settings` / `__cadence.router`.
- Deferred: none.
- Human check pending: `npm run dev`, click through the four nav links and use Back; run `__cadence.settings.update({ appearance: { theme: 'light' } })` (and `high-contrast`, `green-on-black`) and confirm colours change and persist across reload.

## Chunk 02 — Script parsing, normalizer, ScriptIndex — DONE (2026-11-17)

- Built: `core/text/types.ts` (data model), `parse.ts` (`parseScript`), `normalize.ts` (`normalizeWords`/`normalizeWord`/`normalizeText`, documented contraction tables), `index.ts` (`buildScriptIndex`, `wordForPosition`, `positionForWord`). 1,500-word build is a few ms.
- Deviations / contract changes: added `DisplayWord.lineBreakBefore?` and `emphasis?` (ARCHITECTURE.md updated). `wordForPosition` clamps (past end → last token's word; -1 if no tokens).
- Gotchas for later chunks: chunk 07 plugs into `SEQUENCE_RULES` in `normalize.ts`; rules see lowercased, curly-quote-normalized raw words with punctuation still attached (e.g. `"3:16,"`) and must keep `src` non-decreasing. Rules may emit multi-word text (it's split on whitespace later). `buildScriptIndex` normalizes each run of consecutive speech words within a block together, so a scripture ref broken by a `[direction]` or a block boundary won't be joined. `'d` → "would", `'s` → "is" only for pronoun/wh-stems in `IS_CONTRACTION_STEMS`, otherwise possessive (apostrophe dropped). Direction display text keeps its brackets.
- Deferred: none.
- Human check pending: none.

## Chunk 03 — Script library & import/export — DONE (2026-11-17)

- Built: `storage/scripts.ts` (`ScriptStore` over raw IndexedDB with a write-through cache; `openScriptStore()` falls back to `memoryBackend()` with `persistent === false` and the app shows a warning); `core/text/stats.ts` (spoken word count, duration); `ui/files.ts` (validation, naming, download, picker, drop target); `ui/autosave.ts`; `ui/components/` (`h()`/`button()`, `navBar`, app-level notices); real library and editor views.
- Deviations / contract changes: `list()`/`get()` are **synchronous** (read from the cache); writes are async. Added `markOpened(id)` (sets `lastOpenedAt`, not `updatedAt`). `createApp` is now `async` (awaits the store). Views get a `ViewDeps` object (`ui/views/deps.ts`: scripts, settings, notices, navigate) via closures in `app.ts`; the router now mounts into `.view-host` inside `#app`, below `.notices`. Dropping or picking a `.json` file imports it as a backup. New dev dependency: `fake-indexeddb`.
- Gotchas for later chunks: library "Open" and editor "Start prompter" already call `markOpened`, then route to `#/prompter/<id>`; the prompter (04) should read `deps.scripts.get(id)` and handle a missing id. At `#/editor` the editor creates the record on first input and swaps the URL with `history.replaceState` (no remount). Use `deps.notices.show()` for non-blocking messages. The nav bar no longer lists Editor/Prompter.
- Deferred: none. (A 404 for `/favicon.ico` in dev is expected until chunk 06.)
- Human check pending: in `npm run dev`, create → edit → reload → still there; rename/duplicate/delete; "Load file" with a .txt/.md and drag-drop onto library and editor; Export backup then Import backup. On the Android tablet, confirm "Load file" opens the picker and both exports download a file. (Agent smoke-tested these flows in headless Chrome, except the real file picker and downloads.)
