/**
 * Give a spoken plan timing and turn it into the event stream Web Speech produces: words at a
 * natural pace, grouped into utterances that end (`isFinal`) after pauses, each interim event
 * carrying the *cumulative* hypothesis of the current utterance, after a recognition latency.
 *
 * Interim-level noise (rates from noise.ts): duplicated events, rewrites (the newest word is
 * wrong in one interim and corrected in the next), and the Android quirk where a new
 * utterance's hypotheses start by repeating the previous final.
 */
import type { RecognitionEvent } from '../../core/types';
import { NO_NOISE, type NoiseRates } from './noise';
import type { PauseKind, SpokenItem } from './plan';
import type { Rng } from './rng';

type Range = readonly [lo: number, hi: number];

export interface SpeakConfig {
  wpm: number;
  /** ± fraction of per-word duration. */
  jitter: number;
  /** Time from the end of a word to the recognizer reporting it. */
  latencyMs: Range;
  /** Extra delay after the last word of an utterance before its final result. */
  finalDelayMs: Range;
  pauseMs: Readonly<Record<Exclude<PauseKind, 'none'>, Range>>;
  /** A pause at least this long ends the utterance. */
  utteranceGapMs: number;
  /** The recognizer also cuts utterances that run longer than this many items. */
  maxUtteranceItems: Range;
  /** Probability that a word's interim is merged into the next one (two words at once). */
  mergeProb: number;
  duplicateGapMs: number;
  startMs: number;
}

export const SPEAK_DEFAULTS: Readonly<SpeakConfig> = {
  wpm: 150,
  jitter: 0.3,
  latencyMs: [200, 600],
  finalDelayMs: [250, 700],
  pauseMs: { sentence: [200, 900], paragraph: [900, 1800], direction: [1500, 3000] },
  utteranceGapMs: 600,
  maxUtteranceItems: [15, 40],
  mergeProb: 0.25,
  duplicateGapMs: 40,
  startMs: 1000,
};

export interface TimedEvent {
  event: RecognitionEvent;
  /** Ground truth when this event arrives: truth of the newest item it reports. */
  truth: number;
  /** Index (into the plan) of the newest item reported. */
  item: number;
}

const GARBLE = ['uh', 'um', 'the', 'and', 'in', 'a'];

export function speak(
  items: readonly SpokenItem[],
  rng: Rng,
  noise: NoiseRates = NO_NOISE,
  config: SpeakConfig = SPEAK_DEFAULTS,
): TimedEvent[] {
  const wordMs = 60_000 / config.wpm;
  const out: TimedEvent[] = [];
  let lastT = 0;
  const push = (words: string[], isFinal: boolean, t: number, item: number) => {
    lastT = Math.max(lastT, t);
    out.push({ event: { words, isFinal, timestamp: lastT }, truth: items[item]!.truth, item });
  };

  let t = config.startMs;
  let prevFinal: string[] = [];
  let i = 0;
  while (i < items.length) {
    const limit = Math.round(rng.range(...config.maxUtteranceItems));
    const prefix = prevFinal.length && rng.chance(noise.repeatPrefix) ? prevFinal : [];
    const heard: string[] = [];
    let n = 0;
    let lastRec = 0;
    let hasWords = false;
    for (;;) {
      const it = items[i]!;
      const dur =
        wordMs * Math.max(1, it.words.length) * rng.range(1 - config.jitter, 1 + config.jitter);
      t += dur;
      heard.push(...it.words);
      hasWords ||= it.words.length > 0;
      lastRec = Math.max(lastRec, t + rng.range(...config.latencyMs));
      const pause = it.pause === 'none' ? 0 : rng.range(...config.pauseMs[it.pause]);
      const ends = i === items.length - 1 || pause >= config.utteranceGapMs || ++n >= limit;
      if (it.words.length && hasWords && (ends || !rng.chance(config.mergeProb))) {
        let words = [...prefix, ...heard];
        if (rng.chance(noise.rewrite)) words = [...words.slice(0, -1), rng.pick(GARBLE)];
        push(words, false, lastRec, i);
        if (rng.chance(noise.duplicate)) push(words, false, lastRec + config.duplicateGapMs, i);
      }
      t += pause;
      i++;
      if (ends) {
        if (hasWords) {
          push([...prefix, ...heard], true, lastRec + rng.range(...config.finalDelayMs), i - 1);
          prevFinal = [...prefix, ...heard];
        }
        break;
      }
    }
  }
  return out;
}
