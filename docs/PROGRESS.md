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

## Chunks 07+08 — Numbers & scripture; weights, phonetics, similarity — DONE (2026-11-17)

- Built: `core/text/numbers.ts` (`numberRule`: digits → words incl. years, ordinals, decades, decimals, %, $, times, a.m./p.m., ranges; then a collapse pass that rewrites any spoken multiplier phrase to the standard cardinal, so "fifteen hundred" = "one thousand five hundred" = `1500` = `1,500`); `core/text/scripture.ts` (`scriptureRule` + `BOOKS` table: Bible, BoM, D&C, PoGP; ordinal/roman/attached prefixes; "to"/"thru" after a ref → "through"). `SEQUENCE_RULES = [scriptureRule, numberRule]`. `core/align/weights.ts` (20-token windows for df; stopwords 0.1, ≤2 letters 0.15, else 0.25–1; `isStrongAnchor` ≥ 0.6), `phonetic.ts`, `similarity.ts` (`tokenSimilarity`, homophone table, bounded memo). `buildScriptIndex` now fills `weight` and `phonetic` via `weighTokens`.
- Deviations / contract changes: canonical forms are whatever the pipeline produces on both sides (documented in numbers.ts), not always the most natural reading: bare 4-digit 1100–2099 read as years; `:00` times drop the minutes; abbreviations (Phil., Cor.) only expand before `chapter:verse`. `MatchToken.phonetic` holds the primary key only; `tokenSimilarity(a, b)` takes strings and looks keys up itself (memoized).
- New runtime dependency: `double-metaphone@2.0.1` (MIT, ESM, no deps, ~3 kB gz). The reference Double Metaphone port; reimplementing ~800 lines of rules isn't worth it.
- Gotchas for later chunks: `tokenSimilarity` returns 0 for Levenshtein ratios < 0.5 and only gives phonetic credit to tokens ≥ 3 letters (short-word keys collide a lot: "the"/"to"/"do"). Within one 20-token window repeated words aren't penalized (df counts windows), so tiny scripts lean on length only.
- Known gaps (documented in numbers.ts): `mp3`-style letter+digit mixes, dash-joined words before a multiplier ("a hundred-fold"), "ten o'clock" vs `10:00`, roman numerals outside book prefixes.
- Deferred: none.
- Human check pending: none.

## Chunks 09+10 — Aligner scoring function & state machine — DONE (2026-11-17)

- Built: `core/align/config.ts` (`AlignConfig`, `ALIGN_DEFAULTS`, `resolveConfig`), `score.ts` (`scoreWindow` = one banded local-alignment DP over the window giving every end q at once, `gaps` as explicit DP layers; `bestCandidate`; `isAcceptable(c, cfg, 'normal'|'lost')`), `aligner.ts` (`Aligner.feed/setPosition/reset/setConfig/state`; API in the module header). Warm whole-script scoring (~3–5k tokens) ≈ 5 ms; window-45 call ≪ 1 ms.
- Deviations / contract changes (all documented in the modules):
  - Distance penalty is measured from `p − 1` (where the tail ends if nothing new was said), not `p`.
  - Pair credit = `min(script weight, tail weight) · similarity`; score = raw / weight of the aligned tail suffix (tail start is local, tail end anchored). Tail-token weights come from the script's weight for the same word; unknown words weigh 1.
  - A candidate must END on a true match (no trailing substitution/deletion). Acceptance needs ≥ 1 content (non-stopword) match, so stopword-only tails never move.
  - New config: `jumpMinMatched` (4: a forward move whose match starts past `p + maxGaps` skips text and needs more evidence), `backtrackWindow` (60: backward-only reread search, tried only when the forward window fails), `backtrackMinTokens` (3), `lostDistancePenaltyPerToken`, `lostStepMs`, `activityGapMs`, `allowBacktrack`. `matchSimilarity` 0.7. `similarity.phoneticMinToken` raised to 4 (Double Metaphone: "and" = "want").
  - `feed` returns `AlignResult | null` (null = nothing observable changed) with `moved`, `jumped`, `lost`, `score`, `mode`, `final`. Lost-flag flips also produce a result.
- Gotchas for chunk 11/12: the tail is rebuilt from the full hypothesis each event (no delta trusting); `setPosition` drops earlier speech (current-utterance words heard before the resync are ignored). Lost mode widens by time: step k of `lostWidenSteps` every `lostStepMs` after `lostAfterMs`, last step = whole script. The defaults are untuned first guesses; chunk 11 should tune them with the harness. Perf tests take the best of several runs (parallel Vitest on 4 cores made single-shot timings flaky).
- Deferred: none.
- Human check pending: none.

