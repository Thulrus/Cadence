import { describe, expect, it } from 'vitest';
import type { RecognitionEvent } from '../types';
import { buildScriptIndex } from '../text/index';
import { normalizeText } from '../text/normalize';
import { parseScript } from '../text/parse';
import { Aligner, type AlignResult } from './aligner';
import { ALIGN_DEFAULTS, resolveConfig } from './config';

const PARAS = [
  'Brothers and sisters, I am grateful to be with you today. I want to speak about faith, the kind of faith that moves us to act.',
  'Nephi was asked to return to Jerusalem for the brass plates. His brothers murmured, but Nephi said he would go and do the things the Lord commanded.',
  'Laban refused them and took their gold and silver. Twice they failed, and twice Nephi went back, trusting that a way would open.',
  'Many years later, a young farm boy knelt in a grove of trees. He had read in James that anyone who lacks wisdom may ask of God.',
  'When we act in faith, doors open that we could never have opened alone. Heaven is not silent, even when the answer is wait.',
];
const index = buildScriptIndex(parseScript(PARAS.join('\n\n')));
const norms = index.tokens.map((t) => t.norm);

function after(phrase: string): number {
  const ph = normalizeText(phrase);
  for (let i = 0; i + ph.length <= norms.length; i++) {
    if (ph.every((t, k) => norms[i + k] === t)) return i + ph.length;
  }
  throw new Error(`not found: ${phrase}`);
}

/** Fake recognizer: cumulative interim per word, a final per utterance, 400 ms per word. */
class Speaker {
  t = 0;
  results: AlignResult[] = [];
  constructor(
    readonly aligner: Aligner,
    readonly msPerWord = 400,
  ) {}
  say(utterance: string, opts: { final?: boolean; rewrite?: [number, string] } = {}) {
    const words = utterance.split(/\s+/).filter(Boolean);
    for (let i = 1; i <= words.length; i++) {
      this.t += this.msPerWord;
      const w = words.slice(0, i);
      if (opts.rewrite && i === words.length) w[opts.rewrite[0]] = opts.rewrite[1];
      this.feed({ words: w, isFinal: false, timestamp: this.t });
    }
    if (opts.final !== false) this.feed({ words, isFinal: true, timestamp: (this.t += 50) });
  }
  feed(ev: RecognitionEvent) {
    const r = this.aligner.feed(ev);
    if (r) this.results.push(r);
    return r;
  }
  get pos() {
    return this.aligner.state.position;
  }
  backwardMoves() {
    return this.results.filter((r) => r.moved && r.position < r.previous);
  }
}

const fresh = (cfg = ALIGN_DEFAULTS) => new Speaker(new Aligner(index, cfg));

