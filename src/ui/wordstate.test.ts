import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../core/text/index';
import { parseScript } from '../core/text/parse';
import { cursorForPosition, spokenDelta } from './wordstate';

describe('cursorForPosition', () => {
  const index = buildScriptIndex(parseScript("# Title\n\nWe don't [beat] stop"));
  // words: Title(0) We(1) don't(2) [beat](3) stop(4); tokens: we do not stop
  it('maps positions to the word holding that token', () => {
    expect(cursorForPosition(index, 0)).toBe(1);
    expect(cursorForPosition(index, 1)).toBe(2);
    expect(cursorForPosition(index, 2)).toBe(2); // second token of "don't"
    expect(cursorForPosition(index, 3)).toBe(4);
  });
  it('is words.length at the end', () => {
    expect(cursorForPosition(index, 4)).toBe(5);
  });
  it('is 0 for a script with no spoken tokens', () => {
    expect(cursorForPosition(buildScriptIndex(parseScript('# Only a heading')), 0)).toBe(0);
  });
});

describe('spokenDelta', () => {
  it('forward adds the range between cursors', () => {
    expect(spokenDelta(3, 7)).toEqual({ add: [3, 7], remove: [7, 7] });
  });
  it('backward removes the range between cursors', () => {
    expect(spokenDelta(7, 3)).toEqual({ add: [3, 3], remove: [3, 7] });
  });
  it('no move changes nothing', () => {
    expect(spokenDelta(4, 4)).toEqual({ add: [4, 4], remove: [4, 4] });
  });
});
