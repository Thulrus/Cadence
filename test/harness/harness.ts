/**
 * ASR-noise harness (SPEC §11): read each sample script with simulated recognizer noise, drive
 * the real Aligner, assert tracking thresholds, and print a metrics table.
 *
 * Columns: within-5 / within-3 = % of time the position is within N tokens of the truth;
 * lag = mean |truth − position| in tokens; p95 = worst seed's 95th percentile; ahead = most
 * the position ran ahead of the truth (rereads excluded); back = spurious backward moves on
 * interim results / corrective ones (snapping back onto the truth after an overshoot);
 * recover = mean / worst ms from the first word after a skip or reread (ad-lib: after
 * returning to the script) until within 5 tokens for 0.5 s.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { NoiseRates } from '../../src/engines/synth';
import { aggregate, recoveryStats, runScenario, type Metrics } from './run';
import { SCENARIOS, SCRIPTS, SEEDS } from './scenarios';

interface Limits {
  within5: number;
  meanLag: number;
  maxAhead: number;
  corrective: number;
  /** Worst recovery ms for this scenario's disruption kind. */
  recoverMax?: number;
  recoverMean?: number;
}

const LIMITS: Record<keyof typeof SCENARIOS, Limits> = {
  clean: { within5: 0.99, meanLag: 0.1, maxAhead: 2, corrective: 0 },
  light: { within5: 0.97, meanLag: 0.6, maxAhead: 6, corrective: 2 },
  heavy: { within5: 0.88, meanLag: 1.8, maxAhead: 10, corrective: 3 },
  adlib: { within5: 0.97, meanLag: 0.6, maxAhead: 6, corrective: 2, recoverMax: 3000 },
  skip: {
    within5: 0.95,
    meanLag: 1.2,
    maxAhead: 6,
    corrective: 2,
    recoverMean: 2500,
    recoverMax: 5000,
  },
  reread: { within5: 0.96, meanLag: 0.8, maxAhead: 6, corrective: 2, recoverMax: 4500 },
};

/** Register the harness suite for one sample script (one test file per script, so they run in parallel). */
export function harnessSuite(scriptName: string): void {
  const rows: string[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  afterAll(() => {
    const head = [
      'script',
      'scenario',
      'within5',
      'within3',
      'lag',
      'p95',
      'ahead',
      'back',
      'recover',
    ];
    const widths = [15, 9, 8, 8, 6, 5, 6, 6, 12];
    const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join(' ');
    console.log(
      [`\nAligner tracking: ${scriptName} (${SEEDS.length} seeds each)`, fmt(head), ...rows].join(
        '\n',
      ),
    );
  });

  describe(`harness: ${scriptName}`, () => {
    const script = SCRIPTS[scriptName]!;
    it.each(Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[])('%s', (scenario) => {
      const noise: NoiseRates = SCENARIOS[scenario];
      const m: Metrics = aggregate(SEEDS.map((seed) => runScenario(script, { noise, seed })));
      const kind =
        scenario === 'adlib' || scenario === 'skip' || scenario === 'reread' ? scenario : undefined;
      const rec = kind ? recoveryStats(m.recoveries, kind) : null;
      rows.push(
        [
          scriptName.padEnd(15),
          scenario.padEnd(9),
          pct(m.within5).padEnd(8),
          pct(m.within3).padEnd(8),
          m.meanLag.toFixed(2).padEnd(6),
          String(m.p95Lag).padEnd(5),
          String(m.maxAhead).padEnd(6),
          `${m.spuriousBack}/${m.correctiveBack}`.padEnd(6),
          rec && rec.n ? `${rec.mean.toFixed(0)}/${rec.max.toFixed(0)}` : '-',
        ].join(' '),
      );

      const lim = LIMITS[scenario];
      expect(m.spuriousBack, 'spurious backward moves').toBe(0);
      expect(m.correctiveBack, 'corrective backward moves').toBeLessThanOrEqual(lim.corrective);
      expect(m.within5, 'fraction within 5 tokens').toBeGreaterThanOrEqual(lim.within5);
      expect(m.meanLag, 'mean lag').toBeLessThanOrEqual(lim.meanLag);
      expect(m.maxAhead, 'max ahead').toBeLessThanOrEqual(lim.maxAhead);
      if (rec && rec.n) {
        if (lim.recoverMax !== undefined)
          expect(rec.max, 'worst recovery ms').toBeLessThanOrEqual(lim.recoverMax);
        if (lim.recoverMean !== undefined)
          expect(rec.mean, 'mean recovery ms').toBeLessThanOrEqual(lim.recoverMean);
      }
    });
  });
}
