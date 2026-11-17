import { describe, expect, it } from 'vitest';
import { normalizeText } from './normalize';
import { numberToWords, ordinalToWords, yearToWords } from './numbers';

const norm = (s: string) => normalizeText(s).join(' ');

describe('numberToWords', () => {
  it.each([
    [0, 'zero'],
    [7, 'seven'],
    [13, 'thirteen'],
    [40, 'forty'],
    [99, 'ninety nine'],
    [100, 'one hundred'],
    [105, 'one hundred five'],
    [1000, 'one thousand'],
    [1500, 'one thousand five hundred'],
    [250_000, 'two hundred fifty thousand'],
    [1_000_000, 'one million'],
    [3_000_000_021, 'three billion twenty one'],
  ])('%d → %s', (n, words) => expect(numberToWords(n)).toBe(words));
});

describe('yearToWords / ordinalToWords', () => {
  it.each([
    [1830, 'eighteen thirty'],
    [1905, 'nineteen oh five'],
    [1900, 'nineteen hundred'],
    [2005, 'two thousand five'],
    [2000, 'two thousand'],
    [2026, 'twenty twenty six'],
  ])('year %d → %s', (n, words) => expect(yearToWords(n)).toBe(words));

  it.each([
    [1, 'first'],
    [2, 'second'],
    [3, 'third'],
    [12, 'twelfth'],
    [20, 'twentieth'],
    [21, 'twenty first'],
    [100, 'one hundredth'],
  ])('ordinal %d → %s', (n, words) => expect(ordinalToWords(n)).toBe(words));
});

describe('number normalization', () => {
  it.each([
    ['7', 'seven'],
    ['1,000', 'one thousand'],
    ['1,000,000.', 'one million'],
    ['12,500', 'twelve thousand five hundred'],
    ['10000', 'ten thousand'],
    ['1500', 'one thousand five hundred'],
    ['in 1830,', 'in eighteen thirty'],
    ['in 2020 and 2021', 'in twenty twenty and twenty twenty one'],
    ['2026', 'twenty twenty six'],
    ['2005', 'two thousand five'],
    ['1900', 'one thousand nine hundred'],
    ['the 1st time', 'the first time'],
    ['the 21st century', 'the twenty first century'],
    ['the 1990s', 'the nineteen nineties'],
    ["the '80s", 'the eighties'],
    ['3.5', 'three point five'],
    ['3.14', 'three point one four'],
    ['50%', 'fifty percent'],
    ['(12.5%)', 'twelve point five percent'],
    ['$20', 'twenty dollars'],
    ['$1', 'one dollar'],
    ['$4.50', 'four dollars fifty'],
    ['$0.50', 'fifty cents'],
    ['$1,000', 'one thousand dollars'],
    ['$2 million', 'two million dollars'],
    ['3:30', 'three thirty'],
    ['3:05', 'three oh five'],
    ['10:00', 'ten'],
    ['3:30 pm', 'three thirty p m'],
    ['3:30 p.m.', 'three thirty p m'],
    ['10 a.m.', 'ten a m'],
    ['at 9 am', 'at nine a m'],
    ['3pm', 'three p m'],
    ['I am here', 'i am here'],
    ['10-12', 'ten to twelve'],
    ['10–12', 'ten to twelve'],
    ['2020-2021', 'twenty twenty to twenty twenty one'],
    ['covid-19', 'covid nineteen'],
    ['3 of the 12 apostles', 'three of the twelve apostles'],
    ['verse 5', 'verse five'],
    ['chapter 3', 'chapter three'],
  ])('%s → %s', (raw, expected) => expect(norm(raw)).toBe(expected));

  it('canonicalizes spoken multiplier phrases', () => {
    const canonical = 'one thousand five hundred';
    expect(norm('fifteen hundred')).toBe(canonical);
    expect(norm('one thousand five hundred')).toBe(canonical);
    expect(norm('a thousand five hundred')).toBe(canonical);
    expect(norm('one thousand and five hundred')).toBe(canonical);
    expect(norm('twenty five hundred people')).toBe(norm('2,500 people'));
    expect(norm('a hundred and five')).toBe(norm('105'));
    expect(norm('two hundred fifty thousand')).toBe(norm('250,000'));
    expect(norm('nineteen hundred')).toBe(norm('1900'));
  });

  it('leaves runs without a multiplier alone', () => {
    expect(norm('twenty twenty six')).toBe('twenty twenty six');
    expect(norm('the one and only')).toBe('the one and only');
    expect(norm('one hundred and')).toBe('one hundred and');
    // Known gap: a dash-joined word isn't split before the collapse pass.
    expect(norm('a hundred-fold')).toBe('a hundred fold');
  });

  it('digit and spoken forms agree (recognizer emits either)', () => {
    for (const [digits, words] of [
      ['$20', 'twenty dollars'],
      ['1,000 years', 'one thousand years'],
      ['in 2026', 'in twenty twenty six'],
      ['3 of the 12', 'three of the twelve'],
    ]) {
      expect(norm(digits!)).toBe(norm(words!));
    }
  });
});
