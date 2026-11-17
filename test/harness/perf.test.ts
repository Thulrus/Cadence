import { it } from 'vitest';
import { Aligner } from '../../src/core/align/aligner';
import { resolveConfig } from '../../src/core/align/config';
import { simulateSpeech, NOISE_PROFILES } from '../../src/engines/synth';
import { SCRIPTS } from './scenarios';
/** Aligner timing tool: PERF=1 npx vitest run test/harness/perf.test.ts */
it.skipIf(!process.env.PERF)('perf', () => {
  const sim = simulateSpeech(SCRIPTS['church-talk']!, { noise: NOISE_PROFILES.light, seed: 1 });
  for (let rep = 0; rep < 2; rep++) {
    const a = new Aligner(sim.index, resolveConfig({}));
    const ts: number[] = [];
    for (const te of sim.events) {
      const t = performance.now();
      a.feed(te.event);
      ts.push(performance.now() - t);
    }
    ts.sort((x, y) => x - y);
    console.log(
      'normal: mean',
      (ts.reduce((p, c) => p + c, 0) / ts.length).toFixed(3),
      'p99',
      ts[Math.floor(ts.length * 0.99)]!.toFixed(2),
      'max',
      ts[ts.length - 1]!.toFixed(2),
    );
  }
  const a = new Aligner(sim.index, resolveConfig({}));
  const ts: number[] = [];
  let t0 = 0;
  for (let k = 0; k < 200; k++) {
    t0 += 300;
    const w = 'cars trucks engines highways bridges tunnels'.split(' ').slice(0, 1 + (k % 6));
    const t = performance.now();
    a.feed({ words: w, isFinal: k % 6 === 5, timestamp: t0 });
    ts.push(performance.now() - t);
  }
  console.log(
    'lost?',
    a.state.lost,
    'mean',
    (ts.slice(50).reduce((p, c) => p + c, 0) / 150).toFixed(2),
    'max',
    Math.max(...ts.slice(50)).toFixed(2),
  );
});
