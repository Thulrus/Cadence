import type { Block, DisplayWord, ParsedScript, WordKind } from './types';

/**
 * Parse raw script text into blocks and display words (SPEC §6).
 *
 * - Blank line(s) separate paragraphs; single newlines inside a paragraph become
 *   `lineBreakBefore` on the next word.
 * - `#`..`######` + space at line start → heading block (all words kind `heading`).
 * - `[bracketed text]` → `direction` words (brackets kept in display text). A `[` with no
 *   closing `]` later in the same paragraph is literal text. A direction starting with
 *   "ad-lib" / "adlib" / "ad lib" / "improvise" (any case, e.g. `[ad-lib: the grove story]`)
 *   is an ad-lib marker: its words get `adlib: true` (the aligner holds there, align/aligner.ts).
 * - `*`, `**`, `_`, `__` emphasis markers at word edges are stripped; words between an
 *   opening and closing marker get `emphasis: true`.
 *
 * Token ranges are left at 0; `buildScriptIndex` fills them.
 */
export function parseScript(text: string): ParsedScript {
  const blocks: Block[] = [];
  const words: DisplayWord[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) addBlock('paragraph', paragraph.join('\n'));
    paragraph = [];
  };

  const addBlock = (kind: Block['kind'], body: string, level?: number) => {
    const raw = kind === 'heading' ? splitPlain(body, 'heading') : splitParagraph(body);
    const styled = applyEmphasis(raw);
    if (styled.length === 0) return;
    const blockIndex = blocks.length;
    const wordStart = words.length;
    for (const w of styled) {
      const word: DisplayWord = {
        text: w.text,
        kind: w.kind,
        block: blockIndex,
        tokenStart: 0,
        tokenEnd: 0,
      };
      if (w.lineBreakBefore && words.length > wordStart) word.lineBreakBefore = true;
      if (w.emphasis) word.emphasis = true;
      if (w.adlib) word.adlib = true;
      words.push(word);
    }
    const block: Block = { kind, wordStart, wordEnd: words.length };
    if (level !== undefined) block.level = level;
    blocks.push(block);
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      addBlock('heading', heading[2]!, heading[1]!.length);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return { blocks, words };
}

interface RawWord {
  text: string;
  kind: WordKind;
  lineBreakBefore: boolean;
  emphasis?: boolean;
  adlib?: boolean;
}

/** Bracket text that makes a direction an ad-lib marker (matched against "[word word…]"). */
export const ADLIB_MARKER = /^\[\s*(?:ad[\s-]?lib|improvi[sz])/i;

/** Flag the words of each `[...]` direction whose text is an ad-lib marker. */
function markAdlibs(out: RawWord[]): void {
  for (let i = 0; i < out.length; i++) {
    if (out[i]!.kind !== 'direction' || !out[i]!.text.startsWith('[')) continue;
    let j = i;
    while (j < out.length - 1 && out[j]!.kind === 'direction' && !out[j]!.text.includes(']')) j++;
    const group = out.slice(i, j + 1);
    if (ADLIB_MARKER.test(group.map((w) => w.text).join(' '))) {
      for (const w of group) w.adlib = true;
    }
    i = j;
  }
}

/** Whitespace split with no bracket handling (headings). */
function splitPlain(body: string, kind: WordKind): RawWord[] {
  return body
    .split(/[ \t]+/)
    .filter(Boolean)
    .map((text) => ({ text, kind, lineBreakBefore: false }));
}

const PUNCT_ONLY = /[^\p{L}\p{N}\s[\]]/u;

/** Character scan of a paragraph: whitespace splits words, `[...]` makes directions. */
function splitParagraph(body: string): RawWord[] {
  const out: RawWord[] = [];
  let current = '';
  let kind: WordKind = 'speech';
  let inDirection = false;
  let afterClose = false; // just closed a direction: attach trailing punctuation only
  let pendingBreak = false;

  const flush = () => {
    if (current) out.push({ text: current, kind, lineBreakBefore: pendingBreak });
    if (current) pendingBreak = false;
    current = '';
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '\n' || ch === ' ' || ch === '\t') {
      flush();
      afterClose = false;
      if (!inDirection) kind = 'speech';
      if (ch === '\n') pendingBreak = true;
      continue;
    }
    if (afterClose) {
      if (PUNCT_ONLY.test(ch)) {
        current += ch;
        continue;
      }
      flush();
      afterClose = false;
      kind = 'speech';
    }
    if (!inDirection && ch === '[' && body.indexOf(']', i + 1) !== -1) {
      flush();
      inDirection = true;
      kind = 'direction';
      current = '[';
      continue;
    }
    if (inDirection && ch === ']') {
      current += ']';
      inDirection = false;
      afterClose = true;
      continue;
    }
    current += ch;
  }
  flush();
  markAdlibs(out);
  return out;
}

const LEAD_MARK = /^([("'“‘]*)(\*\*|__|\*|_)(?=\S)/;
const TRAIL_MARK = /(?<=\S)(\*\*|__|\*|_)([.,;:!?)"'”’]*)$/;

/** Strip emphasis markers at word edges and flag the words they enclose. */
function applyEmphasis(raw: RawWord[]): RawWord[] {
  let inEmphasis = false;
  return raw.map((w) => {
    let text = w.text;
    const lead = LEAD_MARK.exec(text);
    if (lead) text = lead[1]! + text.slice(lead[0].length);
    const trail = TRAIL_MARK.exec(text);
    if (trail) text = text.slice(0, trail.index) + trail[2]!;
    if (!text.replace(/[^\p{L}\p{N}]/gu, '')) return { ...w }; // lone markers: literal
    if (lead) inEmphasis = true;
    const out: RawWord = { ...w, text };
    if (inEmphasis) out.emphasis = true;
    if (trail) inEmphasis = false;
    return out;
  });
}
