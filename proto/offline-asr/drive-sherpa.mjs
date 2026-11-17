// usage: node drive-sherpa.mjs <script> <clean|room> <plain|hot> <realtime|fast> [cpuThrottle]
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { grammar } from './tools.mjs';

const [script, cond, hmode, mode, throttle = '1'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
  protocolTimeout: 0,
});
const page = await browser.newPage();
page.on('console', (m) => console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto('http://localhost:8765/sherpa.html');
const cfg =
  hmode === 'hot'
    ? {
        hotwords: grammar(script)
          .map((w) => w.toUpperCase())
          .join('\n'),
      }
    : {};
const loadMs = await page.evaluate((cfg) => window.loadModel(cfg), cfg);
if (+throttle > 1) {
  // Note: CDP CPU throttling does not reach workers (measured); use a cgroup cap instead.
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
}
const res = await page.evaluate(
  (w, mode) => window.run(w, mode),
  `audio/${script}-${cond}.wav`,
  mode,
);
mkdirSync('runs', { recursive: true });
const tag = `sherpa-${script}-${cond}-${hmode}-${mode}-x${throttle}`;
writeFileSync(`runs/${tag}.json`, JSON.stringify(res.events));
console.log(
  JSON.stringify({
    tag,
    loadMs: Math.round(loadMs),
    rtf: +(res.busy / res.audioMs).toFixed(3),
    events: res.events.length,
  }),
);
await browser.close();
