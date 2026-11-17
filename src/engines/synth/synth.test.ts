import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../../core/text/index';
import { parseScript } from '../../core/text/parse';
import {
  applyNoise,
  createRng,
  heardForm,
  NO_NOISE,
  NOISE_PROFILES,
  numberWordsValue,
  planSpeech,
  simulateSpeech,
  speak,
} from './index';

const TEXT = `# Title

Hello there, friends. In John 3:16 we read "For God so loved the world."

[pause]

The end has twenty one words or so. Thank you!`;

const index = buildScriptIndex(parseScript(TEXT));

describe('planSpeech', () => {
  it('speaks only speech words, with truth = token end and pauses at boundaries', () => {
    const plan = planSpeech(index);
    expect(plan.map((p) => p.words.join(' '))).toEqual(
      'Hello there friends In John 3:16 we read For God so loved the world The end has twenty one words or so Thank you'.split(
        ' ',
      ),
    );
    expect(plan.every((p, i) => i === 0 || p.truth >= plan[i - 1]!.truth)).toBe(true);
    expect(plan[plan.length - 1]!.truth).toBe(index.tokens.length);
    expect(plan.find((p) => p.words[0] === 'friends')!.pause).toBe('sentence');
    expect(plan.find((p) => p.words[0] === 'world')!.pause).toBe('direction');
  });

  it('heardForm strips quotes and trailing punctuation but keeps a.m.', () => {
    expect(heardForm('“Come,')).toBe('Come');
    expect(heardForm('world.”')).toBe('world');
    expect(heardForm('p.m.')).toBe('p.m.');
    expect(heardForm('11:28,')).toBe('11:28');
  });
});

describe('noise', () => {
  it('is deterministic per seed and leaves the plan alone', () => {
    const plan = planSpeech(index);
    const copy = structuredClone(plan);
    const a = applyNoise(plan, NOISE_PROFILES.heavy, createRng(7));
    const b = applyNoise(plan, NOISE_PROFILES.heavy, createRng(7));
    expect(a).toEqual(b);
    expect(plan).toEqual(copy);
  });

  it('no noise is the identity', () => {
    const plan = planSpeech(index);
    expect(applyNoise(plan, NO_NOISE, createRng(1))).toEqual(plan);
  });

  it('digits replace number-word runs, keeping the last truth', () => {
    const plan = planSpeech(index);
    const out = applyNoise(plan, { ...NO_NOISE, digits: 1 }, createRng(1));
    const d = out.find((p) => p.words[0] === '21')!;
    expect(d.truth).toBe(plan.find((p) => p.words[0] === 'one')!.truth);
    expect(numberWordsValue(['two', 'hundred', 'thirty', 'four'])).toBe(234);
    expect(numberWordsValue(['two', 'apples'])).toBeNull();
  });

  it('ad-libs hold the truth and mark the return to the script', () => {
    const out = applyNoise(planSpeech(index), { ...NO_NOISE, adlib: 1 }, createRng(3));
    const ad = out.findIndex((p) => p.kind === 'adlib');
    expect(ad).toBeGreaterThan(0);
    expect(out[ad]!.truth).toBe(out[ad - 1]!.truth);
    const back = out.findIndex((p, i) => i > ad && p.kind === 'script');
    expect(out[back]!.mark).toBe('adlib');
  });

  it('skips and rereads move the truth and are marked', () => {
    const skip = applyNoise(planSpeech(index), { ...NO_NOISE, skipSentence: 1 }, createRng(1));
    expect(skip.some((p) => p.mark === 'skip')).toBe(true);
    const re = applyNoise(planSpeech(index), { ...NO_NOISE, repeatSentence: 1 }, createRng(1));
    const r = re.findIndex((p) => p.mark === 'reread');
    expect(re[r]!.truth).toBeLessThan(re[r - 1]!.truth);
  });
});

describe('speak', () => {
  it('produces cumulative interims per utterance, ending in a final, in time order', () => {
    const plan = planSpeech(index);
    const evs = speak(plan, createRng(1));
    expect(evs.length).toBeGreaterThan(plan.length / 2);
    expect(evs.every((e, i) => i === 0 || e.event.timestamp >= evs[i - 1]!.event.timestamp)).toBe(
      true,
    );
    let prev: string[] = [];
    for (const { event } of evs) {
      expect(event.words.slice(0, prev.length)).toEqual(prev);
      prev = event.isFinal ? [] : event.words;
    }
    expect(evs[evs.length - 1]!.event.isFinal).toBe(true);
    expect(evs[evs.length - 1]!.truth).toBe(index.tokens.length);
  });

  it('paces at roughly the configured wpm', () => {
    const sim = simulateSpeech(TEXT.repeat(20), { seed: 2 });
    const evs = sim.events;
    const minutes = (evs[evs.length - 1]!.event.timestamp - evs[0]!.event.timestamp) / 60_000;
    const wpm = sim.items.length / minutes;
    expect(wpm).toBeGreaterThan(100);
    expect(wpm).toBeLessThan(160);
  });
});
