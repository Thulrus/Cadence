import { describe, expect, it } from 'vitest';
import { estimateDurationSec, formatDuration, spokenWordCount } from './stats';

describe('spokenWordCount', () => {
  it('counts only speech words', () => {
    expect(spokenWordCount('# Title here\n\nHello there, friends. [pause] Welcome.')).toBe(4);
  });
  it('is 0 for empty text', () => {
    expect(spokenWordCount('')).toBe(0);
  });
});

describe('estimateDurationSec', () => {
  it('converts words at wpm to seconds', () => {
    expect(estimateDurationSec(150, 150)).toBe(60);
    expect(estimateDurationSec(500, 150)).toBe(200);
  });
  it('is 0 for bad input', () => {
    expect(estimateDurationSec(100, 0)).toBe(0);
    expect(estimateDurationSec(0, 150)).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [45, '45 s'],
    [60, '1 min'],
    [200, '3 min 20 s'],
    [3600, '1 h'],
    [3900, '1 h 5 min'],
  ])('%i → %s', (sec, out) => expect(formatDuration(sec)).toBe(out));
});
