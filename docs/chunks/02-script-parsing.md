# Chunk 02 — Script parsing, normalizer, ScriptIndex

**Milestone:** M1 · **Depends on:** 00 (independent of 01)

## Goal

Pure functions that turn raw script text into the `ParsedScript` / `ScriptIndex` model in ARCHITECTURE.md, with a normalizer used identically on script text and recognized speech. This is the foundation of display and alignment, so test it thoroughly.

## Read first

- `docs/ARCHITECTURE.md` ("Core data model")
- SPEC §6 (all of it). Numbers and scripture expansion are **chunk 07**: just leave a clean hook for them here.

## Tasks

1. **`src/core/text/parse.ts`** — `parseScript(text): ParsedScript`
   - Normalize line endings. Blank line(s) = paragraph break. Single newlines inside a paragraph are kept as soft line breaks: record them (e.g. `DisplayWord.lineBreakBefore?: boolean`, and add it to ARCHITECTURE.md) so the renderer can preserve them. Plain text pasted from Google Docs often uses one paragraph per line.
   - `# ` to `###### ` at line start → heading block (kind `heading`, words of kind `heading`).
   - `[bracketed text]` anywhere → words of kind `direction` (may span several words; handle unclosed `[` as literal text).
   - Everything else → `speech` words, split on whitespace, punctuation stays attached to `text`.
   - Light markdown only: strip `**`/`*`/`_` emphasis markers from display text (optionally record `emphasis` on the word). Don't build a full markdown parser.
2. **`src/core/text/normalize.ts`**: `normalizeWord(raw): string[]` (one raw word → zero or more normalized tokens) and `normalizeText(raw): string[]`.
   - Lowercase; curly quotes/apostrophes → straight; em/en dashes and hyphens split words ("well-known" → `well known`); strip remaining punctuation; drop empty tokens.
   - Contractions expand consistently on both sides: `don't`→`do not`, `I'm`→`i am`, `we'll`→`we will`, `can't`→`can not`, `won't`→`will not`, `it's`→`it is`, `'re`/`'ve`/`'d`/`'ll`, and possessive `'s` on nouns left as-is (strip apostrophe: `john's`→`johns`). Note: `it's`/`he's` ambiguity (is/has) is fine as long as it's consistent on both sides. Use a table, documented.
   - Leave a pipeline hook (an ordered array of rule functions) where chunk 07 will insert number and scripture expansion. Scripture refs span several raw words ("John 3:16"), so the hook must operate on a word sequence, not only single words.
3. **`src/core/text/index.ts`**: `buildScriptIndex(parsed): ScriptIndex`. Produces `MatchToken[]` from `speech` words only, fills `tokenStart/tokenEnd` on every word (empty range for non-speech), `weight = 1` placeholder (chunk 08 replaces). Helpers: `wordForPosition(index, p)`, `positionForWord(index, wordIdx)` (first token of that word, or the next speech word's first token if it has none).
4. Tests for all of the above: headings, directions (including mid-sentence and multi-word), paragraphs/soft breaks, emphasis, punctuation, dashes, curly quotes, every contraction in the table, empty input, whitespace-only input, a 1,500-word input builds in well under 50 ms.

## Done when

- `npm run check` passes; coverage of the cases above.
- Token→word mapping is exact: for every token, `script.words[token.word]` is the word it came from, and ranges are contiguous and non-overlapping.

## Out of scope

Numbers/scripture (07), IDF/phonetics (08), any DOM.
