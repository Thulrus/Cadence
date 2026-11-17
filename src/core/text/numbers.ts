/**
 * Number expansion for the normalizer (SPEC §6 "Numbers"). Runs on both script text and
 * recognized text, so whatever spoken form we pick only has to be *consistent*.
 *
 * Two passes, registered as one sequence rule (`numberRule`):
 *
 * 1. **Digits → words.** Numeric raw words become spoken words:
 *    - cardinals `7`, `1,000`, `250000` → "seven", "one thousand", ...
 *    - 4-digit numbers 1100–2099 with no comma are read as years: `1830` → "eighteen thirty",
 *      `1905` → "nineteen oh five", `2005` → "two thousand five", `2026` → "twenty twenty six".
 *      (Most 4-digit numbers in speech are years; "1500 people" is also usually said
 *      "fifteen hundred", which the collapse pass below canonicalizes anyway.)
 *    - ordinals `21st` → "twenty first"; decades `1990s` → "nineteen nineties"
 *    - decimals `3.5` → "three point five"; percent `50%` → "fifty percent"
 *    - currency `$20` → "twenty dollars", `$4.50` → "four dollars fifty", `$0.50` → "fifty cents",
 *      `$2 million` → "two million dollars"
 *    - times `3:30` → "three thirty", `3:05` → "three oh five", `3:00` → "three";
 *      `pm`/`p.m.` → "p m", and `am`/`a.m.` after a time → "a m". (Scripture references are
 *      handled earlier by the scripture rule, so `John 3:16` never reaches here.)
 *    - ranges `10-12` → "ten to twelve"
 *
 * 2. **Collapse spoken multiplier phrases to one canonical form.** Any run of number words
 *    containing hundred/thousand/million/billion is parsed to its value and rewritten as the
 *    standard cardinal: "fifteen hundred", "one thousand five hundred", "a thousand five
 *    hundred" and the year-form of `1500` all become "one thousand five hundred". Runs without
 *    a multiplier ("twenty twenty six", "three") are left alone.
 *
 * Known gaps (the fuzzy aligner absorbs a missed token or two): letter+digit mixes like
 * `mp3`/`covid19` keep their digits; "nineteen oh five" said for `1905` written as words is
 * fine but "nineteen five" isn't collapsed; phone numbers read digit by digit; `10:00` said
 * "ten o'clock" leaves one extra token; roman numerals are not expanded.
 */
import type { Segment, SequenceRule } from './normalize';

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: readonly [value: number, word: string][] = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

/** Year-reading range for bare 4-digit numbers. */
export const YEAR_RANGE = { min: 1100, max: 2099 } as const;

function under1000(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) out.push(ONES[h]!, 'hundred');
  if (r >= 20) {
    out.push(TENS[Math.floor(r / 10)]!);
    if (r % 10) out.push(ONES[r % 10]!);
  } else if (r || !h) out.push(ONES[r]!);
  return out;
}

/** Standard cardinal reading of a non-negative integer: 1500 → "one thousand five hundred". */
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return under1000(n).join(' ');
  const out: string[] = [];
  let rest = n;
  for (const [value, word] of SCALES) {
    const q = Math.floor(rest / value);
    if (q) {
      out.push(numberToWords(q), word);
      rest -= q * value;
    }
  }
  if (rest) out.push(under1000(rest).join(' '));
  return out.join(' ');
}

/** Year reading: 1830 → "eighteen thirty", 1905 → "nineteen oh five", 2005 → "two thousand five". */
export function yearToWords(n: number): string {
  if (n >= 2000 && n < 2010) return numberToWords(n);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  const head = numberToWords(hi);
  if (lo === 0) return `${head} hundred`;
  if (lo < 10) return `${head} oh ${ONES[lo]}`;
  return `${head} ${numberToWords(lo)}`;
}

const ORDINAL_IRREGULAR: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

function lastWordMap(words: string, f: (w: string) => string): string {
  const parts = words.split(' ');
  parts[parts.length - 1] = f(parts[parts.length - 1]!);
  return parts.join(' ');
}

/** 21 → "twenty first", 100 → "one hundredth". */
export function ordinalToWords(n: number): string {
  return lastWordMap(numberToWords(n), (w) => {
    const irregular = ORDINAL_IRREGULAR[w];
    if (irregular) return irregular;
    if (w.endsWith('y')) return `${w.slice(0, -1)}ieth`;
    return `${w}th`;
  });
}

function pluralWords(words: string): string {
  return lastWordMap(words, (w) => {
    if (w.endsWith('y')) return `${w.slice(0, -1)}ies`;
    if (w.endsWith('x')) return `${w}es`;
    return `${w}s`;
  });
}

