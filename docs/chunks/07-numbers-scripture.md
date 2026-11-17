# Chunk 07 — Numbers & scripture normalization

**Milestone:** M2 · **Depends on:** 02

## Goal

Plug number and scripture-reference expansion into the normalizer pipeline from chunk 02, so "1,000", "2026", "John 3:16", "1 Nephi 3:7" match how people say them, on both script and recognized text. Display text never changes.

## Read first

- SPEC §6 "Tokenizer/normalizer" (Numbers, Scripture references)
- `src/core/text/normalize.ts` (the pipeline hook), `src/core/text/index.ts`

## Tasks

1. **`src/core/text/numbers.ts`**: `numberToWords(n)` and a rule that expands numeric tokens:
   - Cardinals with/without commas: `7`→seven, `1,000`→one thousand, `1500`→fifteen hundred **or** one thousand five hundred (pick the more common spoken form per range and document it; see the alternates note below).
   - Years (4-digit 1100–2099 in a year-like context or standalone): `1830`→eighteen thirty, `2026`→twenty twenty six, `2005`→two thousand five, `1900`→nineteen hundred.
   - Ordinals `1st/2nd/3rd/21st`→first/second/third/twenty first. Decimals `3.5`→three point five. Percent `50%`→fifty percent. Currency `$20`→twenty dollars, `$4.50`→four dollars fifty. Times `3:30 pm`→three thirty p m (careful: must not collide with scripture `3:16`; scripture wins when preceded by a book name).
   - Ranges `10-12`→ten to twelve.
2. **`src/core/text/scripture.ts`**: rule that detects `[ordinal prefix] Book chapter[:verse[-verse]]` and expands:
   - `John 3:16`→john three sixteen; `1 Nephi 3:7`→first nephi three seven; `2 Cor. 5:17`→second corinthians five seventeen (common abbreviations map to full names); `Psalm 23`→psalm twenty three; `D&C 4:2`→doctrine and covenants four two (the owner speaks in church; cover the Bible plus Book of Mormon / D&C / Pearl of Great Price book names); ranges `3:16-18`→three sixteen through eighteen (also accept "to").
   - Book list in a data table, easy to extend.
3. **Alternates (important for matching):** spoken forms are ambiguous ("1500" may be said "fifteen hundred" or "one thousand five hundred"; "3:16-18" may use "through" or "to"). Pick one canonical form for the _script_ tokens, and make the _recognized-text_ side canonicalize the same way: recognized digits go through the same expansion, and recognized word sequences like "one thousand five hundred" are optionally collapsed toward the canonical form. If full canonicalization is too hard, document the gaps; the fuzzy aligner (09/10) tolerates a missed token or two. Don't over-engineer.
4. Register both rules in the normalizer pipeline (scripture before numbers). Ensure `MatchToken.word` still maps every generated token to the original display word (multi-word refs map tokens to the words they came from).
5. Extensive table-driven tests, including tricky cases: "3 of the 12 apostles", "in 2020 and 2021", "verse 5", "chapter 3", "1 John 1:9" vs "1 of John's", times vs scripture.

## Done when

- `npm run check` passes; table-driven tests for every rule listed.
- Rebuilding a ScriptIndex for a sample with numbers shows the expected tokens with correct word mapping.

## Out of scope

Non-English, roman numerals (note if trivial), weights/phonetics (08).
