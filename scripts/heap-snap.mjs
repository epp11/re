// Heap snapshot diff: who survives run+clear+gc in vanilla vs re?
// Usage: node scripts/heap-snap.mjs
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/js-framework-benchmark/webdriver-ts/');
const puppeteer = require('puppeteer-core');

const CHROME = '/home/z/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome';
const PAGES = [
  ['vanilla', 'http://localhost:8080/frameworks/keyed/vanillajs/'],
  ['re', 'http://localhost:8080/frameworks/keyed/re/'],
];
const WATCH = new Set([
  'HTMLTableRowElement', 'HTMLTableCellElement', 'HTMLAnchorElement',
  'HTMLSpanElement', 'Text', 'DocumentFragment', 'HTMLTemplateElement',
  'HTMLTableSectionElement', 'Array', 'Object', 'Map', 'Set', 'HTMLBodyElement',
  'system / Context', 'Closure', 'HTMLCollection', 'NodeList',
]);

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

async function snapshot(page) {
  const client = await page.createCDPSession();
  await client.send('HeapProfiler.enable');
  await page.evaluate(() => { gc(); gc(); gc(); });
  const chunks = [];
  client.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await client.detach();
  const raw = JSON.parse(chunks.join(''));
  const meta = raw.snapshot.meta;
  const F = meta.node_fields.length;
  const nameIdx = meta.node_fields.indexOf('name');
  const typeIdx = meta.node_fields.indexOf('type');
  const nodes = raw.nodes;
  const counts = {};
  const n = nodes.length / F;
  for (let i = 0; i < n; i++) {
    const base = i * F;
    const t = raw.strings[nodes[base + typeIdx]];
    if (t === 'object' || t === 'native' || t === 'string') {
      const name = raw.strings[nodes[base + nameIdx]];
      if (WATCH.has(name)) counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return { total: n, counts };
}

for (const [name, url] of PAGES) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));
  const ready = await snapshot(page);
  await page.click('#run');
  await new Promise((r) => setTimeout(r, 800));
  await page.click('#clear');
  await new Promise((r) => setTimeout(r, 300));
  const after = await snapshot(page);
  console.log(`--- ${name} ---`);
  console.log('node type'.padEnd(24), 'ready'.padStart(8), 'after clear'.padStart(13));
  for (const k of WATCH) {
    const a = after.counts[k] ?? 0;
    const b = ready.counts[k] ?? 0;
    if (a > 0 || b > 0) console.log(k.padEnd(24), String(b).padStart(8), String(a).padStart(13));
  }
  console.log('total nodes'.padEnd(24), String(ready.total).padStart(8), String(after.total).padStart(13));
  await page.close();
}
await browser.close();