function digitsToWords(digits: string): string {
  return [...digits].map((d) => ONES[Number(d)]).join(' ');
}

/** Integer with optional thousands commas → words (years when bare 4-digit in YEAR_RANGE). */
function integerWords(raw: string): string {
  const n = Number(raw.replace(/,/g, ''));
  if (!raw.includes(',') && raw.length === 4 && n >= YEAR_RANGE.min && n <= YEAR_RANGE.max) {
    return yearToWords(n);
  }
  return numberToWords(n);
}

const INT = String.raw`\d{1,3}(?:,\d{3})+|\d+`;
const RE_INT = new RegExp(`^(${INT})$`);
const RE_DECIMAL = /^(\d+)\.(\d+)$/;
const RE_ORDINAL = /^(\d+)(st|nd|rd|th)$/;
const RE_DECADE = /^'?(\d+)'?s$/;
const RE_PERCENT = new RegExp(`^(${INT}|\\d+\\.\\d+)%$`);
const RE_CURRENCY = new RegExp(`^\\$(${INT})(?:\\.(\\d{2}))?$`);
const RE_TIME = /^(\d{1,2}):(\d{2})(am|pm|a\.m\.?|p\.m\.?)?$/;
const RE_HOUR_AMPM = /^(\d{1,2})(am|pm|a\.m\.?|p\.m\.?)$/;
const RE_RANGE = new RegExp(`^(${INT})[-–—](${INT})$`);
const RE_AMPM = /^(?:([ap])\.m\.?|pm)$/;
const DASHES = /[-‐‑‒–—―−]+/;
/** Edge punctuation for numeric matching: keeps a leading `$`/`'` and a trailing `%`. */
const EDGE_PUNCT = /^[^\p{L}\p{N}$']+|[^\p{L}\p{N}%]+$/gu;
const SCALE_WORDS = new Set(['million', 'billion', 'trillion']);

function ampmWords(s: string | undefined): string {
  if (!s) return '';
  return s.startsWith('a') ? ' a m' : ' p m';
}

function timeWords(h: number, m: number): string {
  if (m === 0) return numberToWords(h);
  if (m < 10) return `${numberToWords(h)} oh ${ONES[m]}`;
  return `${numberToWords(h)} ${numberToWords(m)}`;
}

/** Expand one punctuation-trimmed numeric core; null if it isn't one of our patterns. */
function expandCore(
  core: string,
  next: string | undefined,
): { text: string; eatNext?: boolean } | null {
  let m: RegExpMatchArray | null;
  if ((m = core.match(RE_INT))) return { text: integerWords(m[1]!) };
  if ((m = core.match(RE_DECIMAL))) {
    return { text: `${numberToWords(Number(m[1]))} point ${digitsToWords(m[2]!)}` };
  }
  if ((m = core.match(RE_ORDINAL))) return { text: ordinalToWords(Number(m[1])) };
  if ((m = core.match(RE_DECADE))) return { text: pluralWords(integerWords(m[1]!)) };
  if ((m = core.match(RE_PERCENT))) {
    const inner = expandCore(m[1]!, undefined);
    return inner && { text: `${inner.text} percent` };
  }
  if ((m = core.match(RE_CURRENCY))) {
    const whole = Number(m[1]!.replace(/,/g, ''));
    const cents = m[2] ? Number(m[2]) : 0;
    const nextCore = next?.replace(/[^\p{L}]+/gu, '');
    if (nextCore && SCALE_WORDS.has(nextCore) && !cents) {
      return { text: `${numberToWords(whole)} ${nextCore} dollars`, eatNext: true };
    }
    const wholeText = numberToWords(whole);
    if (whole === 0 && cents) return { text: `${numberToWords(cents)} cents` };
    const dollars = `${wholeText} ${whole === 1 ? 'dollar' : 'dollars'}`;
    return { text: cents ? `${dollars} ${numberToWords(cents)}` : dollars };
  }
  if ((m = core.match(RE_TIME))) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h <= 23 && min <= 59) return { text: timeWords(h, min) + ampmWords(m[3]) };
    return { text: `${numberToWords(h)} ${numberToWords(min)}` };
  }
  if ((m = core.match(RE_HOUR_AMPM)))
    return { text: numberToWords(Number(m[1])) + ampmWords(m[2]) };
  if ((m = core.match(RE_RANGE)))
    return { text: `${integerWords(m[1]!)} to ${integerWords(m[2]!)}` };
  return null;
}

