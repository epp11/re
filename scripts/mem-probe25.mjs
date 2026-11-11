// 25-state probe: 5x(run+clear) then GC, self-diff re vs van by constructor.
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
    '--headless=new', '--window-size=1280,800', '--js-flags=--expose-gc',
    '--no-default-browser-check', '--disable-sync', '--no-first-run', '--disable-extensions',
  ],
  defaultViewport: { width: 1280, height: 800 },
});

async function snap(page) {
  const client = await page.createCDPSession();
  await client.send('HeapProfiler.enable');
  await page.evaluate(() => { gc(); gc(); gc(); gc(); });
  const chunks = [];
  client.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await client.detach();
  const raw = JSON.parse(chunks.join(''));
  const meta = raw.snapshot.meta;
  const F = meta.node_fields.length;
  const nameIdx = meta.node_fields.indexOf('name');
  const typeIdx = meta.node_fields.indexOf('type');
  const sizeIdx = meta.node_fields.indexOf('self_size');
  const nodeTypes = meta.node_types;
  const nodes = raw.nodes;
  const n = nodes.length / F;
  const agg = {};
  let total = 0;
  for (let i = 0; i < n; i++) {
    const base = i * F;
    const t = nodeTypes[nodes[base + typeIdx]];
    if (t !== 'object' && t !== 'native' && t !== 'string' && t !== 'closure') continue;
    const name = raw.strings[nodes[base + nameIdx]];
    const sz = nodes[base + sizeIdx];
    total += sz;
    const e = agg[name] ?? (agg[name] = { n: 0, sz: 0 });
    e.n++; e.sz += sz;
  }
  return { total, agg };
}

for (const [name, url] of PAGES) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));
  const base = await snap(page);
  for (let c = 0; c < 5; c++) {
    await page.click('#run');
    await new Promise((r) => setTimeout(r, 500));
    await page.click('#clear');
    await new Promise((r) => setTimeout(r, 300));
  }
  const after = await snap(page);
  console.log(`--- ${name} ---  heapUsed(base)=${(base.total / 1024).toFixed(1)}KB  heapUsed(after 5x run+clear)=${(after.total / 1024).toFixed(1)}KB  delta=${((after.total - base.total) / 1024).toFixed(1)}KB`);
  const keys = new Set([...Object.keys(base.agg), ...Object.keys(after.agg)]);
  const rows = [];
  for (const k of keys) {
    const b = base.agg[k]?.sz ?? 0, a = after.agg[k]?.sz ?? 0;
    const bn = base.agg[k]?.n ?? 0, an = after.agg[k]?.n ?? 0;
    if (a - b !== 0) rows.push([k, bn, b, an, a, a - b]);
  }
  rows.sort((x, y) => Math.abs(y[5]) - Math.abs(x[5]));
  for (const [k, bn, b, an, a, d] of rows.slice(0, 18)) {
    console.log(`  ${String(k).slice(0, 34).padEnd(34)} n ${String(bn).padStart(5)}->${String(an).padStart(5)}  sz ${String(b).padStart(7)}->${String(a).padStart(7)}  Δ${String(d).padStart(8)}`);
  }
  await page.close();
}
await browser.close();
