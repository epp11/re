// 5-cycle run+clear retention diff (mirrors official 25_run-clear-memory),
// byte-level aggregation via heap snapshot selfSize.
// Usage: node scripts/mem-diff5.mjs
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/js-framework-benchmark/webdriver-ts/');
const puppeteer = require('puppeteer-core');

const CHROME = '/home/z/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome';
const ONLY = process.argv[2];
const PAGES = [
  ['vanilla', 'http://localhost:8080/frameworks/keyed/vanillajs/'],
  ['re', 'http://localhost:8080/frameworks/keyed/re/'],
].filter(([n]) => !ONLY || n === ONLY);

async function heapUsed(page) {
  await page.evaluate(() => { gc(); gc(); });
  return await page.evaluate(() => performance.memory.usedJSHeapSize);
}

async function snapSizes(page) {
  const client = await page.createCDPSession();
  await client.send('HeapProfiler.enable');
  const chunks = [];
  client.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await client.detach();
  const raw = JSON.parse(chunks.join(''));
  const meta = raw.snapshot.meta;
  console.log('  [dbg] node_fields:', meta.node_fields.join(','), 'nodes:', (raw.nodes.length / meta.node_fields.length) | 0);
  console.log('  [dbg] nodes[0] isArray:', Array.isArray(raw.nodes[0]), 'sample:', JSON.stringify(raw.nodes.slice(0, 14)));
  const F = meta.node_fields.length;
  const nameIdx = meta.node_fields.indexOf('name');
  const typeIdx = meta.node_fields.indexOf('type');
  const sizeIdx = meta.node_fields.indexOf('self_size');
  const TYPE = meta.node_types[0]; // type field indexes into the node type enum
  const byName = {};
  const typeDist = {};
  const n = raw.nodes.length / F;
  for (let i = 0; i < n; i++) {
    const base = i * F;
    const t = TYPE[raw.nodes[base + typeIdx]];
    typeDist[t] = (typeDist[t] ?? 0) + 1;
    if (t === 'object' || t === 'native' || t === 'string' || t === 'closure') {
      const name = raw.strings[raw.nodes[base + nameIdx]];
      byName[name] = (byName[name] ?? 0) + raw.nodes[base + sizeIdx];
    }
  }
  console.log('  [dbg] typeDist:', JSON.stringify(typeDist));
  return Object.entries(byName).sort((a, b) => b[1] - a[1]);
}

const rows = [];
for (const [name, url] of PAGES) {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME,
    args: [
      '--headless=new',
      '--window-size=1280,800',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
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
  const ready = await heapUsed(page);
  // official 25 sequence: 5 × (run 1k -> wait row 1000 -> clear -> wait empty)
  for (let i = 0; i < 5; i++) {
    await page.click('#run');
    await page.waitForFunction(
      () => document.querySelector('tbody')?.children?.length >= 1000,
      { timeout: 20000 },
    );
    await page.click('#clear');
    await page.waitForFunction(
      () => document.querySelector('tbody')?.children?.length === 0,
      { timeout: 20000 },
    );
  }
  await new Promise((r) => setTimeout(r, 300));
  const after = await heapUsed(page);
  const sizes = await snapSizes(page);
  console.log(`--- ${name} ---`);
  console.log(`ready=${(ready / 1048576).toFixed(3)}MB  after-5-cycles=${(after / 1048576).toFixed(3)}MB  delta=${((after - ready) / 1024).toFixed(0)}KB`);
  const top = sizes.slice(0, 16);
  console.log('top selfSize names (KB):');
  for (const [nm, sz] of top) console.log('  ', nm.slice(0, 64).padEnd(66), (sz / 1024).toFixed(1).padStart(8));
  rows.push({ name, ready, after });
  await browser.close();
}
console.log('\n=== DELTA DIFF (usedJSHeapSize after 5 cycles) ===');
for (const r of rows) console.log(r.name.padEnd(10), `delta=${((r.after - r.ready) / 1024).toFixed(0)}KB`);
if (rows.length === 2) console.log('re-minus-vanilla =', ((rows[1].after - rows[1].ready) / 1024 - (rows[0].after - rows[0].ready) / 1024).toFixed(0), 'KB');