describe('Aligner', () => {
  it('clean read-through tracks exactly', () => {
    const s = fresh();
    for (const para of PARAS) {
      for (const sentence of para.split(/(?<=[.,])\s+/)) {
        s.say(sentence);
        expect(s.pos).toBe(after(sentence));
      }
    }
    expect(s.pos).toBe(norms.length);
    expect(s.backwardMoves()).toEqual([]);
  });

  it('keeps up word by word within an utterance (interim results)', () => {
    const s = fresh();
    s.say('Brothers and sisters I am grateful', { final: false });
    expect(s.pos).toBe(after('Brothers and sisters, I am grateful'));
  });

  it('cumulative interim events with a rewrite', () => {
    const s = fresh();
    s.say('brothers and sisters I am grateful');
    // "two" rewritten to "to" in the last interim; the final has the right words.
    s.say('to be with you today', { rewrite: [0, 'two'] });
    expect(s.pos).toBe(after('with you today.'));
  });

  it('repeated interim fragments do not double-advance', () => {
    const s = fresh();
    s.say('brothers and sisters I am grateful', { final: false });
    const p = s.pos;
    for (let i = 0; i < 5; i++) {
      s.feed({
        words: 'brothers and sisters I am grateful'.split(' '),
        isFinal: false,
        timestamp: (s.t += 200),
      });
    }
    expect(s.pos).toBe(p);
  });

  it('Android repeat: a new utterance that starts with the previous final', () => {
    const s = fresh();
    s.say('brothers and sisters I am grateful');
    // Every hypothesis of the next utterance re-sends the previous final as a prefix.
    const prev = 'brothers and sisters I am grateful'.split(' ');
    const next = 'to be with you today'.split(' ');
    for (let i = 1; i <= next.length; i++) {
      s.feed({
        words: [...prev, ...next.slice(0, i)],
        isFinal: i === next.length,
        timestamp: (s.t += 400),
      });
      expect(s.pos).toBe(after(`grateful ${next.slice(0, i).join(' ')}`));
    }
    expect(s.backwardMoves()).toEqual([]);
  });

  it('ad-lib sentence then resume', () => {
    const s = fresh();
    s.say('Brothers and sisters I am grateful to be with you today');
    const p = s.pos;
    s.say('it is so good to see all of the young families here this morning in the chapel');
    expect(s.pos).toBe(p); // no creep during the ad-lib
    s.say('I want to speak about faith');
    expect(s.pos).toBe(after('I want to speak about faith,'));
  });

  it('short weak matches during an ad-lib do not creep forward', () => {
    const s = fresh();
    s.say('Brothers and sisters I am grateful to be with you today');
    const p = s.pos;
    // Ad-lib peppered with script stopwords and a short script fragment.
    s.say('and so the kind of thing that I say to my kids is to be good');
    s.say('you know what I mean and the the of');
    expect(s.pos).toBe(p);
  });

  it('never jumps far ahead: skipping a paragraph holds (the speaker scrolls there)', () => {
    const s = fresh();
    s.say(PARAS[0]!);
    const p = s.pos;
    expect(p).toBe(after(PARAS[0]!));
    // Skip paragraphs 2–3; read paragraph 4, long enough to go lost.
    for (let k = 0; k < 3; k++) for (const sent of PARAS[3]!.split(/(?<=\.)\s+/)) s.say(sent);
    expect(s.pos).toBe(p);
    expect(s.results.every((r) => r.position - r.previous <= ALIGN_DEFAULTS.maxSkipAhead + 9)).toBe(
      true,
    );
  });

  it('off-script for a long time, a far-ahead script phrase does not pull the prompter', () => {
    const s = fresh();
    s.say(PARAS[0]!);
    const p = s.pos;
    s.say('let me tell you about my trip to the coast last summer with my family and our dog');
    s.say('we drove for hours and the car kept making a strange rattling noise the whole way');
    expect(s.aligner.state.lost).toBe(true);
    // The ad-lib happens to quote the last paragraph verbatim.
    s.say('when we act in faith doors open that we could never have opened alone');
    expect(s.pos).toBe(p);
    // Back on script: picks up where they were.
    s.say('Nephi was asked to return to Jerusalem for the brass plates');
    expect(s.pos).toBe(after('for the brass plates.'));
    expect(s.aligner.state.lost).toBe(false);
  });

  it('maxSkipAhead is tunable: a large value catches a skipped paragraph again', () => {
    const s = fresh(resolveConfig({ maxSkipAhead: 1000 }));
    s.say(PARAS[0]!);
    for (const sent of PARAS[3]!.split(/(?<=\.)\s+/)) s.say(sent);
    expect(s.pos).toBe(after(PARAS[3]!));
  });

  it('a small skip ahead is caught inside the normal window', () => {
    const s = fresh();
    s.say('Brothers and sisters I am grateful to be with you today');
    s.say('the kind of faith that moves us to act');
    expect(s.pos).toBe(after('moves us to act.'));
    expect(s.results.every((r) => r.mode !== 'lost')).toBe(true);
  });

  it('reread of the previous sentence backtracks only when confident', () => {
    const s = fresh();
    s.say(PARAS[0]!);
    s.say('Nephi was asked to return to Jerusalem for the brass plates');
    s.say('His brothers murmured but Nephi said he would go and do the things the Lord commanded');
    const end = s.pos;
    // Re-read from "Nephi was asked": a long, confident match behind p.
    s.say('Nephi was asked to return to Jerusalem for the brass plates');
    expect(s.pos).toBeLessThan(end);
    expect(s.pos).toBe(after('for the brass plates.'));

    const noBack = fresh(resolveConfig({ allowBacktrack: false }));
    noBack.say(PARAS[0]!);
    noBack.say('Nephi was asked to return to Jerusalem for the brass plates');
    const p = noBack.pos;
    noBack.say('the kind of faith that moves us to act');
    expect(noBack.pos).toBe(p);
    expect(noBack.backwardMoves()).toEqual([]);
  });

  it('noisy interim results never move backward', () => {
    const s = fresh();
    s.say(PARAS[0]!);
    s.say('Nephi was asked to return to Jerusalem for the brass plates');
    const p = s.pos;
    // Interim noise that re-hears a few earlier words, then garbage.
    for (const w of [
      ['the', 'brass'],
      ['the', 'brass', 'plates'],
      ['for', 'the', 'brass', 'plates', 'his'],
      ['jerusalem', 'four', 'the'],
    ]) {
      s.feed({ words: w, isFinal: false, timestamp: (s.t += 300) });
      expect(s.pos).toBeGreaterThanOrEqual(p);
    }
    expect(s.backwardMoves()).toEqual([]);
  });

  it('external setPosition re-centres the window and forgets old speech', () => {
    const s = fresh();
    s.say('Brothers and sisters I am grateful to be with you today', { final: false });
    const target = after('Many years later,') - 3;
    s.aligner.setPosition(target);
    // The same utterance keeps going; earlier words must not drag us back.
    s.feed({
      words: 'Brothers and sisters I am grateful to be with you today'.split(' '),
      isFinal: true,
      timestamp: (s.t += 300),
    });
    expect(s.pos).toBe(target);
    s.say('Many years later a young farm boy knelt');
    expect(s.pos).toBe(after('a young farm boy knelt'));
  });

  it('enters lost mode after speech without a match, and reports it', () => {
    const s = fresh();
    s.say('Brothers and sisters I am grateful to be with you today');
    s.say('let me tell you about my trip to the coast last summer with my family and our dog');
    s.say('we drove for hours and the car kept making a strange rattling noise the whole way');
    expect(s.aligner.state.lost).toBe(true);
    expect(s.results.at(-1)?.lost).toBe(true);
    s.say('I want to speak about faith the kind of faith that moves us to act');
    expect(s.aligner.state.lost).toBe(false);
    expect(s.pos).toBe(after('moves us to act.'));
  });

  it('is deterministic', () => {
    const run = () => {
      const s = fresh();
      for (const p of PARAS) s.say(p);
      return s.results.map((r) => r.position);
    };
    expect(run()).toEqual(run());
  });

  it('reset() returns to the start', () => {
    const s = fresh();
    s.say(PARAS[0]!);
    s.aligner.reset();
    expect(s.aligner.state.position).toBe(0);
    s.say('Brothers and sisters');
    expect(s.pos).toBe(3);
  });
});

