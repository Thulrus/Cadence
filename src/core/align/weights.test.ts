import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../text/index';
import { parseScript } from '../text/parse';
import { STOPWORDS, computeWeights, isStrongAnchor, WEIGHT_CONFIG } from './weights';

const TALK = `Brothers and sisters, I want to talk about faith. Faith is not just belief.
Nephi said that he would go and do the things which the Lord commanded.
I said to my son that faith is a choice. I said it again the next day, and I said it once more.
When Nephi returned, he said the Lord had prepared a way. Faith grows when we act on it.`;

describe('computeWeights', () => {
  const index = buildScriptIndex(parseScript(TALK));
  const weightOf = (w: string) => index.tokens.find((t) => t.norm === w)!.weight;

  it('ranks rare names > common verbs > stopwords', () => {
    expect(weightOf('nephi')).toBeGreaterThan(weightOf('said'));
    expect(weightOf('commanded')).toBeGreaterThan(weightOf('said'));
    expect(weightOf('said')).toBeGreaterThan(weightOf('the'));
    expect(weightOf('the')).toBe(WEIGHT_CONFIG.stopwordWeight);
    expect(weightOf('go')).toBe(WEIGHT_CONFIG.shortWeight);
  });

  it('keeps weights in [0.1, 1] and marks strong anchors', () => {
    for (const t of index.tokens) {
      expect(t.weight).toBeGreaterThanOrEqual(0.1);
      expect(t.weight).toBeLessThanOrEqual(1);
    }
    expect(isStrongAnchor({ weight: weightOf('commanded') })).toBe(true);
    expect(isStrongAnchor({ weight: weightOf('and') })).toBe(false);
  });

  it('handles empty and single-window scripts', () => {
    expect(computeWeights([])).toEqual([]);
    // One window: df is 1 for everything, so only length separates tokens.
    const w = computeWeights(['covenant', 'covenant', 'promise']);
    expect(w[0]).toBe(w[1]);
    expect(w[0]).toBeGreaterThan(w[2]!);
  });

  it('spot-check weights for a sample', () => {
    const sample = index.tokens.slice(0, 12).map((t) => `${t.norm}:${t.weight.toFixed(2)}`);
    expect(sample.join(' ')).toMatchInlineSnapshot(
      `"brothers:1.00 and:0.10 sisters:0.96 i:0.10 want:0.85 to:0.10 talk:0.85 about:0.10 faith:0.53 faith:0.53 is:0.10 not:0.10"`,
    );
  });

  it('stopwords are all lowercase single tokens', () => {
    for (const s of STOPWORDS) expect(s).toMatch(/^[a-z]+$/);
  });
});
