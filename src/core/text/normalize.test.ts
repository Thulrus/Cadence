import { describe, expect, it } from 'vitest';
import { CONTRACTIONS, normalizeText, normalizeWord, normalizeWords } from './normalize';

describe('normalizeWord', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeWord('Hello,')).toEqual(['hello']);
    expect(normalizeWord('"Why?"')).toEqual(['why']);
    expect(normalizeWord('(end).')).toEqual(['end']);
    expect(normalizeWord('...')).toEqual([]);
    expect(normalizeWord('')).toEqual([]);
  });

  it('splits on hyphens and dashes', () => {
    expect(normalizeWord('well-known')).toEqual(['well', 'known']);
    expect(normalizeWord('this—that')).toEqual(['this', 'that']);
    expect(normalizeWord('one–two')).toEqual(['one', 'two']);
    expect(normalizeWord('so--then')).toEqual(['so', 'then']);
    expect(normalizeWord('—')).toEqual([]);
  });

  it('treats curly quotes like straight ones', () => {
    expect(normalizeWord('don’t')).toEqual(normalizeWord("don't"));
    expect(normalizeWord('“Faith”')).toEqual(['faith']);
    expect(normalizeWord('‘tis')).toEqual(['tis']);
  });

  it.each([
    ["don't", ['do', 'not']],
    ["doesn't", ['does', 'not']],
    ["isn't", ['is', 'not']],
    ["couldn't", ['could', 'not']],
    ["I'm", ['i', 'am']],
    ["we'll", ['we', 'will']],
    ["they're", ['they', 'are']],
    ["we've", ['we', 'have']],
    ["you'd", ['you', 'would']],
    ["it's", ['it', 'is']],
    ["he's", ['he', 'is']],
    ["that's", ['that', 'is']],
    ["john's", ['johns']],
    ["students'", ['students']],
    ["o'clock", ['oclock']],
    ["they'd've", ['they', 'would', 'have']],
  ])('expands %s', (raw, expected) => {
    expect(normalizeWord(raw)).toEqual(expected);
  });

  it('expands every whole-word contraction in the table', () => {
    for (const [raw, expected] of Object.entries(CONTRACTIONS)) {
      expect(normalizeWord(raw)).toEqual(expected);
      expect(normalizeWord(raw.toUpperCase())).toEqual(expected);
    }
  });

  it('matches contracted and expanded forms', () => {
    expect(normalizeText("we can't stop")).toEqual(normalizeText('we can not stop'));
    expect(normalizeText('It’s fine')).toEqual(normalizeText('it is fine'));
  });
});

describe('normalizeText / normalizeWords', () => {
  it('handles whitespace and empty input', () => {
    expect(normalizeText('')).toEqual([]);
    expect(normalizeText('   \n\t ')).toEqual([]);
    expect(normalizeText('  Hello   world ')).toEqual(['hello', 'world']);
  });

  it('attributes tokens to source words in order', () => {
    expect(normalizeWords(["Don't", '—', 'well-known'])).toEqual([
      { text: 'do', src: 0 },
      { text: 'not', src: 0 },
      { text: 'well', src: 2 },
      { text: 'known', src: 2 },
    ]);
  });

  it('keeps digits for chunk 07 to expand', () => {
    expect(normalizeText('John 3:16')).toEqual(['john', '316']);
  });
});
