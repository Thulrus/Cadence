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

## Fix — CI `npm ci` lockfile mismatch (2026-11-17)

- Chunk 03's lockfile was written by local npm 11, which pruned the optional `@emnapi/core`/`@emnapi/runtime` entries (needed by rolldown's wasm binding). CI's Node 22 npm 10 then failed `npm ci`. Regenerated with npm 10.
- Gotcha: **change dependencies with `npx npm@10 install …`** (matches CI's Node 22), and verify with `npx npm@10 ci` before committing.

## Chunk 04 — Prompter display, scrolling, PositionController — DONE (2026-11-17)

- Built: `core/position/controller.ts` (`PositionController`: clamped `set`, `nudgeLines`/`nudgeParagraphs`, `reset`, one-level `undo`, `following` + `detach`/`attach`, events `change`/`follow`); `ui/scroll.ts` (pure `easeStep`, `planScroll` with deadband + no-backward rule, `classifyGesture`; rAF `ScrollController`); `ui/wordstate.ts`; real `ui/views/prompter.ts` (`buildScriptDom`, incremental class updates, line-highlight mode, tap/drag/wheel, Resume button, ResizeObserver relayout).
- Deviations / contract changes: `undo()` toggles (undo again returns to where you were) rather than clearing. Undo threshold `POSITION_CONFIG.undoJumpTokens = 12`. `reset()` also re-attaches following. The current line is _centred_ on the reading line. Mirror/flip transform is on `.prompter-stage` (text + reading-line marker together). Added a global `[hidden] { display:none !important }` (`.btn` display was overriding it).
- Gotchas for later chunks: the controller is created inside the prompter view's `mount()` (one per script); chunks 12/14 should wire voice/timed/keys there (or lift it into a small session object). Detach is triggered by wheel, pointer drag (>10px), or touch `pointercancel` (native pan), NOT by scroll events, so programmatic scroll never detaches. Mouse gets grab-to-scroll; the scrollbar is hidden. Spoken dim is `opacity: var(--prompt-spoken-opacity)` (the setting value is the opacity). The renderer's line-starts provider reads layout lazily and is cached until relayout.
- Deferred: keyboard/clicker nudges + undo UI (14). Reading-line marker look may want tuning in 05.
- Human check pending: on the Android tablet and desktop, open a long script; tap words at various points (highlight jumps, word eases to the reading line); drag-scroll detaches and shows "Resume following"; Resume and tapping a word re-attach; rotate portrait↔landscape and resize the window: the current line stays on the reading line. Try `__cadence.settings.update({ appearance: { highlight: 'line' } })` and `mirrorX`/`flipY`. (Agent verified these in headless Chrome at 800×1100 and 1200×700 with a 4,500-word script: mount ≈ 43 ms incl. a frame.)

## Chunk 05 — Appearance settings panel — DONE (2026-11-17)

- Built: real `#/settings` view (`views/settings.ts`: `appearanceFields()` + live preview + Reset appearance; empty `section[data-section=run|engine|tuning]` placeholders); `components/fields.ts` (`rangeField` slider+number, `choiceField` segmented radios, `selectField`, `toggleField`, each with `sync()`); `components/quickpanel.ts` ("Aa" in the prompter bar: font −/+, theme, mirror, flip, "All settings…"). Helpers in `ui/appearance.ts`: `FONT_FAMILIES`, `fontFamilyId`, `stepFontSize`, `THEME_LABELS`, `APPEARANCE_UI_CONFIG.fontStepPx`.
- Deviations / contract changes: the prompter bar's "Settings" link is replaced by the quick panel (which links to all settings). No Atkinson Hyperlegible: not bundled, and no font CDN, so four system stacks only (an unknown stored stack shows as "Custom"). Spoken dimming is shown as "brightness %" (it is the opacity).
- Mirror/flip decision (documented in `scroll.ts`): the whole stage (text + reading-line marker) is transformed, so scroll math stays in layout coordinates and `readingLinePct` is measured from the top as the reader sees it in the glass; on the raw screen a flipped line sits at 100 − pct. `screenReadingLinePct` and `dragScrollTop` are tested. Hit testing needs no math (headless Chrome: mirrored+flipped tap hit the right word, which landed at 66.9% vs marker 66.8%).
- Gotchas for later chunks: chunk 14's `[`/`]` should use `stepFontSize`. The quick panel handles Escape on `document` and swallows (capture phase) the pointerdown of a tap outside it, so dismissing never moves the position; chunk 14's keys should ignore events while focus is in `.quick-panel` or a form field.
- Deferred: none.
- Human check pending: on the tablet and desktop, change every appearance setting and confirm the prompter updates live and survives reload; in the prompter use "Aa" (size −/+, theme, mirror, flip) mid-script and confirm the position is kept; with mirror + flip on, check scrolling and tap-to-word against real prompter glass if available.

## Chunk 06 — PWA, offline shell, deploy, README — DONE (2026-11-17)

- Built: `vite-plugin-pwa` v2 (generateSW, `registerType: 'prompt'`, precaches JS/CSS/HTML/icons/manifest, relative `start_url`/`scope`); original icon (`public/icon.svg`, maskable variant) → PNGs via `scripts/gen-icons.sh` (Inkscape, PNGs committed); `ui/update.ts` "Update available — Reload / Later" banner (held back on the prompter route, applies only on tap); SW registration in `main.ts`; README (privacy, markup, dev, deploy).
- Deviations / contract changes: `createApp(container, applyUpdate?)`; `App` now also exposes `notices` and `updates`. `injectRegister: false` (we register manually). New dev deps: `vite-plugin-pwa`, `workbox-window` (bundled into the app as the SW client, ~2 kB gz; required peer of the plugin's register module).
- Gotchas for later chunks: the SW exists only in production builds (`npm run dev` has none). In prompt mode a first-visit page is not SW-controlled, so the plugin's reload-on-`controllerchange` never fires; `main.ts` reloads itself in that case. Chunk 18 should add model caching via a `workbox.runtimeCaching` rule or its own Cache Storage, not by growing the precache. Agent verified in headless Chrome under `vite preview --base /Cadence/`: SW scope `/Cadence/`, offline reload + routes + saved scripts load, update banner hidden on prompter / shown on library / Reload loads the new build.
- Deferred: "Manual device test checklist" in README (16).
- Human check pending: **M1 milestone.** Push to GitHub, confirm the Pages deploy succeeds, open on the Android tablet, "Install app", turn on airplane mode, relaunch: app and saved scripts load. Also check the installed icon looks right (maskable crop) and the Chunk 03–05 human checks if not yet done.
