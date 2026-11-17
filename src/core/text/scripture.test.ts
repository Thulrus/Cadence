import { describe, expect, it } from 'vitest';
import { normalizeText, normalizeWords } from './normalize';
import { BOOKS } from './scripture';

const norm = (s: string) => normalizeText(s).join(' ');

describe('scripture references', () => {
  it.each([
    ['John 3:16', 'john three sixteen'],
    ['John 3:16,', 'john three sixteen'],
    ['(John 3:16)', 'john three sixteen'],
    ['1 Nephi 3:7', 'first nephi three seven'],
    ['1st Nephi 3:7', 'first nephi three seven'],
    ['First Nephi 3:7', 'first nephi three seven'],
    ['2 Nephi 2:25', 'second nephi two twenty five'],
    ['4 Nephi 1:15', 'fourth nephi one fifteen'],
    ['2 Cor. 5:17', 'second corinthians five seventeen'],
    ['2 Cor 5:17', 'second corinthians five seventeen'],
    ['1Cor 13:4', 'first corinthians thirteen four'],
    ['II Kings 5:10', 'second kings five ten'],
    ['1 John 1:9', 'first john one nine'],
    ['3 John 1:4', 'third john one four'],
    ['Psalm 23', 'psalm twenty three'],
    ['Psalms 23:1', 'psalms twenty three one'],
    ['Ps. 23:1', 'psalm twenty three one'],
    ['Psalm 119:105', 'psalm one hundred nineteen one hundred five'],
    ['D&C 4:2', 'doctrine and covenants four two'],
    ['D&C 121:7-8', 'doctrine and covenants one hundred twenty one seven through eight'],
    ['Doctrine and Covenants 4:2', 'doctrine and covenants four two'],
    ['Alma 32:21', 'alma thirty two twenty one'],
    ['Moroni 10:4-5', 'moroni ten four through five'],
    ['John 3:16-18', 'john three sixteen through eighteen'],
    ['John 3:16–18', 'john three sixteen through eighteen'],
    ['John 3:16 to 18', 'john three sixteen through eighteen'],
    ['Matthew 5:3-7:27', 'matthew five three through seven twenty seven'],
    ['Phil. 4:13', 'philippians four thirteen'],
    ['Joseph Smith—History 1:17', 'joseph smith history one seventeen'],
    ['JS—H 1:17', 'joseph smith history one seventeen'],
    ['Words of Mormon 1:7', 'words of mormon one seven'],
    ['Rev. 21:4', 'revelation twenty one four'],
    ['Moses 1:39.', 'moses one thirty nine'],
  ])('%s → %s', (raw, expected) => expect(norm(raw)).toBe(expected));

  it.each([
    ['1 Nephi', 'first nephi'],
    ['in 1 Nephi we read', 'in first nephi we read'],
    ['1 of John’s friends', 'one of johns friends'],
    ['3 of the 12 apostles', 'three of the twelve apostles'],
    ['Phil 2 times', 'phil two times'],
    ['my ex 3 times', 'my ex three times'],
    ['I John', 'i john'],
    ['John said', 'john said'],
    ['first Nephi', 'first nephi'],
    ['at 3:16 pm', 'at three sixteen p m'],
    ['meet at 3:05', 'meet at three oh five'],
  ])('leaves non-references alone: %s → %s', (raw, expected) => expect(norm(raw)).toBe(expected));

  it('time vs scripture: a book name makes it a verse', () => {
    expect(norm('Mark 3:05')).toBe('mark three five');
    expect(norm('at 3:05')).toBe('at three oh five');
  });

  it('maps generated tokens back to the words they came from', () => {
    const segs = normalizeWords(['Read', '1', 'Nephi', '3:7', 'today.']);
    expect(segs).toEqual([
      { text: 'read', src: 0 },
      { text: 'first', src: 1 },
      { text: 'nephi', src: 2 },
      { text: 'three', src: 3 },
      { text: 'seven', src: 3 },
      { text: 'today', src: 4 },
    ]);
    const dc = normalizeWords(['D&C', '4:2']);
    expect(dc.map((s) => s.src)).toEqual([0, 0, 0, 1, 1]);
  });

  it('every book has a unique spoken name', () => {
    const names = BOOKS.map((b) => b.spoken);
    expect(new Set(names).size).toBe(names.length);
  });
});
