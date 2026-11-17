/**
 * Script-constrained recognizer grammar (docs/decisions/0001-offline-asr.md).
 *
 * Vosk can decode against a list of phrases instead of its general language model. Giving it
 * the script as overlapping phrases (plus every single word, so any order is still possible,
 * plus `[unk]` for off-script speech) cut word errors by a third and median display latency
 * from ~240 ms to ~80 ms on reverberant test audio, versus the free model. Off-script speech
 * comes out as garbled script words, which the aligner treats like any other noise (it holds
 * and goes Lost; no false jumps in the ad-lib test).
 *
 * Pure: builds the phrase list from a ScriptIndex.
 */
import type { ScriptIndex } from '../../core/text/types';

export interface GrammarConfig {
  phraseWords: number;
  phraseStride: number;
  unknown: string;
}

export const GRAMMAR_CONFIG: Readonly<GrammarConfig> = {
  /** Words per phrase. 4 and 8 measured the same; longer phrases give more context. */
  phraseWords: 8,
  /** Start a new phrase every this many words (overlap = phraseWords − stride). */
  phraseStride: 4,
  /** Vosk's out-of-vocabulary catch-all, so ad-libs don't have to match script words. */
  unknown: '[unk]',
};

/** A contraction as written ("don't", "we'll"): Vosk's lexicon has these as single words. */
const CONTRACTION = /^[a-z]+'[a-z]+$/;
const EDGE_PUNCT = /^[^a-z0-9']+|[^a-z0-9']+$/g;

/**
 * The script as the speaker will say it, in recognizer vocabulary: normalized tokens (so
 * "37:6" → "thirty seven six"), except that written contractions stay contracted, since
 * that's what the audio contains. The aligner normalizes either form identically.
 */
export function spokenWords(index: ScriptIndex): string[] {
  const out: string[] = [];
  const { tokens, script } = index;
  for (let i = 0; i < tokens.length;) {
    const w = tokens[i]!.word;
    let j = i;
    while (j < tokens.length && tokens[j]!.word === w) j++;
    const raw = script.words[w]!.text.toLowerCase().replace(/[‘’]/g, "'").replace(EDGE_PUNCT, '');
    if (CONTRACTION.test(raw)) out.push(raw);
    else for (let k = i; k < j; k++) out.push(tokens[k]!.norm);
    i = j;
  }
  return out;
}

/**
 * Phrase list for `new KaldiRecognizer(rate, JSON.stringify(list))`: overlapping phrases of
 * the script, then each distinct word, then `[unk]`. Deduplicated, order-stable.
 */
export function buildGrammar(
  index: ScriptIndex,
  cfg: Readonly<GrammarConfig> = GRAMMAR_CONFIG,
): string[] {
  const words = spokenWords(index);
  const out = new Set<string>();
  const stride = Math.max(1, cfg.phraseStride);
  for (let i = 0; i < words.length; i += stride) {
    out.add(words.slice(i, i + cfg.phraseWords).join(' '));
    if (i + cfg.phraseWords >= words.length) break;
  }
  for (const w of words) out.add(w);
  out.add(cfg.unknown);
  return [...out];
}
