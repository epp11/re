// Heap retention diagnostic: vanilla vs re after run+clear+gc.
// Usage: node scripts/heap-diff.mjs
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/js-framework-benchmark/webdriver-ts/');
const puppeteer = require('puppeteer-core');

const CHROME = '/home/z/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome';
const PAGES = [
  ['vanilla', 'http://localhost:8080/frameworks/keyed/vanillajs/'],
  ['re', 'http://localhost:8080/frameworks/keyed/re/'],
];

const browser = await puppeteer.launch({
  headless: false,
  executablePath: CHROME,
  args: [
    '--headless=new',
    '--window-size=1280,800',
    '--js-flags=--expose-gc',
    '--no-default-browser-check',
    '--disable-sync',
    '--no-first-run',
    '--disable-extensions',
  ],
  defaultViewport: { width: 1280, height: 800 },
});

const cdp0 = await browser.target().createCDPSession();
await cdp0.send('Performance.enable');

for (const [name, url] of PAGES) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));
  const grab = async (label) => {
    await page.evaluate(() => { gc(); gc(); });
    const client = await page.createCDPSession();
    await client.send('Performance.enable');
    const metrics = await client.send('Performance.getMetrics');
    const m = {};
    for (const x of metrics.metrics) m[x.name] = x.value;
    const live = await page.evaluate(() => document.querySelectorAll('tr').length);
    console.log(
      `${label}  JSHeap=${(m.JSHeapUsedSize / 1048576).toFixed(3)}MB  Nodes=${m.Nodes}  Listeners=${m.JSEventListeners}  liveTR=${live}`,
    );
    await client.detach();
  };
  console.log(`--- ${name} ---`);
  await grab('ready       ');
  await page.click('#run');
  await new Promise((r) => setTimeout(r, 800));
  await grab('after run   ');
  await page.click('#clear');
  await new Promise((r) => setTimeout(r, 300));
  await grab('after clear ');
  await page.close();
}
await browser.close();
