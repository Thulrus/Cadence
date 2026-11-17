import { describe, expect, it } from 'vitest';
import { normalizeWord } from './normalize';
import { buildScriptIndex, positionForWord, wordForPosition } from './index';
import { parseScript } from './parse';
import type { ScriptIndex } from './types';

const build = (s: string) => buildScriptIndex(parseScript(s));

/** Every token maps to its source word; ranges are contiguous, ordered and non-overlapping. */
function expectExactMapping(index: ScriptIndex) {
  let next = 0;
  for (const [wi, w] of index.script.words.entries()) {
    expect(w.tokenStart).toBe(next);
    expect(w.tokenEnd).toBeGreaterThanOrEqual(w.tokenStart);
    if (w.kind !== 'speech') expect(w.tokenEnd).toBe(w.tokenStart);
    for (let t = w.tokenStart; t < w.tokenEnd; t++) expect(index.tokens[t]!.word).toBe(wi);
    if (w.kind === 'speech') {
      expect(index.tokens.slice(w.tokenStart, w.tokenEnd).map((t) => t.norm)).toEqual(
        normalizeWord(w.text),
      );
    }
    next = w.tokenEnd;
  }
  expect(next).toBe(index.tokens.length);
}

const SAMPLE = `# Opening

Brothers and sisters, I'm grateful [smile] to be here.
It's a well-known truth — we don't walk alone.

## Part *Two*

[look up at camera]
Faith isn't just "belief"; it's action.`;

describe('buildScriptIndex', () => {
  it('builds tokens from speech words only', () => {
    const index = build(SAMPLE);
    const norms = index.tokens.map((t) => t.norm);
    expect(norms).not.toContain('opening');
    expect(norms).not.toContain('smile');
    expect(norms).not.toContain('camera');
    expect(norms.slice(0, 6)).toEqual(['brothers', 'and', 'sisters', 'i', 'am', 'grateful']);
    expect(index.tokens.every((t) => t.weight > 0 && t.weight <= 1)).toBe(true);
    expectExactMapping(index);
  });

  it('handles empty input', () => {
    const index = build('');
    expect(index.tokens).toEqual([]);
    expect(wordForPosition(index, 0)).toBe(-1);
    expect(positionForWord(index, 0)).toBe(0);
  });

  it('maps positions to words and back', () => {
    const index = build("[intro] Don't — stop [beat] now");
    // words: [intro] Don't — stop [beat] now ; tokens: do not stop now
    expect(index.tokens.map((t) => t.norm)).toEqual(['do', 'not', 'stop', 'now']);
    expect(wordForPosition(index, 0)).toBe(1);
    expect(wordForPosition(index, 1)).toBe(1);
    expect(wordForPosition(index, 2)).toBe(3);
    expect(wordForPosition(index, 99)).toBe(5);
    expect(wordForPosition(index, -3)).toBe(1);
    expect(positionForWord(index, 0)).toBe(0); // direction → next speech word
    expect(positionForWord(index, 1)).toBe(0);
    expect(positionForWord(index, 2)).toBe(2); // "—" has no tokens → "stop"
    expect(positionForWord(index, 4)).toBe(3);
    expect(positionForWord(index, 5)).toBe(3);
    expect(positionForWord(index, 6)).toBe(4);
    expectExactMapping(index);
  });

  it('returns tokens.length for a trailing non-speech word', () => {
    const index = build('Amen [sit down]');
    expect(positionForWord(index, 1)).toBe(1);
    expect(positionForWord(index, 2)).toBe(1);
  });

  it('builds a 1,500-word script in well under 50 ms', () => {
    const perCopy = parseScript(SAMPLE).words.length;
    const text = Array.from({ length: Math.ceil(1500 / perCopy) }, () => SAMPLE).join('\n\n');
    const t0 = performance.now();
    const index = build(text);
    const elapsed = performance.now() - t0;
    expect(index.script.words.length).toBeGreaterThanOrEqual(1500);
    expect(elapsed).toBeLessThan(50);
    expectExactMapping(index);
  });
});

describe('buildScriptIndex with numbers and scripture', () => {
  it('maps expanded tokens back to their display words', () => {
    const index = build('Read 1 Nephi 3:7 in 2026, with $20 and 1,000 friends.');
    const pairs = index.tokens.map((t) => `${t.norm}@${index.script.words[t.word]!.text}`);
    expect(pairs).toEqual([
      'read@Read',
      'first@1',
      'nephi@Nephi',
      'three@3:7',
      'seven@3:7',
      'in@in',
      'twenty@2026,',
      'twenty@2026,',
      'six@2026,',
      'with@with',
      'twenty@$20',
      'dollars@$20',
      'and@and',
      'one@1,000',
      'thousand@1,000',
      'friends@friends.',
    ]);
    for (const w of index.script.words) {
      for (let t = w.tokenStart; t < w.tokenEnd; t++) {
        expect(index.script.words[index.tokens[t]!.word]).toBe(w);
      }
    }
  });
});