describe('Aligner: ad-lib markers', () => {
  const TEXT = [
    PARAS[0],
    `${PARAS[1]} [ad-lib: my own mission story]`,
    PARAS[2],
    `${PARAS[3]} [improvise]`,
    PARAS[4],
  ].join('\n\n');
  const idx = buildScriptIndex(parseScript(TEXT));
  const nm = idx.tokens.map((t) => t.norm);
  const at = (phrase: string) => {
    const ph = normalizeText(phrase);
    for (let i = 0; i + ph.length <= nm.length; i++) {
      if (ph.every((t, k) => nm[i + k] === t)) return i + ph.length;
    }
    throw new Error(phrase);
  };
  const marker = at('things the Lord commanded.');
  const speaker = (cfg = ALIGN_DEFAULTS) => new Speaker(new Aligner(idx, cfg));
  // A long story full of words and phrases from the next paragraph (the realistic hazard).
  // (Reciting the resume line's opening itself does resume: that's indistinguishable.)
  const STORY = [
    'when I was a missionary we had a companion who refused to give up',
    'we had a landlord a bit like Laban who kept our deposit gold and silver to him',
    'twice we failed and twice we went back trusting that a way would open',
    'and I want you to know that trusting the Lord is how the way opened for us',
    'brothers and sisters I am grateful and the brass plates mattered to Nephi',
  ];

  it('holds through a long, related story and resumes on the line after the marker', () => {
    const s = speaker();
    s.say(PARAS[0]!);
    s.say(PARAS[1]!);
    expect(s.pos).toBe(marker);
    expect(s.aligner.state.adlib).toBe(true);
    expect(s.aligner.state.adlibAt).toBe(marker);
    const moves = s.results.length;
    for (const line of STORY) s.say(line);
    expect(s.pos).toBe(marker);
    expect(s.aligner.state.lost).toBe(false);
    expect(s.results.slice(moves).filter((r) => r.moved)).toEqual([]);
    s.say('Laban refused them and took their gold and silver');
    expect(s.pos).toBe(at('their gold and silver.'));
    expect(s.aligner.state.adlib).toBe(false);
  });

  it('without the marker, the same story drags the prompter', () => {
    const plain = buildScriptIndex(parseScript(PARAS.join('\n\n')));
    const s = new Speaker(new Aligner(plain));
    s.say(PARAS[0]!);
    s.say(PARAS[1]!);
    const p = s.pos;
    for (const line of STORY) s.say(line);
    expect(s.pos).not.toBe(p);
  });

  it('reading straight across the marker is followed normally', () => {
    const s = speaker();
    s.say(PARAS[0]!);
    s.say(PARAS[1]!);
    s.say(PARAS[2]!);
    expect(s.pos).toBe(at(PARAS[2]!));
    s.say(PARAS[3]!);
    s.say(PARAS[4]!);
    expect(s.pos).toBe(nm.length);
  });

  it('resuming later than the line after the marker needs a tap', () => {
    const s = speaker();
    s.say(PARAS[0]!);
    s.say(PARAS[1]!);
    for (const line of STORY.slice(0, 2)) s.say(line);
    s.say('Twice they failed and twice Nephi went back trusting that a way would open');
    expect(s.pos).toBe(marker);
    s.aligner.setPosition(at('Twice they failed,'));
    expect(s.aligner.state.adlib).toBe(false);
    s.say('and twice Nephi went back trusting that a way would open');
    expect(s.pos).toBe(at('a way would open.'));
  });

  it('never moves backward out of an ad-lib by voice', () => {
    const s = speaker();
    s.say(PARAS[0]!);
    s.say(PARAS[1]!);
    s.say('Nephi was asked to return to Jerusalem for the brass plates');
    s.say('His brothers murmured but Nephi said he would go');
    expect(s.pos).toBe(marker);
    expect(s.backwardMoves()).toEqual([]);
  });
});

describe('resolveConfig', () => {
  it('merges valid overrides and ignores junk', () => {
    const c = resolveConfig({
      acceptThreshold: 0.7,
      tailMax: 6.8,
      bogus: 3,
      allowBacktrack: 'yes',
      windowAhead: -4,
    });
    expect(c.acceptThreshold).toBe(0.7);
    expect(c.tailMax).toBe(6);
    expect(c.allowBacktrack).toBe(true);
    expect(c.windowAhead).toBe(ALIGN_DEFAULTS.windowAhead);
    expect('bogus' in c).toBe(false);
    expect(resolveConfig({ tailMin: 5, tailMax: 2 }).tailMax).toBe(5);
  });
});
