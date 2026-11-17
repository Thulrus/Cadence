/**
 * Seeded ASR-noise injectors (SPEC §11). Plan-level noise edits what the speaker says and what
 * the recognizer hears (`applyNoise`); interim-level noise (duplicates, rewrites, the repeated
 * prefix quirk) is applied by speak.ts using the same `NoiseRates`.
 *
 * Every rate is a probability per opportunity: per word (substitute, drop), per number-word run
 * (digits), per sentence (adlib, skipSentence, repeatSentence), per paragraph (skipParagraph),
 * per interim event (duplicate, rewrite) or per utterance (repeatPrefix).
 */
import { HOMOPHONES } from '../../core/align/similarity';
import type { Rng } from './rng';
import type { SpokenItem } from './plan';

export interface NoiseRates {
  substitute: number;
  drop: number;
  digits: number;
  adlib: number;
  skipSentence: number;
  skipParagraph: number;
  repeatSentence: number;
  duplicate: number;
  rewrite: number;
  repeatPrefix: number;
}

export const NO_NOISE: Readonly<NoiseRates> = {
  substitute: 0,
  drop: 0,
  digits: 0,
  adlib: 0,
  skipSentence: 0,
  skipParagraph: 0,
  repeatSentence: 0,
  duplicate: 0,
  rewrite: 0,
  repeatPrefix: 0,
};

/** Named noise profiles used by the harness and the dev simulator panel. */
export const NOISE_PROFILES = {
  clean: NO_NOISE,
  light: {
    ...NO_NOISE,
    substitute: 0.05,
    drop: 0.03,
    digits: 0.5,
    duplicate: 0.05,
    rewrite: 0.1,
    repeatPrefix: 0.1,
  },
  heavy: {
    ...NO_NOISE,
    substitute: 0.15,
    drop: 0.08,
    digits: 0.8,
    duplicate: 0.1,
    rewrite: 0.25,
    repeatPrefix: 0.2,
  },
} as const satisfies Record<string, NoiseRates>;

/** Unscripted sentences a speaker might add. Deliberately full of common words. */
export const ADLIBS: readonly string[] = [
  'you know what I mean',
  'let me just say that again in a different way',
  'I actually was not planning to talk about this',
  'anyway I am sure a lot of you have felt the same thing',
  'and I think that is really important for all of us',
  'sorry I lost my place for a second there',
  'which reminds me of something my grandfather used to say',
  'if you have questions feel free to come find me afterward',
  'I can see some of you nodding',
  'okay where was I',
  'that is a little bit of a tangent but bear with me',
  'my kids would tell you I say that all the time',
];

/** Words a recognizer substitutes when it gets something badly wrong. */
const RANDOM_WORDS = [
  'apple',
  'garden',
  'wonder',
  'river',
  'basket',
  'motion',
  'silver',
  'pocket',
  'thunder',
  'ladder',
];

const HOMOPHONE_OF = new Map<string, readonly string[]>();
for (const g of HOMOPHONES) for (const w of g) HOMOPHONE_OF.set(w, g);

const VOWELS = 'aeiou';

/** A plausible mishearing of one word. */
export function mishear(word: string, rng: Rng, isName: boolean): string[] {
  const lower = word.toLowerCase();
  const group = HOMOPHONE_OF.get(lower);
  if (group && rng.chance(0.7)) return [rng.pick(group.filter((w) => w !== lower))];
  if (isName && lower.length >= 5) {
    // Mangled name: split and shift a vowel ("Helaman" → "hela min").
    const cut = 2 + rng.int(lower.length - 3);
    return [lower.slice(0, cut), shiftVowel(lower.slice(cut), rng)];
  }
  if (rng.chance(0.25) || lower.length < 3) return [rng.pick(RANDOM_WORDS)];
  const r = rng.int(3);
  if (r === 0) return [shiftVowel(lower, rng)];
  if (r === 1) return [lower.endsWith('s') ? lower.slice(0, -1) : `${lower}s`];
  return [lower.slice(0, -1) + (lower.endsWith('d') ? 't' : 'd')];
}

function shiftVowel(w: string, rng: Rng): string {
  const idx = [...w].flatMap((c, i) => (VOWELS.includes(c) ? [i] : []));
  if (!idx.length) return `${w}e`;
  const i = rng.pick(idx);
  const v = VOWELS[(VOWELS.indexOf(w[i]!) + 1 + rng.int(4)) % 5]!;
  return w.slice(0, i) + v + w.slice(i + 1);
}

