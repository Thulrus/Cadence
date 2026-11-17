/** Harness scenarios and the scripts they run on. Shared by harness.test.ts and tuning runs. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NOISE_PROFILES, type NoiseRates } from '../../src/engines/synth';

const DIR = join(import.meta.dirname, '..', '..', 'src', 'samples');

export const SCRIPTS: Record<string, string> = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => [f.replace(/\.md$/, ''), readFileSync(join(DIR, f), 'utf8')]),
);

const light = NOISE_PROFILES.light;

export const SCENARIOS = {
  clean: NOISE_PROFILES.clean,
  light,
  heavy: NOISE_PROFILES.heavy,
  adlib: { ...light, adlib: 0.1 },
  skip: { ...light, skipSentence: 0.04, skipParagraph: 0.05 },
  reread: { ...light, repeatSentence: 0.06 },
} satisfies Record<string, NoiseRates>;

/** Seeds per scenario. `HARNESS_SEEDS=5` for tuning runs (slower, steadier numbers). */
export const SEEDS = Array.from(
  { length: Number(process.env.HARNESS_SEEDS) || 3 },
  (_, i) => i + 1,
);
