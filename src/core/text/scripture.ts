/**
 * Scripture-reference expansion (SPEC §6 "Scripture references"). Runs before the number
 * rule, on both script and recognized text:
 *
 *   John 3:16        → john three sixteen
 *   1 Nephi 3:7      → first nephi three seven      (1/2/3/4, 1st.., first.., I/II/III prefixes)
 *   2 Cor. 5:17      → second corinthians five seventeen   (abbreviations → full names)
 *   Psalm 23         → psalm twenty three
 *   D&C 4:2          → doctrine and covenants four two
 *   John 3:16-18     → john three sixteen through eighteen  ("to"/"thru" after a ref → "through")
 *
 * Rules: a full book name needs a chapter (`Psalm 23`) unless it has a digit prefix
 * (`1 Nephi`); an abbreviation needs `chapter:verse`, so "Phil 2" or "my ex 3" stay as words;
 * a roman-numeral prefix needs a reference. Verse numbers are plain cardinals ("seven", not
 * "oh seven"). The book table is plain data; add entries to `BOOKS`.
 */
import { numberToWords } from './numbers';
import type { Segment, SequenceRule } from './normalize';

interface Book {
  /** Spoken name, lowercase words. */
  spoken: string;
  /** Other full-name spellings (accepted with a chapter only). */
  names?: string[];
  /** Abbreviations (accepted only before `chapter:verse`). No trailing dot. */
  abbr?: string[];
  /** Takes an ordinal prefix: 1 Nephi, 2 Kings. */
  numbered?: boolean;
}

export const BOOKS: readonly Book[] = [
  // Old Testament
  { spoken: 'genesis', abbr: ['gen', 'gn'] },
  { spoken: 'exodus', abbr: ['ex', 'exod'] },
  { spoken: 'leviticus', abbr: ['lev'] },
  { spoken: 'numbers', abbr: ['num'] },
  { spoken: 'deuteronomy', abbr: ['deut', 'dt'] },
  { spoken: 'joshua', abbr: ['josh'] },
  { spoken: 'judges', abbr: ['judg'] },
  { spoken: 'ruth' },
  { spoken: 'samuel', abbr: ['sam', 'sa'], numbered: true },
  { spoken: 'kings', abbr: ['kgs', 'ki'], numbered: true },
  { spoken: 'chronicles', abbr: ['chron', 'chr'], numbered: true },
  { spoken: 'ezra' },
  { spoken: 'nehemiah', abbr: ['neh'] },
  { spoken: 'esther', abbr: ['esth'] },
  { spoken: 'job' },
  { spoken: 'psalm', abbr: ['ps', 'psa'] },
  { spoken: 'psalms', abbr: ['pss'] },
  { spoken: 'proverbs', abbr: ['prov'] },
  { spoken: 'ecclesiastes', abbr: ['eccl', 'eccles'] },
  { spoken: 'song of solomon', abbr: ['song'] },
  { spoken: 'song of songs' },
  { spoken: 'isaiah', abbr: ['isa'] },
  { spoken: 'jeremiah', abbr: ['jer'] },
  { spoken: 'lamentations', abbr: ['lam'] },
  { spoken: 'ezekiel', abbr: ['ezek'] },
  { spoken: 'daniel', abbr: ['dan'] },
  { spoken: 'hosea', abbr: ['hos'] },
  { spoken: 'joel' },
  { spoken: 'amos' },
  { spoken: 'obadiah', abbr: ['obad'] },
  { spoken: 'jonah' },
  { spoken: 'micah', abbr: ['mic'] },
  { spoken: 'nahum', abbr: ['nah'] },
  { spoken: 'habakkuk', abbr: ['hab'] },
  { spoken: 'zephaniah', abbr: ['zeph'] },
  { spoken: 'haggai', abbr: ['hag'] },
  { spoken: 'zechariah', abbr: ['zech'] },
  { spoken: 'malachi', abbr: ['mal'] },
  // New Testament
  { spoken: 'matthew', abbr: ['matt', 'mt'] },
  { spoken: 'mark', abbr: ['mk'] },
  { spoken: 'luke', abbr: ['lk'] },
  { spoken: 'john', abbr: ['jn'], numbered: true },
  { spoken: 'acts' },
  { spoken: 'romans', abbr: ['rom'] },
  { spoken: 'corinthians', abbr: ['cor', 'co'], numbered: true },
  { spoken: 'galatians', abbr: ['gal'] },
  { spoken: 'ephesians', abbr: ['eph'] },
  { spoken: 'philippians', abbr: ['phil'] },
  { spoken: 'colossians', abbr: ['col'] },
  { spoken: 'thessalonians', abbr: ['thess', 'th'], numbered: true },
  { spoken: 'timothy', abbr: ['tim'], numbered: true },
  { spoken: 'titus' },
  { spoken: 'philemon', abbr: ['philem'] },
  { spoken: 'hebrews', abbr: ['heb'] },
  { spoken: 'james', abbr: ['jas'] },
  { spoken: 'peter', abbr: ['pet', 'pt'], numbered: true },
  { spoken: 'jude' },
  { spoken: 'revelation', names: ['revelations'], abbr: ['rev'] },
  // Book of Mormon
  { spoken: 'nephi', abbr: ['ne', 'neph'], numbered: true },
  { spoken: 'jacob' },
  { spoken: 'enos' },
  { spoken: 'jarom' },
  { spoken: 'omni' },
  { spoken: 'words of mormon', abbr: ['w of m'] },
  { spoken: 'mosiah' },
  { spoken: 'alma' },
  { spoken: 'helaman', abbr: ['hel'] },
  { spoken: 'mormon', abbr: ['morm'] },
  { spoken: 'ether' },
  { spoken: 'moroni', abbr: ['moro'] },
  // Doctrine and Covenants, Pearl of Great Price
  { spoken: 'doctrine and covenants', abbr: ['d&c', 'd and c', 'dc'] },
  { spoken: 'moses' },
  { spoken: 'abraham', abbr: ['abr'] },
  { spoken: 'joseph smith matthew', abbr: ['js m', 'jsm'] },
  { spoken: 'joseph smith history', abbr: ['js h', 'jsh'] },
  { spoken: 'articles of faith', abbr: ['a of f'] },
];

