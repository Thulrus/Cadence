/**
 * Tuning tool, skipped unless V is set. Compare AlignConfig override sets across all scenarios:
 *   V='{"base":{},"wide":{"windowAhead":100}}' HARNESS_SEEDS=5 npx vitest run test/harness/sweep.test.ts
 */
import { it } from 'vitest';
import { aggregate, recoveryStats, runScenario } from './run';
import { SCENARIOS, SCRIPTS, SEEDS } from './scenarios';
it.skipIf(!process.env.V)(
  'sweep',
  () => {
    const variants: Record<string, object> = JSON.parse(process.env.V ?? '{"base":{}}');
    for (const [vn, config] of Object.entries(variants)) {
      const rows: string[] = [];
      let w5 = 0,
        sp = 0,
        ah = 0,
        rec = 0,
        n = 0;
      for (const [name, noise] of Object.entries(SCENARIOS)) {
        const ms = Object.values(SCRIPTS).flatMap((script) =>
          SEEDS.map((seed) => runScenario(script, { noise, seed, config })),
        );
        const m = aggregate(ms);
        const r = recoveryStats(m.recoveries.filter((x) => x.kind !== 'adlib'));
        w5 += m.within5;
        sp += m.spuriousBack;
        ah = Math.max(ah, m.maxAhead);
        rec += r.mean;
        n++;
        rows.push(
          `${name}:${(m.within5 * 100).toFixed(1)}/${m.meanLag.toFixed(2)}/sb${m.spuriousBack}/ah${m.maxAhead}/rec${r.mean.toFixed(0)}-${r.max.toFixed(0)}`,
        );
      }
      console.log(
        vn.padEnd(14),
        'avgW5',
        ((w5 / n) * 100).toFixed(2),
        'sb',
        sp,
        'ah',
        ah,
        'rec',
        (rec / n).toFixed(0),
        '|',
        rows.join(' '),
      );
    }
  },
  600000,
);
