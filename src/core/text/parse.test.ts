import { describe, expect, it } from 'vitest';
import { parseScript } from './parse';

const texts = (s: string) => parseScript(s).words.map((w) => w.text);
const kinds = (s: string) => parseScript(s).words.map((w) => `${w.text}:${w.kind}`);

describe('parseScript', () => {
  it('handles empty and whitespace-only input', () => {
    expect(parseScript('')).toEqual({ blocks: [], words: [] });
    expect(parseScript('  \n\n \t\n')).toEqual({ blocks: [], words: [] });
  });

  it('splits paragraphs on blank lines and keeps punctuation attached', () => {
    const p = parseScript('Hello, world.\n\n\nSecond   para!');
    expect(p.words.map((w) => w.text)).toEqual(['Hello,', 'world.', 'Second', 'para!']);
    expect(p.blocks).toEqual([
      { kind: 'paragraph', wordStart: 0, wordEnd: 2 },
      { kind: 'paragraph', wordStart: 2, wordEnd: 4 },
    ]);
    expect(p.words.map((w) => w.block)).toEqual([0, 0, 1, 1]);
  });

  it('normalizes CRLF and records soft line breaks', () => {
    const p = parseScript('Line one\r\nline two\rline three');
    expect(p.blocks).toHaveLength(1);
    expect(p.words.map((w) => !!w.lineBreakBefore)).toEqual([
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('parses headings of levels 1-6', () => {
    const p = parseScript('# Title here\nBody text\n###### Deep\n#nospace');
    expect(p.blocks.map((b) => [b.kind, b.level])).toEqual([
      ['heading', 1],
      ['paragraph', undefined],
      ['heading', 6],
      ['paragraph', undefined],
    ]);
    expect(kinds('# Title here')).toEqual(['Title:heading', 'here:heading']);
    expect(texts('#nospace')).toEqual(['#nospace']);
    expect(texts('####### seven')).toEqual(['#######', 'seven']);
  });

  it('parses single-word, multi-word and mid-sentence directions', () => {
    expect(kinds('Hello [pause] friends')).toEqual([
      'Hello:speech',
      '[pause]:direction',
      'friends:speech',
    ]);
    expect(kinds('We [look up at camera] begin')).toEqual([
      'We:speech',
      '[look:direction',
      'up:direction',
      'at:direction',
      'camera]:direction',
      'begin:speech',
    ]);
    expect(kinds('word[beat]next')).toEqual(['word:speech', '[beat]:direction', 'next:speech']);
    expect(kinds('end [pause].')).toEqual(['end:speech', '[pause].:direction']);
  });

  it('lets a direction span a soft line break', () => {
    expect(kinds('a [slow\ndown] b')).toEqual([
      'a:speech',
      '[slow:direction',
      'down]:direction',
      'b:speech',
    ]);
  });

  it('treats an unclosed bracket as literal speech', () => {
    expect(kinds('a [b c')).toEqual(['a:speech', '[b:speech', 'c:speech']);
    expect(kinds('a [b\n\nc] d')).toEqual(['a:speech', '[b:speech', 'c]:speech', 'd:speech']);
  });

  it('strips emphasis markers and flags emphasized words', () => {
    const p = parseScript('This is *really* **very important**, _ok_ snake_case 5 * 3');
    expect(p.words.map((w) => w.text)).toEqual([
      'This',
      'is',
      'really',
      'very',
      'important,',
      'ok',
      'snake_case',
      '5',
      '*',
      '3',
    ]);
    expect(p.words.filter((w) => w.emphasis).map((w) => w.text)).toEqual([
      'really',
      'very',
      'important,',
      'ok',
    ]);
  });

  it('strips emphasis in headings', () => {
    expect(texts('## The *Good* News')).toEqual(['The', 'Good', 'News']);
  });
});
