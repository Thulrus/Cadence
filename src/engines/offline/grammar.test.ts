import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../../core/text/index';
import { parseScript } from '../../core/text/parse';
import { buildGrammar, GRAMMAR_CONFIG, spokenWords } from './grammar';

const index = (text: string) => buildScriptIndex(parseScript(text));

describe('spokenWords', () => {
  it('uses normalized tokens, keeping written contractions contracted', () => {
    const idx = index("# Title\n\nI don't know, but Alma 37:6 says [pause] it's true.");
    // Headings and directions aren't spoken; "37:6" becomes words.
    expect(spokenWords(idx)).toEqual([
      'i',
      "don't",
      'know',
      'but',
      'alma',
      'thirty',
      'seven',
      'six',
      'says',
      "it's",
      'true',
    ]);
  });

  it('handles curly apostrophes and edge punctuation', () => {
    expect(spokenWords(index('“We’ll see,” she said.'))).toEqual(["we'll", 'see', 'she', 'said']);
  });
});

describe('buildGrammar', () => {
  const cfg = { phraseWords: 4, phraseStride: 2, unknown: '[unk]' };

  it('overlapping phrases, then distinct words, then [unk]', () => {
    const g = buildGrammar(index('one two three four five six seven'), cfg);
    expect(g).toEqual([
      'one two three four',
      'three four five six',
      'five six seven',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      '[unk]',
    ]);
  });

  it('dedups repeated phrases and words', () => {
    const g = buildGrammar(index('a b a b a b a b'), cfg);
    expect(g).toEqual(['a b a b', 'a', 'b', '[unk]']);
  });

  it('a script shorter than one phrase is one phrase', () => {
    expect(buildGrammar(index('hello there'), cfg)).toEqual([
      'hello there',
      'hello',
      'there',
      '[unk]',
    ]);
  });

  it('empty script → just [unk]', () => {
    expect(buildGrammar(index(''), cfg)).toEqual(['[unk]']);
  });

  it('defaults cover every word of a long script and stay JSON-safe', () => {
    const text = Array.from({ length: 300 }, (_, i) => `word${i % 50} "quoted"`).join(' ');
    const g = buildGrammar(index(text));
    expect(g.at(-1)).toBe(GRAMMAR_CONFIG.unknown);
    expect(() => JSON.parse(JSON.stringify(g))).not.toThrow();
    const phrases = g.filter((p) => p.includes(' '));
    expect(phrases.every((p) => p.split(' ').length <= GRAMMAR_CONFIG.phraseWords)).toBe(true);
  });
});
