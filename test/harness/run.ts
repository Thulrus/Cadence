/**
 * Drive an Aligner with simulated speech and measure how well it tracks the ground truth.
 *
 * Truth is "known truth": the position after the newest word the recognizer has reported, so
 * recognizer latency isn't charged to the aligner. Position is sampled on a fixed time grid.
 */
import { Aligner } from '../../src/core/align/aligner';
import { resolveConfig, type AlignConfig } from '../../src/core/align/config';
import type { ScriptIndex } from '../../src/core/text/types';
import {
  simulateSpeech,
  type Disruption,
  type NoiseRates,
  type Simulation,
} from '../../src/engines/synth';

export const HARNESS_CONFIG = {
  sampleMs: 100,
  /** "On track" tolerance in tokens for within-N and recovery. */
  tolerance: 5,
  /** Recovery is complete after this long continuously within tolerance. */
  settleMs: 500,
} as const;

export interface Recovery {
  kind: Disruption;
  /** ms from the first recognized word after the disruption until back within tolerance. */
  ms: number;
}

export interface Metrics {
  samples: number;
  meanLag: number;
  p95Lag: number;
  within3: number;
  within5: number;
  /** Largest amount the position ran ahead of the truth (not counting rereads). */
  maxAhead: number;
  /** Backward moves on interim events while the speaker was not rereading (jitter). */
  spuriousBack: number;
  /** Backward moves (not rereading) that land within 1 token of the truth after an overshoot. */
  correctiveBack: number;
  /** All backward moves (including legit reread follows). */
  backMoves: number;
  recoveries: Recovery[];
  finalError: number;
}

interface Sample {
  t: number;
  truth: number;
  pos: number;
  /** The speaker is behind their furthest point (rereading). */
  rereading: boolean;
}

export interface RunOptions {
  noise: NoiseRates;
  seed: number;
  config?: Partial<AlignConfig>;
}

export function runSimulation(sim: Simulation, config?: Partial<AlignConfig>): Metrics {
  const { index, items, events } = sim;
  const aligner = new Aligner(index, resolveConfig(config ?? {}));
  const trace: Sample[] = [];
  let spuriousBack = 0;
  let correctiveBack = 0;
  let backMoves = 0;
  let maxTruth = 0;
  for (const te of events) {
    maxTruth = Math.max(maxTruth, te.truth);
    const before = aligner.state.position;
    aligner.feed(te.event);
    const pos = aligner.state.position;
    if (pos < before) {
      backMoves++;
      const rereading = items[te.item]!.kind === 'reread' || te.truth < maxTruth;
      if (!te.event.isFinal && !rereading) {
        if (Math.abs(pos - te.truth) <= 1 && before > te.truth) correctiveBack++;
        else spuriousBack++;
      }
    }
    trace.push({ t: te.event.timestamp, truth: te.truth, pos, rereading: te.truth < maxTruth });
  }
  return {
    ...metricsFromTrace(trace, index),
    spuriousBack,
    correctiveBack,
    backMoves,
    recoveries: recoveries(sim, trace),
  };
}

function metricsFromTrace(
  trace: readonly Sample[],
  index: ScriptIndex,
): Omit<Metrics, 'spuriousBack' | 'correctiveBack' | 'backMoves' | 'recoveries'> {
  const errs: number[] = [];
  let maxAhead = 0;
  let k = 0;
  const end = trace[trace.length - 1]?.t ?? 0;
  for (let t = trace[0]?.t ?? 0; t <= end; t += HARNESS_CONFIG.sampleMs) {
    while (k + 1 < trace.length && trace[k + 1]!.t <= t) k++;
    const s = trace[k]!;
    errs.push(Math.abs(s.truth - s.pos));
    if (!s.rereading) maxAhead = Math.max(maxAhead, s.pos - s.truth);
  }
  const sorted = [...errs].sort((a, b) => a - b);
  const last = trace[trace.length - 1];
  const frac = (n: number) => errs.filter((e) => e <= n).length / Math.max(1, errs.length);
  return {
    samples: errs.length,
    meanLag: errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length),
    p95Lag: sorted[Math.floor(0.95 * (sorted.length - 1))] ?? 0,
    within3: frac(3),
    within5: frac(HARNESS_CONFIG.tolerance),
    maxAhead,
    finalError: last ? Math.abs(Math.min(last.truth, index.tokens.length) - last.pos) : 0,
  };
}

function recoveries(sim: Simulation, trace: readonly Sample[]): Recovery[] {
  const out: Recovery[] = [];
  const { items, events } = sim;
  items.forEach((it, i) => {
    if (!it.mark) return;
    const first = events.findIndex((e) => e.item >= i);
    if (first < 0) return;
    const t0 = events[first]!.event.timestamp;
    let okSince: number | null = null;
    let ms = Infinity;
    for (let k = first; k < trace.length; k++) {
      const s = trace[k]!;
      const ok = Math.abs(s.truth - s.pos) <= HARNESS_CONFIG.tolerance;
      if (ok && okSince === null) okSince = s.t;
      if (!ok) okSince = null;
      if (okSince !== null && s.t - okSince >= HARNESS_CONFIG.settleMs) {
        ms = okSince - t0;
        break;
      }
      // Stop looking once the next disruption starts.
      if (k > first && items[events[k]!.item]!.mark && events[k]!.item > i) break;
    }
    if (ms === Infinity && okSince !== null) ms = okSince - t0;
    out.push({ kind: it.mark, ms: Math.max(0, ms) });
  });
  return out;
}

export function runScenario(script: string, o: RunOptions): Metrics {
  return runSimulation(simulateSpeech(script, { noise: o.noise, seed: o.seed }), o.config);
}

/** Pool several seeds into one summary (means of rates, worst of maxima). */
export function aggregate(ms: readonly Metrics[]): Metrics {
  const mean = (f: (m: Metrics) => number) => ms.reduce((a, m) => a + f(m), 0) / ms.length;
  const max = (f: (m: Metrics) => number) => Math.max(...ms.map(f));
  const sum = (f: (m: Metrics) => number) => ms.reduce((a, m) => a + f(m), 0);
  return {
    samples: sum((m) => m.samples),
    meanLag: mean((m) => m.meanLag),
    p95Lag: max((m) => m.p95Lag),
    within3: mean((m) => m.within3),
    within5: mean((m) => m.within5),
    maxAhead: max((m) => m.maxAhead),
    spuriousBack: sum((m) => m.spuriousBack),
    correctiveBack: sum((m) => m.correctiveBack),
    backMoves: sum((m) => m.backMoves),
    recoveries: ms.flatMap((m) => m.recoveries),
    finalError: max((m) => m.finalError),
  };
}

/** Recovery summary: count, mean and worst ms (Infinity = never recovered). */
export function recoveryStats(rs: readonly Recovery[], kind?: Disruption) {
  const xs = rs.filter((r) => !kind || r.kind === kind).map((r) => r.ms);
  return {
    n: xs.length,
    mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0,
    max: xs.length ? Math.max(...xs) : 0,
  };
}