const SMALL = [
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
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberWordValue(w: string): number | null {
  const s = w.toLowerCase();
  const i = SMALL.indexOf(s);
  if (i >= 0) return i;
  const t = TENS.indexOf(s);
  if (t >= 2) return t * 10;
  const m = /^([a-z]+)-([a-z]+)$/.exec(s);
  if (m) {
    const a = TENS.indexOf(m[1]!);
    const b = SMALL.indexOf(m[2]!);
    if (a >= 2 && b >= 1 && b <= 9) return a * 10 + b;
  }
  return null;
}

/** Value of a run of simple number words ("twenty", "one" → 21), or null if not a number. */
export function numberWordsValue(words: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  for (const w of words) {
    const s = w.toLowerCase();
    if (s === 'hundred') current = (current || 1) * 100;
    else if (s === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else {
      const v = numberWordValue(s);
      if (v === null) return null;
      current += v;
    }
  }
  return total + current;
}

const isNumberWord = (w: string) => numberWordValue(w) !== null || /^(hundred|thousand)$/i.test(w);

/** Apply plan-level noise. Returns a new plan; never edits `plan`. */
export function applyNoise(plan: readonly SpokenItem[], rates: NoiseRates, rng: Rng): SpokenItem[] {
  return wordNoise(structuralNoise(plan, rates, rng), rates, rng);
}

/** Skips, repeated sentences and ad-libs, at sentence granularity. */
function structuralNoise(plan: readonly SpokenItem[], rates: NoiseRates, rng: Rng): SpokenItem[] {
  const sentences: SpokenItem[][] = [];
  for (const it of plan) {
    const cur = sentences[sentences.length - 1];
    if (cur && cur[0]!.sentence === it.sentence) cur.push({ ...it });
    else sentences.push([{ ...it }]);
  }
  const out: SpokenItem[] = [];
  let pending: SpokenItem['mark'];
  let skipPara = -1;
  sentences.forEach((s, i) => {
    const first = s[0]!;
    const isLast = i === sentences.length - 1;
    if (i > 0 && !isLast) {
      const prevPara = sentences[i - 1]![0]!.paragraph;
      if (first.paragraph !== prevPara && rng.chance(rates.skipParagraph)) {
        skipPara = first.paragraph;
      }
      if (first.paragraph === skipPara || rng.chance(rates.skipSentence)) {
        pending = 'skip';
        return;
      }
    }
    if (pending) first.mark = pending;
    pending = undefined;
    out.push(...s);
    if (i > 0 && rng.chance(rates.repeatSentence)) {
      const again: SpokenItem[] = s.map((it) => ({ ...it, kind: 'reread' as const }));
      for (const it of again) delete it.mark;
      again[0]!.mark = 'reread';
      out.push(...again);
    }
    if (!isLast && rng.chance(rates.adlib)) {
      const truth = out[out.length - 1]!.truth;
      const words = rng.pick(ADLIBS).split(' ');
      words.forEach((w, j) =>
        out.push({
          words: [w],
          truth,
          kind: 'adlib',
          pause: j === words.length - 1 ? 'sentence' : 'none',
          sentence: -1,
          paragraph: -1,
        }),
      );
      pending = 'adlib';
    }
  });
  return out;
}

/** Digits for number words, substitutions, drops: what the recognizer gets wrong. */
function wordNoise(items: SpokenItem[], rates: NoiseRates, rng: Rng): SpokenItem[] {
  const out: SpokenItem[] = [];
  let runDecidedUntil = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    // Run of number words → one digits word (e.g. "thirty" "days" stays, "twenty" "one" → "21").
    let j = i;
    while (j < items.length && items[j]!.words.length === 1 && isNumberWord(items[j]!.words[0]!)) {
      j++;
    }
    if (j > i && i >= runDecidedUntil) {
      runDecidedUntil = j;
      const value = numberWordsValue(items.slice(i, j).map((x) => x.words[0]!));
      if (value !== null && rng.chance(rates.digits)) {
        out.push({ ...items[j - 1]!, words: [String(value)], mark: it.mark ?? items[j - 1]!.mark });
        i = j - 1;
        continue;
      }
    }
    if (it.kind !== 'adlib' && it.words.length && rng.chance(rates.drop)) {
      out.push({ ...it, words: [] });
    } else if (it.words.length && rng.chance(rates.substitute)) {
      const prev = items[i - 1];
      const isName = /^[A-Z]/.test(it.words[0]!) && !!prev && prev.pause === 'none';
      out.push({ ...it, words: mishear(it.words[0]!, rng, isName) });
    } else {
      out.push(it);
    }
  }
  return out;
}
