// End-to-end: built app (vite preview) + fake mic audio → download model → prompter → voice follow.
// usage: node e2e.mjs <baseUrl> <wav> [seconds] [--offline]
import puppeteer from 'puppeteer-core';

const [base, wav, secs = '40'] = process.argv.slice(2);
const goOffline = process.argv.includes('--offline');
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  protocolTimeout: 0,
  args: [
    '--no-sandbox',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || t.includes('[cadence]'))
    console.log('[page]', m.type(), t.slice(0, 200));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const click = async (text) => {
  const ok = await page.evaluate((text) => {
    const b = [...document.querySelectorAll('button, a')].find(
      (x) => x.textContent.trim() === text && !x.hidden && x.offsetParent !== null,
    );
    if (b) b.click();
    return !!b;
  }, text);
  if (!ok) throw new Error(`no button "${text}"`);
};
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a);

await page.goto(base + '#/settings');
await page.waitForFunction(() =>
  document.querySelector('.model-status')?.textContent.includes('Not downloaded'),
);
log('settings:', await page.$eval('.model-status', (e) => e.textContent));
await click('Download model');
await page.waitForFunction(
  () =>
    /Downloaded\./.test(document.querySelector('.model-status')?.textContent ?? '') ||
    /damaged|Couldn/.test(document.querySelector('.model-status')?.textContent ?? ''),
  { timeout: 120000 },
);
log('model:', await page.$eval('.model-status', (e) => e.textContent));
log('usage:', await page.$eval('.model-usage', (e) => e.textContent).catch(() => '-'));

await page.goto(base + '#/');
await click('Add sample scripts');
await page.waitForFunction(() => document.body.textContent.includes('Community Garden'));
if (goOffline) {
  if (process.argv.includes('--reload')) {
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      // Wait for precache install to finish (active worker).
      while (!reg.active || reg.active.state !== 'activated')
        await new Promise((r) => setTimeout(r, 200));
    });
    await page.reload();
    log(
      'reloaded, controlled by SW:',
      await page.evaluate(() => !!navigator.serviceWorker.controller),
    );
    await page.setOfflineMode(true);
    await page.reload();
    await page.waitForFunction(() => document.body.textContent.includes('Community Garden'));
    log('reloaded OFFLINE; app shell from SW');
  } else {
    await page.setOfflineMode(true);
  }
  log('network OFFLINE');
}
await page.evaluate(() => {
  const row = [...document.querySelectorAll('li, article, .script-row, div')]
    .filter(
      (e) =>
        e.textContent.includes('Community Garden') &&
        [...e.querySelectorAll('button')].some((b) => b.textContent === 'Open'),
    )
    .sort((x, y) => x.textContent.length - y.textContent.length)[0];
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Open').click();
});
await page.waitForSelector('.w-current, .listen-badge');
await new Promise((r) => setTimeout(r, 500));
log(
  'badge before start:',
  await page.$eval('.listen-badge', (e) => `${e.hidden ? 'hidden' : 'shown'} ${e.textContent}`),
);
await click('Start');
const sample = async () =>
  page.evaluate(() => {
    const spans = [...document.querySelectorAll('.prompter-text span[data-w], span[data-w]')];
    const cur = document.querySelector('.w-current');
    return {
      badge: document.querySelector('.listen-badge')?.textContent,
      word: cur ? Number(cur.getAttribute('data-w')) : -1,
      text: cur?.textContent,
      total: spans.length,
    };
  });
let last = -1;
let backs = 0;
for (let i = 0; i < +secs * 2; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const s = await sample();
  if (s.word < last) backs++;
  if (i % 4 === 0) log(JSON.stringify(s));
  last = Math.max(last, s.word);
}
log('backward moves of highlight:', backs, 'furthest word', last);
if (process.argv.includes('--switch')) {
  const pick = (v) =>
    page.evaluate((v) => {
      const sel = [...document.querySelectorAll('.quick-panel select')].find((s) =>
        [...s.options].some((o) => o.value === 'offline'),
      );
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
  await click('Aa');
  const before = await sample();
  await pick('webspeech');
  await new Promise((r) => setTimeout(r, 1500));
  const mid = await sample();
  log('switched to webspeech:', JSON.stringify(before), '→', JSON.stringify(mid));
  await pick('offline');
  await new Promise((r) => setTimeout(r, 4000));
  log('switched back to on-device:', JSON.stringify(await sample()));
}
await browser.close();
