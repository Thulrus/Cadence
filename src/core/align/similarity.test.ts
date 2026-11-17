import { describe, expect, it } from 'vitest';
import { phoneticKeys } from './phonetic';
import { HOMOPHONES, levenshtein, SIMILARITY_CONFIG, tokenSimilarity } from './similarity';

describe('phoneticKeys', () => {
  it.each([
    ['knight', 'NT'],
    ['night', 'NT'],
    ['write', 'RT'],
    ['nephi', 'NF'],
    ['smith', 'SM0'],
  ])('%s → %s', (w, key) => expect(phoneticKeys(w)[0]).toBe(key));

  it('gives an alternate key', () => {
    expect(phoneticKeys('smith')).toEqual(['SM0', 'XMT']);
    expect(phoneticKeys('')).toEqual(['', '']);
  });
});

describe('levenshtein', () => {
  it.each([
    ['', '', 0],
    ['a', '', 1],
    ['kitten', 'sitting', 3],
    ['faith', 'faith', 0],
    ['apostle', 'apostles', 1],
  ])('%s/%s → %d', (a, b, d) => expect(levenshtein(a, b)).toBe(d));
});

describe('tokenSimilarity', () => {
  it('exact and empty', () => {
    expect(tokenSimilarity('faith', 'faith')).toBe(1);
    expect(tokenSimilarity('', '')).toBe(0);
    expect(tokenSimilarity('faith', '')).toBe(0);
  });

  it('is symmetric and in [0, 1]', () => {
    for (const [a, b] of [
      ['nephi', 'neffi'],
      ['covenant', 'covenants'],
      ['the', 'a'],
    ]) {
      const s = tokenSimilarity(a!, b!);
      expect(s).toBe(tokenSimilarity(b!, a!));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('plurals and small misspellings score high', () => {
    expect(tokenSimilarity('apostle', 'apostles')).toBeGreaterThan(0.85);
    expect(tokenSimilarity('covenant', 'covenants')).toBeGreaterThan(0.85);
    expect(tokenSimilarity('nephi', 'nefi')).toBeGreaterThanOrEqual(SIMILARITY_CONFIG.phonetic);
  });

  it('homophones are near-exact', () => {
    for (const group of HOMOPHONES) {
      expect(tokenSimilarity(group[0]!, group[1]!)).toBeGreaterThanOrEqual(
        SIMILARITY_CONFIG.homophone,
      );
    }
    expect(tokenSimilarity('their', 'there')).toBe(SIMILARITY_CONFIG.homophone);
  });

  it('phonetic matches earn the phonetic score', () => {
    expect(tokenSimilarity('knight', 'night')).toBeGreaterThanOrEqual(SIMILARITY_CONFIG.phonetic);
    expect(tokenSimilarity('schmidt', 'smith')).toBe(SIMILARITY_CONFIG.phonetic);
  });

  it('unrelated words and single letters score 0', () => {
    expect(tokenSimilarity('faith', 'table')).toBe(0);
    expect(tokenSimilarity('a', 'i')).toBe(0);
    expect(tokenSimilarity('in', 'covenant')).toBe(0);
  });

  it('known limit: a split word does not match its pieces well', () => {
    expect(tokenSimilarity('nephi', 'knee')).toBeLessThan(0.5);
    expect(tokenSimilarity('nephi', 'fight')).toBeLessThan(0.5);
  });

  it('10k calls are fast', () => {
    const words = ['faith', 'covenant', 'nephi', 'apostles', 'prophet', 'the', 'commanded', 'lord'];
    const heard = ['faith', 'covenants', 'nefi', 'apostle', 'profit', 'a', 'commander', 'load'];
    let sum = 0;
    let best = Infinity;
    for (let r = 0; r < 4; r++) {
      const t0 = performance.now();
      for (let i = 0; i < 10_000; i++) sum += tokenSimilarity(heard[i % 8]!, words[(i * 7) % 8]!);
      best = Math.min(best, performance.now() - t0); // first run includes JIT + cache fill
    }
    expect(sum).toBeGreaterThan(0);
    expect(best).toBeLessThan(20);
  });
});
