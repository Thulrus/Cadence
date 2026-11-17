// Spike tooling: grammar building + evaluating recorded recognizer runs against the script.
import { readFileSync } from 'node:fs';
import { parseScript } from '../../src/core/text/parse';
import { buildScriptIndex } from '../../src/core/text/index';
import { normalizeText } from '../../src/core/text/normalize';
import { Aligner } from '../../src/core/align/aligner';
import { ALIGN_DEFAULTS } from '../../src/core/align/config';

const SAMPLES = '../../src/samples/';

function index(name: string) {
  return buildScriptIndex(parseScript(readFileSync(SAMPLES + name + '.md', 'utf8')));
}

export function grammar(name: string): string[] {
  return [...new Set(index(name).tokens.map((t) => t.norm))];
}

interface Ev {
  t: number;
  isFinal: boolean;
  text: string;
  words?: { word: string; start: number; end: number }[];
}

/** Levenshtein alignment, returns pairs (i in a, j in b) of exact matches + edit distance. */
function align(a: string[], b: string[]) {
  const n = a.length,
    m = b.length;
  const d = new Uint32Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = 0; i <= n; i++) d[i * W] = i;
  for (let j = 0; j <= m; j++) d[j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const s = d[(i - 1) * W + j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      d[i * W + j] = Math.min(s, d[(i - 1) * W + j] + 1, d[i * W + j - 1] + 1);
    }
  const pairs: [number, number][] = [];
  let i = n,
    j = m;
  while (i > 0 && j > 0) {
    const cur = d[i * W + j];
    if (a[i - 1] === b[j - 1] && cur === d[(i - 1) * W + j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (cur === d[(i - 1) * W + j - 1] + 1) {
      i--;
      j--;
    } else if (cur === d[(i - 1) * W + j] + 1) i--;
    else j--;
  }
  return { dist: d[n * W + m], pairs: pairs.reverse() };
}

/** Reference truth: script token index -> audio time (ms) the speaker finished it. */
export function truthTimes(name: string, ref: Ev[]): Float64Array {
  const toks = index(name).tokens.map((t) => t.norm);
  const heard: { tok: string; end: number }[] = [];
  for (const e of ref)
    if (e.isFinal && e.words)
      for (const w of e.words)
        for (const tok of normalizeText(w.word)) heard.push({ tok, end: w.end * 1000 });
  const { pairs } = align(
    toks,
    heard.map((h) => h.tok),
  );
  const out = new Float64Array(toks.length).fill(NaN);
  for (const [i, j] of pairs) out[i] = heard[j]!.end;
  // Fill gaps by interpolation, keep monotone.
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(out[i])) {
      let k = i;
      while (k < out.length && Number.isNaN(out[k])) k++;
      const next = k < out.length ? out[k]! : last + 400;
      for (let q = i; q < k; q++) out[q] = last + ((next - last) * (q - i + 1)) / (k - i + 1);
      i = k - 1;
    } else last = out[i] = Math.max(last, out[i]!);
  }
  return out;
}

export function evaluate(name: string, run: Ev[], truth: Float64Array) {
  const idx = index(name);
  const toks = idx.tokens.map((t) => t.norm);
  const finals = run.filter((e) => e.isFinal).flatMap((e) => normalizeText(e.text));
  const { dist } = align(toks, finals);
  const aligner = new Aligner(idx, ALIGN_DEFAULTS);
  const reached = new Float64Array(toks.length).fill(NaN);
  let back = 0;
  let maxAhead = 0;
  const evs = run.filter((e) => e.text.trim() !== '' || e.isFinal);
  for (const e of evs) {
    const before = aligner.state.position;
    aligner.feed({
      words: e.text.split(/\s+/).filter(Boolean),
      isFinal: e.isFinal,
      timestamp: e.t,
    });
    const p = aligner.state.position;
    if (p < before) back++;
    for (let k = before; k < p; k++) if (Number.isNaN(reached[k])) reached[k] = e.t;
    // How far ahead of what has actually been said by now.
    let said = 0;
    while (said < truth.length && truth[said]! <= e.t) said++;
    maxAhead = Math.max(maxAhead, p - said);
  }
  const lat: number[] = [];
  for (let k = 0; k < toks.length; k++)
    if (!Number.isNaN(reached[k])) lat.push(reached[k]! - truth[k]!);
  lat.sort((a, b) => a - b);
  const q = (f: number) => Math.round(lat[Math.floor(f * (lat.length - 1))] ?? NaN);
  return {
    tokens: toks.length,
    wer: +((100 * dist) / toks.length).toFixed(1),
    finalPos: aligner.state.position,
    coverage: +((100 * lat.length) / toks.length).toFixed(1),
    displayLatencyMs: { p50: q(0.5), p90: q(0.9), p99: q(0.99) },
    backMoves: back,
    maxAhead,
  };
}

/** Overlapping n-word phrases of the script (stride n/2) plus every single word. */
export function phraseGrammar(name: string, n: number): string[] {
  const toks = index(name).tokens.map((t) => t.norm);
  const out = new Set<string>();
  for (let i = 0; i < toks.length; i += Math.max(1, n >> 1))
    out.add(toks.slice(i, i + n).join(' '));
  for (const t of toks) out.add(t);
  return [...out];
}