## Chunk 11 — Simulated engine & ASR-noise harness — DONE (2026-11-17)

- Built: `engines/synth/` (pure + seeded: `plan.ts` script → spoken items with ground truth, `noise.ts` injectors + `NOISE_PROFILES`, `speak.ts` timing/utterances/cumulative interims, `simulateSpeech()`); `engines/simulated.ts` (`SimulatedEngine`: `typeWords`, `replay(events, speed)`, `emit`, `cancel`; `parseTranscript`); `test/harness/` (`run.ts` metrics, `scenarios.ts`, one test file per sample script, `sweep.test.ts` tuning tool: `V='{"a":{...}}' HARNESS_SEEDS=5 npx vitest run test/harness/sweep.test.ts`); 3 fixtures in `test/fixtures/scripts/`.
- Deviations: speak/noise live in `src/engines/synth/` (not `test/harness/`) so the dev panel can use them; named `synth` because `engines/simulated/` would shadow `simulated.ts`. `npm test` passes `--silent=false` (Vitest's non-TTY reporter hides passing tests' logs) so the metrics table prints. Harness uses 3 seeds by default.
- Aligner changes (found by the harness, all in `score.ts`/`aligner.ts`, documented there):
  - DP maximized raw score but candidates compare normalized score, so a misheard prefix sank the right spot and an exact copy of a repeated phrase further on won. Now the DP maximizes `raw − prefixRatio · normalizer` (keeps an older prefix only if it matches ≥ 0.7), and a matched pair normalizes by the pair weight it earns (a fuzzy match of a word the script lacks no longer weighs 1).
  - `bestCandidate(c, p, nearMargin, nearSlack)`: within 0.1 of the best, prefer the nearest (±4 tokens compete on score). Normal window has a monotonic bias: a near hold/forward candidate within the margin beats a retreat.
  - New config: `prefixRatio` 0.7, `nearMargin` 0.1, `nearSlack` 4. Changed: `windowAhead` 40 → 80, `maxGaps` 2 → 3. Paragraph skips < 80 tokens are now caught in the normal window, not lost mode (aligner test updated).
- Tuning (5 seeds, mean within-5 over 3 scripts, before → after): light 98.9 → 99.2%, heavy 91.0 → 93.7%, ad-lib 98.9 → 99.0%, skip 97.0 → 98.3%, reread 98.0 → 98.2%. Spurious backward moves on interim results 37 → 0. Max overshoot (rereads excluded) 26 → 4 tokens. Skip recovery mean 2.3 → 1.6 s, worst 6.2 → 4.6 s (worst cases: the first post-skip words are garbled/dropped).
- Gotchas: "known truth" = truth of the newest recognized word, so recognizer latency isn't charged to the aligner; real-world lag will be higher by ~0.5 s. Corrective backward moves (snapping back onto the truth after a small overshoot on a repeated phrase) are counted separately; ≤ 1 seen. Harness takes ~8 s of `npm test` (parallel per script).
- Deferred: none.
- Human check pending: none.

## Chunk 12 — Voice-follow integration — DONE (2026-11-17)

