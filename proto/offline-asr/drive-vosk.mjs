// usage: node drive-vosk.mjs <script> <clean|room> <free|grammar> <realtime|fast> [cpuThrottle]
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { grammar, phraseGrammar } from './tools.mjs';

const [script, cond, gmode, mode, throttle = '1'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
  protocolTimeout: 0,
});
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto('http://localhost:8765/vosk.html');
const cdp = await page.createCDPSession();
const loadMs = await page.evaluate(
  (u) => window.loadModel(u),
  process.env.MODEL ?? 'vosk-small.tar.gz',
);
if (+throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
const g =
  gmode === 'grammar'
    ? JSON.stringify([...grammar(script), '[unk]'])
    : gmode.startsWith('phr')
      ? JSON.stringify([...phraseGrammar(script, +gmode.slice(3)), '[unk]'])
      : null;
const res = await page.evaluate(
  (w, g, mode) => window.run(w, g, mode),
  `audio/${script}-${cond}.wav`,
  g,
  mode,
);
const metrics = await page.metrics();
mkdirSync('runs', { recursive: true });
const tag = `vosk${process.env.MODEL ? '-lite' : ''}-${script}-${cond}-${gmode}-${mode}-x${throttle}`;
writeFileSync(`runs/${tag}.json`, JSON.stringify(res.events));
console.log(
  JSON.stringify({
    tag,
    loadMs: Math.round(loadMs),
    rtf: +(res.total / res.audioMs).toFixed(3),
    events: res.events.length,
    heapMB: +(metrics.JSHeapUsedSize / 1e6).toFixed(1),
  }),
);
await browser.close();
