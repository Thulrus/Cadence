/** Simulated speech: script → noisy, timed recognizer events. Pure and seeded. */
import { buildScriptIndex } from '../../core/text/index';
import { parseScript } from '../../core/text/parse';
import type { ScriptIndex } from '../../core/text/types';
import { applyNoise, NO_NOISE, type NoiseRates } from './noise';
import { planSpeech, type SpokenItem } from './plan';
import { createRng } from './rng';
import { speak, SPEAK_DEFAULTS, type SpeakConfig, type TimedEvent } from './speak';

export * from './noise';
export * from './plan';
export * from './rng';
export * from './speak';

export interface Simulation {
  index: ScriptIndex;
  items: SpokenItem[];
  events: TimedEvent[];
}

export interface SimulateOptions {
  noise?: NoiseRates;
  seed?: number;
  speak?: Partial<SpeakConfig>;
}

/** Read `source` (script text or an existing index) aloud with the given noise. */
export function simulateSpeech(source: string | ScriptIndex, o: SimulateOptions = {}): Simulation {
  const index = typeof source === 'string' ? buildScriptIndex(parseScript(source)) : source;
  const rng = createRng(o.seed ?? 1);
  const noise = o.noise ?? NO_NOISE;
  const items = applyNoise(planSpeech(index), noise, rng);
  const events = speak(items, rng, noise, { ...SPEAK_DEFAULTS, ...o.speak });
  return { index, items, events };
}
