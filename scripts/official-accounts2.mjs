// FINAL official-runner accounts: re-v0.4.0 vs vanillajs vs solid-v1.9.3 vs thane-v0.2.0
// All 11 official columns. Strict win/loss per column (no ties per project discipline).
// Reads webdriver-ts/results/*.json (official selenium runner output, count=15).
import fs from 'node:fs';

const R = '/home/z/my-project/js-framework-benchmark/webdriver-ts/results';
const FWS = [
  ['vanillajs', 'van'],
  ['solid-v1.9.3', 'solid'],
  ['thane-v0.2.0', 'thane'],
  ['re-v0.4.0', 're'],
];
const SPEED = [
  ['01_run1k', 'create rows 1k', 'run 1k'],
  ['02_replace1k', 'replace all rows 1k', 'replace 1k'],
  ['03_update10th1k_x16', 'partial update (every 10th) 1k x16', 'update 10th'],
  ['04_select1k', 'select single row', 'select'],
  ['05_swap1k', 'swap two rows', 'swap rows'],
  ['06_remove-one-1k', 'remove one row', 'remove row'],
  ['07_create10k', 'create many rows 10k', 'create 10k'],
  ['08_create1k-after1k_x2', 'append rows 1k (x2)', 'append 1k'],
  ['09_clear1k_x8', 'clear rows (x8)', 'clear 1k'],
];
const MEM = [
  ['21_ready-memory', 'memory after ready'],
  ['22_run-memory', 'memory after run 1k'],
  ['25_run-clear-memory', 'memory after 5x(run+clear)'],
];
const SIZE = [
  ['41_size-uncompressed', 'bundle size (uncompressed, KB)'],
  ['42_size-compressed', 'bundle size (brotli, KB)'],
  ['43_first-paint', 'first paint (ms)'],
];

const load = (fw, op) => {
  const f = `${R}/${fw}-keyed_${op}.json`;
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};
const script = (fw, op, k) => {
  const v = load(fw, op)?.values?.script?.[k];
  return typeof v === 'number' ? v : null;
};
const def = (fw, op) => {
  const v = load(fw, op)?.values?.DEFAULT?.median;
  return typeof v === 'number' ? v : null;
};
const geo = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const f2 = (x) => (x == null ? '—' : x.toFixed(2));
const f3 = (x) => (x == null ? '—' : x.toFixed(3));

// ---------- console: full detail ----------
console.log('═'.repeat(100));
console.log(' OFFICIAL 11-COLUMN ACCOUNTS — official selenium runner, headless Chrome 156, count=15, keyed');
console.log(' re = re-v0.4.0 | solid = solid-v1.9.3 | thane = thane-v0.2.0 | vanilla = vanillajs-1.0.0');
console.log('═'.repeat(100));

const table = [];
for (const [op, long, short] of SPEED) {
  const m = {}, mean = {}, min = {};
  for (const [fw, nick] of FWS) { m[nick] = script(fw, op, 'median'); mean[nick] = script(fw, op, 'mean'); min[nick] = script(fw, op, 'min'); }
  table.push({ kind: 'speed', op, long, short, m, mean, min });
}
for (const [op, long] of MEM) {
  const m = {};
  for (const [fw, nick] of FWS) m[nick] = def(fw, op);
  table.push({ kind: 'mem', op, long, short: long, m, mean: null, min: null });
}
for (const [op, long] of SIZE) {
  const m = {};
  for (const [fw, nick] of FWS) m[nick] = def(fw, op);
  table.push({ kind: 'size', op, long, short: long, m, mean: null, min: null });
}

console.log('\n── SPEED COLUMNS — script median / mean / min (ms, lower is better) ──');
console.log(
  'op'.padEnd(14),
  ...FWS.map(([, n]) => `${n.padStart(9)} med/mean/min`.slice(0, 21).padStart(21)),
  're/van'.padStart(8), 're/solid'.padStart(9), 're/thane'.padStart(9), ' verdict(re)',
);
const speedFactors = { van: [], solid: [], thane: [] };
let wins = 0, losses = 0;
for (const t of table.filter((x) => x.kind === 'speed')) {
  const { m, mean, min } = t;
  const fac = (a, b) => (m[a] != null && m[b] ? m[a] / m[b] : null);
  const fv = fac('re', 'van'), fs_ = fac('re', 'solid'), ft = fac('re', 'thane');
  if (fv) speedFactors.van.push(fv);
  if (fs_) speedFactors.solid.push(fs_);
  if (ft) speedFactors.thane.push(ft);
  const verd = (x) => (x == null ? '?' : x < 1 ? 'WIN' : 'LOSS');
  const v = [verd(fv), verd(fs_), verd(ft)];
  wins += v.filter((x) => x === 'WIN').length; losses += v.filter((x) => x === 'LOSS').length;
  console.log(
    t.short.padEnd(14),
    ...FWS.map(([, n]) => `${f2(m[n])}/${f2(mean[n])}/${f2(min[n])}`.padStart(21)),
    f2(fv).padStart(8), f2(fs_).padStart(9), f2(ft).padStart(9),
    v.join('/').padStart(11),
  );
}
console.log('\nGEOMEAN of speed factors (9 cols):  re/van =', geo(speedFactors.van).toFixed(4),
  ' re/solid =', geo(speedFactors.solid).toFixed(4), ' re/thane =', geo(speedFactors.thane).toFixed(4));
console.log(`SPEED W/L record: ${wins}W-${losses}L`);

console.log('\n── MEMORY COLUMNS — values.DEFAULT.median (MB, lower is better) ──');
let mw = 0, ml = 0;
for (const t of table.filter((x) => x.kind === 'mem')) {
  const { m } = t;
  const v = [m.re < m.van, m.re < m.solid, m.re < m.thane];
  mw += v.filter(Boolean).length; ml += v.filter((x) => !x).length;
  console.log(
    t.short.padEnd(30),
    ...FWS.map(([, n]) => f3(m[n]).padStart(10)),
    '  verdict(re):', v.map((x) => (x ? 'WIN' : 'LOSS')).join('/'),
  );
}
console.log(`MEMORY W/L record: ${mw}W-${ml}L`);

console.log('\n── SIZE / PAINT — values.DEFAULT.median (lower is better) ──');
let sw = 0, sl = 0;
for (const t of table.filter((x) => x.kind === 'size')) {
  const { m } = t;
  const v = FWS.filter(([fw]) => fw !== 're-v0.4.0').map(([, n]) => m[n]).map((o) => m.re < o);
  sw += v.filter(Boolean).length; sl += v.filter((x) => !x).length;
  console.log(
    t.short.padEnd(32),
    ...FWS.map(([, n]) => f2(m[n]).padStart(10)),
    '  verdict(re):', v.map((x) => (x ? 'WIN' : 'LOSS')).join('/'),
  );
}
console.log(`SIZE+PAINT W/L record: ${sw}W-${sl}L`);
console.log(`\nGRAND TOTAL (9 speed + 3 mem + 3 size/paint, each vs 3 rivals = 45 sub-columns):`);
console.log(`  speed ${wins}W-${losses}L | memory ${mw}W-${ml}L | size/paint ${sw}W-${sl}L | ALL ${wins + mw + sw}W-${losses + ml + sl}L`);
