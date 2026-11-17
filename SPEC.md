# Voice-Following Teleprompter — Project Spec

A static, backend-free web app that displays a script and **advances automatically as the speaker reads it aloud**, by listening through the microphone and aligning what it hears to the script. Hosted on GitHub Pages. Runs on a tablet (primary), phone, or desktop browser.

## 1. Goals

- The prompter follows the speaker's *voice*, not a fixed scroll speed, so delivery sounds natural (pauses, ad-libs, emphasis don't desync it).
- Zero backend. Pure static files deployable to GitHub Pages.
- Robust in real use: it must degrade gracefully when recognition is wrong, the speaker ad-libs, skips ahead, or repeats a line.
- Excellent legibility and control, usable on a lectern or beside a DSLR lens without fiddling.
- Works offline once installed (important: a church building may have poor connectivity).

### Use cases
1. **YouTube filming.** DSLR records video and audio separately. The prompter runs on a *second device* (tablet/laptop/old phone) placed next to or under the lens. It only needs the mic. It does **not** record or touch the camera.
2. **Giving talks (church).** Tablet on a lectern, reading a ~10–20 min talk, mostly verbatim. Occasional ad-libs and scripture quotes. Room may have echo/PA noise. Speaker needs to be able to glance, trust it, and recover from errors with one tap.

### Non-goals
- No video/audio recording, camera access, or overlays on other apps.
- No accounts, cloud sync, analytics, or server components.
- No Google Docs API integration (user pastes text or loads a file).
- English only for v1.

## 2. Platform targets

| Target | Priority |
|---|---|
| Chrome on Android tablet/phone | Primary |
| Chrome/Chromium on desktop (Linux/Windows/macOS) | Primary (dev + filming) |
| Safari on iPadOS/iOS | Best effort (document limitations) |
| Firefox | Manual/timed modes only until offline ASR engine exists (no Web Speech API) |

Open question for the owner: which tablet/OS/browser will be used at church? Design assumes Chrome on Android but must not hard-fail elsewhere. Detect capabilities at startup and show clear messages.

## 3. Tech stack

- **Vite + TypeScript**, vanilla DOM (no heavy framework; Preact or Lit acceptable if it genuinely simplifies the UI).
- **Vitest** for unit tests (alignment logic is the critical, testable core).
- Static output in `dist/`, deployed by a **GitHub Actions workflow to GitHub Pages**. Vite `base` must work for a project-pages subpath (`/repo-name/`).
- **PWA**: web manifest + service worker (precache app shell; later, cache the ASR model) so it is installable and works offline.
- No runtime network requests except those the browser makes itself for Web Speech (see §5).

## 4. Architecture

Keep these modules decoupled behind small interfaces:

```
ScriptStore  ->  Tokenizer/Normalizer  ->  ScriptIndex (words, lines, IDF weights)
                                                  ^
RecognizerEngine (Web Speech | Offline WASM | Simulated) -> Aligner -> PositionController -> Renderer
                                                                              ^
                                       Manual input (tap, keys, clicker) ----+
```

- **RecognizerEngine** interface: `start()`, `stop()`, event stream of `{ words: string[], isFinal: boolean, timestamp }`. The aligner must not know which engine is behind it.
- **Aligner**: pure function/class, no DOM, fully unit-tested.
- **PositionController**: owns the single source of truth `position` (index of next expected script word), merges automatic alignment with manual overrides, emits changes to the renderer.
- **Renderer**: draws text, highlight, and smooth scrolling.

## 5. Speech recognition engines

### 5.1 Engine A — Web Speech API (phase 1)
- `SpeechRecognition` / `webkitSpeechRecognition`, `continuous = true`, `interimResults = true`, `lang = 'en-US'` (configurable).
- **Must auto-restart** on `end`/`error` (the browser stops after silence or ~minutes). Restart with small backoff; surface a "listening" indicator state.
- Chrome sends audio to Google servers; **tell the user** in the UI/README. Needs connectivity.
- Handle known quirks: on Android Chrome, interim results can be cumulative or repeat earlier words. Diff each result against what was already consumed rather than trusting it as a delta.
- Requires a user gesture to start and HTTPS (GitHub Pages is HTTPS).

### 5.2 Engine B — Offline WASM recognizer (phase 3)
- Streaming ASR running fully in-browser (evaluate Vosk-browser, sherpa-onnx WASM, or a small Whisper variant via transformers.js/WebGPU). Choose by: latency (<~500 ms to word), model size, accuracy in a reverberant room, Android Chrome performance.
- Download the model on first use, store in Cache Storage/IndexedDB, show progress, work offline thereafter.
- Same `RecognizerEngine` interface. Settings let the user pick the engine; auto-fallback if Web Speech is unavailable.