/** Pass 1: digits → words, plus a.m./p.m. handling. Output segments hold single words. */
function expandDigits(input: Segment[]): Segment[] {
  const out: Segment[] = [];
  let prevWasTime = false;
  for (let i = 0; i < input.length; i++) {
    const seg = input[i]!;
    const core = seg.text.replace(EDGE_PUNCT, '');
    const whole = expandCore(core, input[i + 1]?.text);
    let pieces: string[];
    if (whole) {
      pieces = [whole.text];
      if (whole.eatNext) i++;
    } else if (RE_AMPM.test(core) || (core === 'am' && prevWasTime)) {
      pieces = [core.startsWith('a') ? 'a m' : 'p m'];
    } else if (/\d/.test(core) && DASHES.test(seg.text)) {
      // e.g. "covid-19", "1-800": expand each dash piece on its own.
      pieces = seg.text.split(DASHES).map((p) => {
        const c = p.replace(EDGE_PUNCT, '');
        return expandCore(c, undefined)?.text ?? p;
      });
    } else {
      pieces = [seg.text];
    }
    prevWasTime = !!whole && (RE_TIME.test(core) || RE_INT.test(core));
    for (const piece of pieces) {
      for (const w of piece.split(/\s+/)) if (w) out.push({ text: w, src: seg.src });
    }
  }
  return out;
}

const UNIT_VALUES: Record<string, number> = {};
ONES.forEach((w, i) => {
  if (i > 0) UNIT_VALUES[w] = i;
});
const TENS_VALUES: Record<string, number> = {};
TENS.forEach((w, i) => {
  if (w) TENS_VALUES[w] = i * 10;
});
const BIG_VALUES: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

type Kind = 'start' | 'unit' | 'teen' | 'tens' | 'hundred' | 'big' | 'and';

/** Longest parse of number words starting at `start`; returns [endExclusive, value, hasMultiplier]. */
function parseNumberRun(words: string[], start: number): [number, number, boolean] {
  let total = 0;
  let current = 0;
  let last: Kind = 'start';
  let lastBig = Infinity;
  let hasMult = false;
  let end = start;
  let i = start;
  const isNumberWord = (w: string | undefined) =>
    !!w && (UNIT_VALUES[w] !== undefined || TENS_VALUES[w] !== undefined);
  while (i < words.length) {
    const w = words[i]!;
    const unit = UNIT_VALUES[w];
    const tens = TENS_VALUES[w];
    const big = BIG_VALUES[w];
    if (
      w === 'a' &&
      last === 'start' &&
      (words[i + 1] === 'hundred' || BIG_VALUES[words[i + 1]!])
    ) {
      current = 1;
      last = 'unit';
    } else if (unit !== undefined && unit < 10) {
      if (!['start', 'tens', 'hundred', 'big', 'and'].includes(last)) break;
      current += unit;
      last = 'unit';
    } else if (unit !== undefined || tens !== undefined) {
      if (!['start', 'hundred', 'big', 'and'].includes(last)) break;
      current += unit ?? tens!;
      last = unit !== undefined ? 'teen' : 'tens';
    } else if (w === 'hundred') {
      if (!['unit', 'teen', 'tens'].includes(last) || current >= 100) break;
      current *= 100;
      last = 'hundred';
      hasMult = true;
    } else if (big !== undefined) {
      if (current === 0 || big >= lastBig || last === 'and') break;
      total += current * big;
      current = 0;
      lastBig = big;
      last = 'big';
      hasMult = true;
    } else if (w === 'and') {
      if ((last !== 'hundred' && last !== 'big') || !isNumberWord(words[i + 1])) break;
      last = 'and';
    } else break;
    i++;
    if (last !== 'and') end = i;
  }
  return [end, total + current, hasMult];
}

/** Pass 2: rewrite multiplier phrases ("fifteen hundred") to the canonical cardinal. */
function collapseNumberPhrases(segs: Segment[]): Segment[] {
  const words = segs.map((s) => s.text.replace(/[^\p{L}\p{N}]+/gu, ''));
  const out: Segment[] = [];
  let i = 0;
  while (i < segs.length) {
    const [end, value, hasMult] = parseNumberRun(words, i);
    if (end > i && hasMult) {
      const canon = numberToWords(value).split(' ');
      const n = end - i;
      canon.forEach((text, k) =>
        out.push({ text, src: segs[i + Math.floor((k * n) / canon.length)]!.src }),
      );
      i = end;
    } else {
      out.push(segs[i]!);
      i++;
    }
  }
  return out;
}

/** Sequence rule: digits → words, then canonicalize multiplier phrases. */
export const numberRule: SequenceRule = (segments) => collapseNumberPhrases(expandDigits(segments));