interface Alias {
  book: Book;
  abbr: boolean;
}

const ALIASES = new Map<string, Alias>();
for (const book of BOOKS) {
  ALIASES.set(book.spoken, { book, abbr: false });
  for (const n of book.names ?? []) ALIASES.set(n, { book, abbr: false });
  for (const a of book.abbr ?? []) if (!ALIASES.has(a)) ALIASES.set(a, { book, abbr: true });
}
const MAX_ALIAS_WORDS = Math.max(...[...ALIASES.keys()].map((k) => k.split(' ').length));

const ORDINALS = ['', 'first', 'second', 'third', 'fourth'];
const PREFIXES: Record<string, { n: number; roman?: boolean }> = {
  '1': { n: 1 },
  '2': { n: 2 },
  '3': { n: 3 },
  '4': { n: 4 },
  '1st': { n: 1 },
  '2nd': { n: 2 },
  '3rd': { n: 3 },
  '4th': { n: 4 },
  first: { n: 1 },
  second: { n: 2 },
  third: { n: 3 },
  fourth: { n: 4 },
  i: { n: 1, roman: true },
  ii: { n: 2, roman: true },
  iii: { n: 3, roman: true },
  iv: { n: 4, roman: true },
};
const RE_ATTACHED_PREFIX = /^([1-4])(?:st|nd|rd|th)?([a-z].*)$/;
const RE_REF = /^(\d{1,3})(?::(\d{1,3})(?:[-–—](\d{1,3})(?::(\d{1,3}))?)?)?$/;
const RANGE_WORDS = new Set(['to', 'through', 'thru']);
const RE_INT = /^\d{1,3}$/;

/** Lowercase book-matching key for one segment: edge punctuation off, dashes → spaces. */
function keyOf(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, '')
    .replace(/[-‐‑‒–—―−]+/g, ' ')
    .replace(/\./g, '');
}

function refCore(text: string): string {
  return text.replace(/^[^\p{N}]+|[^\p{N}]+$/gu, '');
}

interface Ref {
  chapter: number;
  verse?: number;
  toVerse?: number;
  toChapter?: number;
}

function parseRef(text: string): Ref | null {
  if (/[^\p{N}:\-–—.,;)\]"'!?]/u.test(text.replace(/^[(["']+/, ''))) return null;
  const m = refCore(text).match(RE_REF);
  if (!m) return null;
  const ref: Ref = { chapter: Number(m[1]) };
  if (m[2]) ref.verse = Number(m[2]);
  if (m[3] && m[4]) {
    ref.toChapter = Number(m[3]);
    ref.toVerse = Number(m[4]);
  } else if (m[3]) ref.toVerse = Number(m[3]);
  return ref;
}