### 5.3 Engine C — Simulated (dev/test)
- Feeds the aligner from (a) a text box where a developer types "heard" words, and (b) a replay of a JSON transcript with timestamps and injected errors. Needed for tests and for developing without a mic.

### 5.4 Non-voice fallback modes
- **Timed scroll:** constant words-per-minute auto-advance (adjustable), pausable.
- **Manual:** tap/drag/keys only.
These must always be available, and the user can switch mid-talk with one tap.

## 6. Script handling

- **Import:** paste text; load `.txt` / `.md` file; drag-and-drop. Multiple saved scripts in a library (IndexedDB or localStorage), with rename/delete/duplicate. Export/backup as a file.
- **Markup the display understands** (all optional):
  - `# Heading` lines → shown larger, **not** spoken (excluded from matching, or matched with very low weight).
  - `[bracketed text]` → stage directions ("[pause]", "[look up]"); displayed in a distinct color, skipped by the matcher.
  - Blank line = paragraph break (preserve visually).
- **Tokenizer/normalizer** (applies to both script and recognized text):
  - Lowercase, strip punctuation, split contractions consistently ("don't" matches "don't" and "do not"), normalize curly quotes/dashes.
  - **Numbers:** expand digits in the script to spoken words for matching ("1,000" → "one thousand", "2026" → "twenty twenty six"). Keep display text unchanged. Recognizers often emit digits, so also normalize recognized digits to words.
  - **Scripture references** are common in church talks: "John 3:16" is spoken "John three sixteen"; "1 Nephi 3:7" → "first Nephi three seven" (handle ordinal book prefixes: 1/2/3 → first/second/third). Implement a small rule-based expander for `Book chapter:verse` patterns.
  - Keep an index mapping each *matching token* back to its *display span* so highlighting is exact.
- Compute **IDF-style weights** per token over the script: rare/long words are strong anchors; stopwords ("the", "and", "of") and 1–2 letter words are weak.

## 7. Alignment algorithm (the core)

State: `position p` = index of the next script token the speaker is expected to say. Maintain a rolling buffer of the most recent recognized tokens.

On every recognizer event (interim or final):

1. Take the last **K ≈ 4–8** recognized tokens (the "tail").
2. Define a **search window** over script tokens: `[p − back, p + ahead]` with defaults `back ≈ 5`, `ahead ≈ 40`.
3. For each candidate end position `q` in the window, score the match of the tail against script tokens ending at `q` using fuzzy token similarity:
   - token similarity = max(normalized Levenshtein ratio, phonetic equality (Double Metaphone or similar), exact match = 1.0);
   - weight each token by its IDF weight; allow one or two gaps/substitutions (small edit-distance alignment, e.g. banded Smith-Waterman/Needleman-Wunsch);
   - score = weighted matched fraction, minus a small penalty proportional to `|q − p|` (prefer nearby).
4. If best score ≥ `acceptThreshold` and the match contains at least one strong-anchor token (or ≥ 3 matched tokens): set `p = q + 1`.
5. **Monotonic bias:** only move backward if (a) the score is very high, (b) the tail is ≥ 4 tokens, and (c) "allow rereading/backtrack" is enabled (default on, with high threshold). Otherwise never retreat — interim results are noisy and must not make the display jitter backward.
6. **Lost mode:** if no acceptable match for N seconds (default ~4 s of speech activity), widen the window progressively up to the whole script, but require a longer tail (≥ 5–6 tokens) and a higher threshold to jump. Show a subtle "lost — tap a word to resync" status.
7. **Ad-libs:** when the speaker says unscripted material, nothing matches and `p` simply holds. When they return to the script, the window (still centered on `p`) re-catches them. Do not advance on weak/short matches during an ad-lib.
8. **Skips:** if the speaker skips a sentence or paragraph, the forward window (and lost-mode widening) catches it. Optionally show a one-line confirmation toast for large jumps (> ~60 tokens) with an "undo" tap.
9. **Interim vs final:** use interim results for responsiveness, but treat `final` as the authority for reconciling `p` (still without moving backward except via rule 5). Deduplicate so the same tail is not scored repeatedly.
10. All thresholds/window sizes are named constants in one config object and exposed in a hidden "advanced/tuning" settings panel.

Deliver this as a pure, deterministic, well-documented module with the scoring function separated from the state machine.

## 8. Display & scrolling

- **Word-level spans.** States: *spoken* (dimmed), *current* (highlight on next word), *upcoming* (normal). Optional: highlight only the current line instead of words, or no highlight at all (spoken words still dim).
- **Reading line:** the current word/line is kept at a configurable vertical position (default ~30–35% from top, so eyes stay near a camera lens above the screen).
- **Smooth, stable scrolling:** ease toward the target; use a deadband so the view moves by line, not jittering per word; never scroll backward unless `p` genuinely moved back. Respect `prefers-reduced-motion` only for decorative animation, not for the scroll itself.
- **Appearance settings** (persisted): font family/size, line height, text width/margins, colors (dark, light, high-contrast, and green-on-black), spoken-text dimming amount, **mirror horizontal / flip vertical** (for beam-splitter prompter glass).
- **Layout:** large type, narrow column (about 30–50 characters per line adjustable), generous paragraph spacing. Must work in portrait and landscape and at any viewport size.
- Fullscreen toggle, and **Screen Wake Lock** so the device doesn't sleep (with a fallback message where unsupported).

