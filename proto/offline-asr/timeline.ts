import { readFileSync } from 'node:fs';
import { parseScript } from '../../src/core/text/parse';
import { buildScriptIndex } from '../../src/core/text/index';
import { Aligner } from '../../src/core/align/aligner';
import { ALIGN_DEFAULTS } from '../../src/core/align/config';
const [script, tag, from = '0', to = '1e9'] = process.argv.slice(2);
const idx = buildScriptIndex(
  parseScript(readFileSync('../../src/samples/' + script + '.md', 'utf8')),
);
const evs = JSON.parse(readFileSync(`runs/${tag}.json`, 'utf8'));
const a = new Aligner(idx, ALIGN_DEFAULTS);
let lastPrint = -1e9,
  prev = 0;
for (const e of evs) {
  a.feed({ words: e.text.split(/\s+/).filter(Boolean), isFinal: e.isFinal, timestamp: e.t });
  const p = a.state.position;
  if (
    e.t >= +from &&
    e.t <= +to &&
    (e.isFinal || e.t - lastPrint > 1500 || Math.abs(p - prev) > 6)
  ) {
    const ctx = idx.tokens
      .slice(Math.max(0, p - 4), p)
      .map((t) => t.norm)
      .join(' ');
    console.log(
      `${(e.t / 1000).toFixed(1).padStart(6)}s pos ${String(p).padStart(4)}${a.state.lost ? ' LOST' : ''} [..${ctx}] ${e.isFinal ? 'F' : 'i'}: …${e.text.split(' ').slice(-8).join(' ')}`,
    );
    lastPrint = e.t;
  }
  prev = p;
}