function refWords(ref: Ref): string {
  const parts = [numberToWords(ref.chapter)];
  if (ref.verse !== undefined) parts.push(numberToWords(ref.verse));
  if (ref.toVerse !== undefined) {
    parts.push('through');
    if (ref.toChapter !== undefined) parts.push(numberToWords(ref.toChapter));
    parts.push(numberToWords(ref.toVerse));
  }
  return parts.join(' ');
}

/** Longest book alias starting at segment `j`: [alias, segments consumed]. */
function matchBook(segs: Segment[], j: number): [Alias, number] | null {
  let key = '';
  let best: [Alias, number] | null = null;
  for (let n = 1; n <= MAX_ALIAS_WORDS && j + n - 1 < segs.length; n++) {
    const k = keyOf(segs[j + n - 1]!.text);
    if (!k) break;
    key = key ? `${key} ${k}` : k;
    const alias = ALIASES.get(key);
    if (alias) best = [alias, n];
  }
  return best;
}

/** Sequence rule expanding scripture references. See module doc. */
export const scriptureRule: SequenceRule = (segs) => {
  const out: Segment[] = [];
  let i = 0;
  outer: while (i < segs.length) {
    const seg = segs[i]!;
    const key = keyOf(seg.text);
    // Candidate splits: [prefixNumber | null, bookStart, prefixRoman]
    const candidates: {
      prefix?: { n: number; roman?: boolean };
      bookAt: number;
      attached?: string;
    }[] = [];
    const prefix = PREFIXES[key];
    if (prefix) candidates.push({ prefix, bookAt: i + 1 });
    const attached = key.match(RE_ATTACHED_PREFIX);
    if (attached)
      candidates.push({ prefix: { n: Number(attached[1]) }, bookAt: i, attached: attached[2] });
    candidates.push({ bookAt: i });

    for (const c of candidates) {
      let alias: Alias | undefined;
      let used = 0;
      if (c.attached !== undefined) {
        alias = ALIASES.get(c.attached);
        used = 1;
      } else {
        const m = matchBook(segs, c.bookAt);
        if (m) [alias, used] = m;
      }
      if (!alias) continue;
      if (c.prefix && !alias.book.numbered) continue;
      const refAt = c.bookAt + used;
      const refSeg = segs[refAt];
      const ref = refSeg ? parseRef(refSeg.text) : null;
      const prefixIsWord = c.prefix && ORDINALS[c.prefix.n] === key;
      // Acceptance rules (module doc).
      if (alias.abbr && ref?.verse === undefined) continue;
      if (!ref && !(c.prefix && !c.prefix.roman && !prefixIsWord)) continue;
      if (c.prefix?.roman && !ref) continue;

      if (c.prefix && c.attached === undefined)
        out.push({ text: ORDINALS[c.prefix.n]!, src: seg.src });
      const bookSrc = segs[c.bookAt]!.src;
      if (c.prefix && c.attached !== undefined)
        out.push({ text: ORDINALS[c.prefix.n]!, src: bookSrc });
      if (!alias.abbr && used > 1) {
        // Full multi-word name written out: keep each word on its own display word.
        for (let k = 0; k < used; k++) out.push(segs[c.bookAt + k]!);
      } else out.push({ text: alias.book.spoken, src: bookSrc });
      let next = refAt;
      if (ref && refSeg) {
        let text = refWords(ref);
        next = refAt + 1;
        out.push({ text, src: refSeg.src });
        // "John 3:16 to 18" → canonical "through".
        const rw = segs[next];
        const rn = segs[next + 1];
        if (
          ref.verse !== undefined &&
          ref.toVerse === undefined &&
          rw &&
          rn &&
          RANGE_WORDS.has(keyOf(rw.text)) &&
          RE_INT.test(refCore(rn.text)) &&
          refCore(rn.text) === rn.text.replace(/[.,;:!?)"']+$/, '')
        ) {
          out.push({ text: 'through', src: rw.src });
          text = numberToWords(Number(refCore(rn.text)));
          out.push({ text, src: rn.src });
          next += 2;
        }
      }
      i = next;
      continue outer;
    }
    out.push(seg);
    i++;
  }
  return out;
};
