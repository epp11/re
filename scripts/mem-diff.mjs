// Memory retention diff with the OFFICIAL metric (measureUserAgentSpecificMemory),
// fresh browser per page (mirrors per-benchmark launches), + snapshot top names.
// Usage: node scripts/mem-diff.mjs
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/js-framework-benchmark/webdriver-ts/');
const puppeteer = require('puppeteer-core');

const CHROME = '/home/z/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome';
const PAGES = [
  ['vanilla', 'http://localhost:8080/frameworks/keyed/vanillajs/'],
  ['re', 'http://localhost:8080/frameworks/keyed/re/'],
];

async function measure(page) {
  await page.evaluate(() => { gc(); gc(); gc(); });
  try {
    return await page.evaluate(async () => {
      const m = await performance.measureUserAgentSpecificMemory();
      return { bytes: m.bytes, js: performance.memory.usedJSHeapSize };
    });
  } catch (e) {
    const dbg = await page.evaluate(() => ({
      coi: self.crossOriginIsolated,
      hasM: typeof performance.measureUserAgentSpecificMemory,
    }));
    console.log('  [fallback]', JSON.stringify(dbg), e.message.slice(0, 80));
    return await page.evaluate(() => ({ bytes: performance.memory.usedJSHeapSize, js: performance.memory.usedJSHeapSize }));
  }
}

async function topNames(page) {
  const client = await page.createCDPSession();
  await client.send('HeapProfiler.enable');
  const chunks = [];
  client.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await client.detach();
  const raw = JSON.parse(chunks.join(''));
  const meta = raw.snapshot.meta;
  const F = meta.node_fields.length;
  const nameIdx = meta.node_fields.indexOf('name');
  const typeIdx = meta.node_fields.indexOf('type');
  const counts = {};
  const n = raw.nodes.length / F;
  for (let i = 0; i < n; i++) {
    const base = i * F;
    const t = raw.strings[raw.nodes[base + typeIdx]];
    if (t === 'object' || t === 'native' || t === 'string' || t === 'closure') {
      const name = raw.strings[raw.nodes[base + nameIdx]];
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

const rows = [];
for (const [name, url] of PAGES) {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME,
    args: [
      '--headless=new',
      '--window-size=1280,800',
      '--js-flags=--expose-gc','--enable-precise-memory-info',
      '--no-default-browser-check',
      '--disable-sync',
      '--no-first-run',
      '--disable-extensions',
    ],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));
  const ready = await measure(page);
  const topReady = await topNames(page);
  await page.click('#run');
  await new Promise((r) => setTimeout(r, 800));
  await page.click('#clear');
  await new Promise((r) => setTimeout(r, 300));
  const after = await measure(page);
  const topAfter = await topNames(page);
  console.log(`--- ${name} ---`);
  console.log(`ready : UASAM=${(ready.bytes / 1048576).toFixed(3)}MB JSHeapUsed=${(ready.js / 1048576).toFixed(3)}MB`);
  console.log(`clear : UASAM=${(after.bytes / 1048576).toFixed(3)}MB JSHeapUsed=${(after.js / 1048576).toFixed(3)}MB`);
  console.log(`delta : UASAM=${((after.bytes - ready.bytes) / 1024).toFixed(0)}KB JSHeapUsed=${((after.js - ready.js) / 1024).toFixed(0)}KB`);
  const mapReady = new Map(topReady);
  const afterMap = new Map(topAfter);
  console.log('top after-clear names (count, delta vs ready):');
  for (const [nm, c] of topAfter.slice(0, 14)) {
    const r0 = mapReady.get(nm) ?? 0;
    console.log('  ', nm.slice(0, 60).padEnd(62), String(c).padStart(7), `(+${c - r0})`);
  }
  rows.push({ name, ready: ready.bytes, after: after.bytes });
  await browser.close();
}
console.log('\n=== SUMMARY (official metric) ===');
for (const r of rows) {
  console.log(r.name.padEnd(10), `ready=${(r.ready / 1048576).toFixed(3)}MB`, `after-clear=${(r.after / 1048576).toFixed(3)}MB`);
}
