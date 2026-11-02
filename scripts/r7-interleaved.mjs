/**
 * R7 interleaved pooled benchmark — batch-size fine-tuning (64 vs 128).
 *
 * Three implementations in ONE session, per-op, with fair position rotation:
 *   vanilla — drift floor (official baseline, batch-independent)
 *   b64     — bench/re/index.html?batch=64   (R6 default configuration)
 *   b128    — bench/re/index.html?batch=128  (candidate)
 *
 * Methodology (identical to R5/R6 legs):
 *   - timing = click -> double rAF (official口径, includes style/layout)
 *   - warm ops: fresh page, 5 warmup clicks, then measured on same page
 *   - no-warmup ops (create/append/clear/remove): fresh page per iteration
 *   - impl visit order rotates per round (kill position/DRF bias)
 *   - run twice (two leg files), pool 2x samples per impl, take medians
 *
 * Usage: node scripts/r7-interleaved.mjs /tmp/results-r7-1.json [ROUNDS]
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const OUT = process.argv[2] ?? '/tmp/results-r7.json';
const ROUNDS = Number(process.argv[3] ?? process.env.ROUNDS ?? 4);

const server = spawn(process.execPath, ['bench/server.mjs'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 600));

const IMPLS = {
  vanilla: 'http://localhost:8080/bench/vanilla/index.html',
  b64: 'http://localhost:8080/bench/re/index.html?batch=64',
  b128: 'http://localhost:8080/bench/re/index.html?batch=128',
};
const NAMES = Object.keys(IMPLS);

const INIT = `
window.__t = async (sel) => {
  const t0 = performance.now();
  (typeof sel === 'string' ? document.querySelector(sel) : sel).click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return performance.now() - t0;
};
`;

const OPS = [
  { id: '01_run1k', warm: 0, iters: 10, fresh: true, act: `__t('#run')` },
  { id: '02_replace1k', warm: 5, iters: 20, fresh: false, pre: `__t('#run')`, act: `__t('#run')` },
  { id: '03_update10th1k', warm: 5, iters: 20, fresh: false, pre: `__t('#run')`, act: `__t('#update')` },
  { id: '04_select1k', warm: 5, iters: 20, fresh: false, pre: `__t('#run')`, act: `__t('#tbody tr:nth-child(501) td:nth-child(2)')` },
  { id: '05_swap1k', warm: 5, iters: 20, fresh: false, pre: `__t('#run')`, act: `__t('#swaprows')` },
  { id: '06_remove1k', warm: 0, iters: 12, fresh: true, pre: `__t('#run')`, act: `__t('#tbody tr:nth-child(501) td:nth-child(3)')` },
  { id: '07_run10k', warm: 0, iters: 7, fresh: true, act: `__t('#runlots')` },
  { id: '08_append10k', warm: 0, iters: 7, fresh: true, pre: `__t('#runlots')`, act: `__t('#add')` },
  { id: '09_clear10k', warm: 0, iters: 7, fresh: true, pre: `__t('#runlots')`, act: `__t('#clear')` },
];

const results = {};
for (const n of NAMES) { results[n] = {}; for (const op of OPS) results[n][op.id] = []; }

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(INIT);

async function measureOp(impl, op) {
  if (op.fresh) {
    for (let i = 0; i < op.iters; i++) {
      await page.goto(IMPLS[impl], { waitUntil: 'load' });
      if (op.pre) await page.evaluate(op.pre);
      const ms = await page.evaluate(op.act);
      results[impl][op.id].push(ms);
    }
  } else {
    await page.goto(IMPLS[impl], { waitUntil: 'load' });
    if (op.pre) await page.evaluate(op.pre);
    for (let w = 0; w < op.warm; w++) await page.evaluate(op.act);
    for (let i = 0; i < op.iters; i++) {
      const ms = await page.evaluate(op.act);
      results[impl][op.id].push(ms);
    }
  }
}

for (let round = 0; round < ROUNDS; round++) {
  // fair rotation: each impl visits each position once across the first 3 rounds
  const order = [];
  for (let k = 0; k < NAMES.length; k++) order.push(NAMES[(k + round) % NAMES.length]);
  console.log(`Round ${round + 1}/${ROUNDS}: ${order.join(' -> ')}`);
  for (const op of OPS) {
    for (const impl of order) await measureOp(impl, op);
    console.log(`  ${op.id} done (${results[order[0]][op.id].length} iters/impl)`);
  }
}

/* ---------------- memory (CDP + forced GC) ---------------- */
console.log('Memory metrics');
async function mem(impl, seq) {
  await page.goto(IMPLS[impl], { waitUntil: 'load' });
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  async function heap() {
    await client.send('HeapProfiler.collectGarbage');
    const m = await client.send('Performance.getMetrics');
    return m.metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1024 / 1024;
  }
  const out = {};
  out['10_ready-memory'] = await heap();
  for (const [label, clicks] of seq) {
    for (const c of clicks) await page.evaluate(`__t(${JSON.stringify(c)})`);
    out[label] = await heap();
  }
  await client.detach();
  return out;
}

const memSeq = [
  ['21_run-memory', ['#run']],
  ['23_update5k-memory', ['#update', '#update', '#update', '#update', '#update']],
];
const memory = {};
for (const impl of NAMES) {
  memory[impl] = {};
  memory[impl]['10_ready-memory'] = (await mem(impl, memSeq))['10_ready-memory'];
  const m1 = await mem(impl, memSeq);
  memory[impl]['21_run-memory'] = m1['21_run-memory'];
  memory[impl]['23_update5k-memory'] = m1['23_update5k-memory'];
  await page.goto(IMPLS[impl], { waitUntil: 'load' });
  const c = await page.context().newCDPSession(page);
  await c.send('Performance.enable');
  for (let i = 0; i < 5; i++) await page.evaluate(`__t('#run')`);
  await c.send('HeapProfiler.collectGarbage');
  const m2 = await c.send('Performance.getMetrics');
  memory[impl]['22_replace5k-memory'] = m2.metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1024 / 1024;
  await c.detach();
  await page.goto(IMPLS[impl], { waitUntil: 'load' });
  const c3 = await page.context().newCDPSession(page);
  await c3.send('Performance.enable');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(`__t('#run')`);
    await page.evaluate(`__t('#clear')`);
  }
  await c3.send('HeapProfiler.collectGarbage');
  const m3 = await c3.send('Performance.getMetrics');
  memory[impl]['26_repeat-clear5k-memory'] = m3.metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1024 / 1024;
  await c3.detach();
  console.log(`  ${impl}: ` + JSON.stringify(Object.fromEntries(Object.entries(memory[impl]).map(([k, v]) => [k, v.toFixed(2)]))));
}

await browser.close();
server.kill();

const meta = {
  date: new Date().toISOString(),
  node: process.version,
  browser: 'chromium (playwright bundled)',
  rounds: ROUNDS,
  impls: IMPLS,
  experiment: 'R7 batch-size fine-tuning (64 vs 128), single-variable via ?batch= URL param',
  methodology:
    '3-impl interleaved per-op with fair position rotation; warm ops: 5 warmup + measured same page; fresh ops: reload per iteration; timing = click -> double rAF; pooled-median reported by compare script',
  opIters: Object.fromEntries(OPS.map((o) => [o.id, { warm: o.warm, iters: o.iters * ROUNDS }])),
};
writeFileSync(OUT, JSON.stringify({ meta, durations: results, memory }));
console.log(`Saved ${OUT}`);