## 9. Controls & manual override

Must be operable with one thumb on a tablet, and without looking closely.

- **Tap/click any word** → set position there (instant resync). Long-press or double-tap alternative if single tap conflicts with scrolling.
- **Drag/scroll** the text manually → temporarily detaches auto-follow; a "Resume following" button or tapping a word re-attaches.
- **Keyboard / Bluetooth clicker support:** Space = pause/resume listening, Up/Down/PageUp/PageDown = nudge by line/paragraph, Home = start, `[`/`]` = font size. Presentation clickers (PageUp/PageDown) must work for nudging position.
- **Pause/resume listening** big button; **mode switch** (Voice / Timed / Manual).
- **Mic level meter** and status badge: *listening*, *paused*, *lost*, *no mic permission*, *recognizer restarting*.
- Controls auto-hide during a run and reappear on tap near an edge, so they don't clutter the view or accidentally trigger.
- **Rehearsal/practice mode** is the same as normal mode; a separate "dry run" with no recording is unnecessary.
- Elapsed timer and an optional target duration with a subtle pace indicator ("on pace / 1:20 behind") — useful for talks with a time limit.

## 10. Privacy & offline

- No analytics, no third-party requests, no storage outside the device (scripts live in IndexedDB/localStorage).
- README and in-app notice: with Web Speech on Chrome, audio is sent to the browser vendor's speech service; the offline engine (phase 3) keeps everything on-device.
- Service worker precaches the app so it loads offline; offline model cached after first download.

## 11. Testing

- **Unit tests (Vitest)** for tokenizer (numbers, contractions, scripture references), IDF weighting, and the aligner.
- **Synthetic ASR-noise harness:** take a script, "speak" it as a token stream and inject realistic errors — substitutions (homophones, similar-sounding words), dropped words, duplicated interim fragments, ad-lib insertions, skipped sentences, a repeated sentence — and assert: final position tracks within N tokens, never jitters backward on interim noise, recovers within M seconds after an ad-lib/skip. Report tracking accuracy as a metric printed by the test run.
- Include 2–3 sample scripts (a conversational video script, a formal talk with scripture quotes, a script with numbers/dates).
- Manual test checklist in the README for real devices (Android tablet in a reverberant room, desktop Chrome, iPad Safari).

## 12. Milestones

1. **M1 — Foundation:** Vite+TS project, GitHub Pages deploy workflow, PWA shell, script import/library, display with manual scrolling and appearance settings.
2. **M2 — Voice following (Web Speech):** tokenizer, aligner + tests, Web Speech engine with auto-restart, highlight + smooth follow, tap-to-resync, pause/resume, status UI.
3. **M3 — Polish for real use:** timed-scroll fallback, keyboard/clicker control, wake lock, fullscreen, mirror/flip, auto-hiding controls, timer/pace indicator, scripture/number normalization, tuning panel, simulated-ASR harness and noise tests.
4. **M4 — Offline engine:** evaluate and integrate an on-device streaming recognizer, model download/caching, engine selector, offline end-to-end test.

Each milestone should leave `main` deployable.

## 13. Acceptance criteria (v1 = M1–M3)

- Loads from GitHub Pages over HTTPS, installs as a PWA, loads offline after first visit.
- On Chrome (Android tablet and desktop), reading a pasted 1,500-word script at a natural pace keeps the highlight within about one phrase of the speaker, with no visible backward jitter.
- Ad-libbing a sentence and then resuming the script re-syncs automatically without manual intervention in normal conditions.
- Skipping ahead a paragraph re-syncs within a few seconds; tapping a word resyncs instantly.
- Pausing, switching to timed/manual mode, and resuming all work mid-talk with one tap.
- All unit/noise-harness tests pass in CI.

## 14. Open questions for the owner

1. Which tablet/OS/browser will be used at church, and is connectivity reliable there? (Determines how soon the offline engine matters.) Answer: Android, Chrome
2. Mic: built-in tablet mic at arm's length, or a lapel/USB mic? (Affects accuracy and thresholds.) Answer: built-in mic would be nice.
3. Preferred script format: pasting plain text from Google Docs is the assumed workflow; is a markdown-ish markup acceptable or should plain text be the only input? Answer: Plain text is fine, but some simple markdown support would be a nice-to-have.
4. Any preferred app name/repo name for GitHub Pages deployment? Answer: "Cadence"
