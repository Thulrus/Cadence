/** Script data model. See docs/ARCHITECTURE.md "Core data model". */

export type WordKind = 'speech' | 'heading' | 'direction';

export interface DisplayWord {
  /** Exactly as displayed, punctuation attached ("Hello,"); emphasis markers removed. */
  text: string;
  kind: WordKind;
  /** Index into ParsedScript.blocks. */
  block: number;
  /** [tokenStart, tokenEnd) range in ScriptIndex.tokens; empty if not spoken. 0 until indexed. */
  tokenStart: number;
  tokenEnd: number;
  /** A single newline preceded this word inside its paragraph (soft line break). */
  lineBreakBefore?: boolean;
  /** Word was inside `*...*`, `**...**` or `_..._`. */
  emphasis?: boolean;
}

export interface Block {
  kind: 'heading' | 'paragraph';
  /** Heading level 1..6 (headings only). */
  level?: number;
  /** [wordStart, wordEnd) in ParsedScript.words. */
  wordStart: number;
  wordEnd: number;
}

export interface ParsedScript {
  blocks: Block[];
  words: DisplayWord[];
}

export interface MatchToken {
  /** Normalized spoken form, e.g. "one", "do", "not". */
  norm: string;
  /** Index of the DisplayWord that produced it (many tokens → one word). */
  word: number;
  /** IDF-style anchor weight (chunk 08; 1 until then). */
  weight: number;
  /** Phonetic key (chunk 08). */
  phonetic?: string;
}

export interface ScriptIndex {
  script: ParsedScript;
  tokens: MatchToken[];
}