- Built: `ui/follow.ts` (`VoiceFollowSession`: engine `result` → `Aligner.feed` → `controller.set(p, 'align')`; every non-`align` controller change → `aligner.setPosition`; events `jump`/`lost`/`status`/`level`/`timing`; `resync()`, `undoJump()`, `destroy()`; helpers `linesBetween`, `jumpMessage`, `TimingStats`), `ui/devsim.ts` (simulator panel: type heard words; "Replay from here" with clean/light/heavy noise at 1/2/4×), prompter wiring: jump toast "Jumped ahead N lines — Undo" (5 s, `PROMPTER_CONFIG.jumpToastMs`, hidden on any manual change), "Lost — tap a word to resync" badge, tap re-syncs and clears lost even on the same word, `Settings.align` changes apply live. `simulateSpeech` gained `from`.
- Deviations: the simulator (and the session) only exist when `simEnabled()`: dev builds, or `?sim` in the page URL before the hash (e.g. `/Cadence/?sim#/prompter/<id>`). Without it the prompter has no voice follow until chunk 13. Detached follow needed no new code (controller + renderer already update the highlight while not following). Dev handle `window.__cadenceFollow` (sim mode only). The synth module is statically bundled (a few kB).
- Perf: aligner warm ≈ 0.3–0.6 ms/event on the 1,441-token talk (Node and an in-page batch; lost-mode whole-script ≈ 2.5 ms). CPU profile of a 4× replay in headless Chrome: page ~90% idle, aligner ≈ 0.6 ms/event, scroll tick + layout reads similar. The dev perf log (`console.debug`, mean/max per 50 events) shows higher wall-clock numbers under headless software rendering (mean 4–9 ms, spikes to 40 ms); worth reading on the tablet.
- Verified in headless Chrome (puppeteer, not committed): noisy replay tracks with 0 backward moves of the current word and keeps it on the reading line; typing a phrase ~70 words ahead jumps with "Jumped ahead 14 lines", Undo returns; repeated off-script speech shows Lost; tapping a word resyncs and clears it.
- Gotchas for 13: create the real engine and call `startFollow(engine)` in `prompter.ts` (it registers cleanup); `session.start()` must then come from the Start button's gesture. The sim panel shows engine status; 13's badge should listen to `session.events.on('status')`. `test/harness/perf.test.ts` is a skipped timing tool (`PERF=1`).
- Deferred: none.
- Human check pending: `npm run dev`, open a long script, expand "Simulator", "Replay from here" at light/heavy: tracking never jitters back; drag-scroll away mid-replay (highlight keeps moving, no scroll), Resume eases back; type a sentence from far ahead → toast → Undo; type nonsense repeatedly → Lost badge; tap a word → resync. On the tablet: open with `?sim` and watch the `[cadence]` perf log via remote devtools.

## Owner check — Chunk 12 simulator (2026-11-17)

- Owner tested the simulator in the browser: the prompter follows simulated speech well and showed no false jumps to the wrong text. Tablet perf log (`?sim`) not yet checked.

## Chunk 13 — Web Speech engine & status UI — DONE (2026-11-17)

- Built: `engines/webspeech.ts` (`WebSpeechEngine`; pure `utteranceEvents` result mapping, `restartDelay` 250 ms ×2 → 2 s cap reset by a result, `classifyError`; local SpeechRecognition typings), `engines/micmeter.ts` (`MicMeter`, fail-soft, `levelFromSamples` dB scale), `ui/capabilities.ts` (`detectCapabilities`, `resolveEngine`), `statusBadge` in `follow.ts`. Prompter bar: status badge, level meter, Start/Pause listening button; one-time privacy dialog (its "Start listening" click is the gesture); no-permission notice. Settings → Speech engine: choice, language (English variants), mic meter toggle.
- Contract changes: `EngineSettings` gained `micMeter` (default true) and `privacyNoticeSeen` (no version bump; missing fields default). `simEnabled(search)` lost its `dev` arg: **dev builds now use real Web Speech when available**; the simulator (and its panel) appears with `?sim`, or in dev when Web Speech is missing. Listening never auto-starts (sim included): press Start.
- Mapping: each newly final result → its own final event; remaining interim results joined into one interim. A result list shorter than the tracked index is treated as fresh. `audio-capture` gives up after 3 in a row; `network` keeps retrying with a "needs internet" message.
- Engine choice `offline` falls back to Web Speech with a note until M4. Unsupported/insecure → info notice, voice controls hidden, manual scroll only (chunk 14 should default `run.mode` to manual from `resolveEngine`; I didn't change stored settings). Language/meter changes apply on the next start/mount.
- Gotchas: modern Chrome exposes unprefixed `SpeechRecognition` (preferred over `webkit…`). Headless Chrome denies recognition (`not-allowed`) and `getUserMedia`, so agent smoke tests used an injected fake recognizer (puppeteer, not committed): privacy dialog once → Listening → tracking → `end` → "Recognizer restarting" → Listening → Pause → denied → "No mic permission" + notice. Meter not verified on real hardware.
- Deferred: Space = pause/resume (14); controls auto-hide (14).
- Human check pending: **M2 milestone.** Desktop Chrome (`npm run dev`, localhost): read a sample aloud, check it tracks; stay silent ~1 min then resume (auto-restart); deny mic permission → "No mic permission". Android tablet, Chrome, built-in mic at arm's length in a room with some echo: read the 1,500-word sample at natural pace; note lag, any backward jitter, restart gaps, and whether the mic meter breaks recognition (if it does, turn off Settings → Mic level meter and report). Then push and redeploy.
