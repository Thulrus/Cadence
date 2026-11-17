# Cadence — Architecture

Short, binding reference for every chunk. `SPEC.md` is the product spec; this file says **where things live and how they connect**. If you must change a contract here, update this file in the same commit and note it in `docs/PROGRESS.md`.

## Data flow

```
Script text ──parse──▶ ParsedScript ──index──▶ ScriptIndex (match tokens + weights)
                                                    │
RecognizerEngine ──RecognitionEvent──▶ Aligner ─────┤
 (webspeech | offline | simulated)        │         ▼
                                          └──▶ PositionController ◀── manual (tap, keys, clicker)
                                                    │                ◀── TimedScroller
                                                    ▼
                                                Renderer (word spans, highlight, scroll)
```

## Directory layout

```
src/
  core/                 PURE TypeScript. No DOM, no browser globals, no storage. Fully unit-tested.
    emitter.ts          Typed event emitter (exists)
    types.ts            Cross-module contracts (exists): RecognitionEvent, RecognizerEngine, PositionChange
    text/               parse.ts (markup), normalize.ts, numbers.ts, scripture.ts, index.ts (ScriptIndex builder)
    align/              similarity.ts, phonetic.ts, weights.ts, score.ts, aligner.ts, config.ts
    position/           controller.ts (PositionController)
    timing/             timed.ts (timed scroll), pace.ts (elapsed/target pace math)
  engines/              webspeech.ts, simulated.ts, offline/ (M4). Implement RecognizerEngine.
  storage/              scripts.ts (ScriptStore, IndexedDB), settings.ts (SettingsStore, localStorage)
  ui/                   DOM code: views/ (library, editor, prompter, settings), components/, scroll.ts
  app.ts                Composition root: builds stores, engines, controller, views; wires them.
  main.ts               Entry: imports CSS, calls app.
test/
  fixtures/             sample scripts, transcripts
  harness/              synthetic ASR-noise harness (chunk 11)
public/                 static assets (icons, sample scripts if served)
```

Rules:

- `src/core/**` must not import from `ui/`, `engines/`, or `storage/`, and must not touch `window`/`document`/`localStorage`. Time is injected (pass `now` in, or a `Clock` interface) so tests are deterministic.
- DOM code stays thin: put any logic worth testing (scroll math, keymaps, pace) in a pure function and test it.
- No runtime network requests. No new runtime dependency without a one-line justification in PROGRESS.md. Dev dependencies are fine.
- No framework. Vanilla DOM + small helper functions. (Spec allows Preact/Lit only if it genuinely simplifies; don't introduce one without a recorded reason.)

## Core data model (chunk 02 creates these in `src/core/text/`)

```ts
type WordKind = 'speech' | 'heading' | 'direction';

interface DisplayWord {
  text: string; // exactly as displayed, punctuation attached ("Hello,")
  kind: WordKind;
  block: number; // index into blocks
  tokenStart: number; // [tokenStart, tokenEnd) range in ScriptIndex.tokens; empty if not spoken
  tokenEnd: number;
}

interface Block {
  kind: 'heading' | 'paragraph';
  level?: number; // heading level 1..6
  wordStart: number; // [wordStart, wordEnd) in words
  wordEnd: number;
}

interface ParsedScript {
  blocks: Block[];
  words: DisplayWord[];
}

interface MatchToken {
  norm: string; // normalized spoken form, e.g. "one", "thousand", "do", "not"
  word: number; // index of the DisplayWord that produced it (many tokens → one word)
  weight: number; // IDF-style anchor weight (chunk 08; 1 until then)
  phonetic?: string; // phonetic key (chunk 08)
}

interface ScriptIndex {
  script: ParsedScript;
  tokens: MatchToken[];
}
```

- Only `speech` words produce match tokens. Headings and `[directions]` are displayed but never matched.
- **Position** = index into `ScriptIndex.tokens` of the next token the speaker is expected to say. `0` = start, `tokens.length` = finished. The renderer maps position → display word via `tokens[p].word`.
- The same `normalize` pipeline is applied to script text and recognized text (contractions expand both sides: "don't" → `do not`; digits → words both sides).

## Settings

One typed `Settings` object (chunk 01) with defaults, persisted to `localStorage` under `cadence.settings.v1`, with a `version` field and a migrate step. Groups: `appearance`, `run` (mode, timed WPM, target duration, reading-line %), `engine` (choice, lang), `align` (overrides of the aligner config; empty = defaults). Unknown/missing fields fall back to defaults; never crash on bad stored JSON.

## Conventions

- TypeScript strict (see `tsconfig.json`), ES modules, Prettier formatting (`npm run format`).
- Tests live next to code as `*.test.ts`; cross-module/harness tests in `test/`.
- Named constants, no magic numbers in the aligner/scroller — they belong in config objects.
- Each public function/class in `core/` gets a short doc comment saying what it does and any invariants.
- CSS: one `src/style.css` plus per-view CSS files if needed; theme via CSS custom properties on `:root[data-theme=...]`.
