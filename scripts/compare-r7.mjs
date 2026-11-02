/**
 * R7 compare — pooled medians across leg files, 3-impl table + drift floor.
 *
 * Usage: node scripts/compare-r7.mjs /tmp/results-r7-1.json /tmp/results-r7-2.json [...]
 */
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/compare-r7.mjs <leg1.json> [leg2.json ...]');
  process.exit(1);
}

const { readFileSync } = await import('node:fs');
const legs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const impls = Object.keys(legs[0].durations);
const ops = Object.keys(legs[0].durations[impls[0]]);

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

// pooled samples per impl/op
const pool = {};
for (const impl of impls) {
  pool[impl] = {};
  for (const op of ops) pool[impl][op] = legs.flatMap((l) => l.durations[impl][op]);
}

// vanilla drift floor: |Δ| of vanilla medians between leg halves (odd/even split)
const vanHalf = (which) => {
  const out = {};
  for (const op of ops) {
    const s = legs.flatMap((l) => l.durations.vanilla[op]);
    const h = which === 0 ? s.filter((_, i) => i % 2 === 0) : s.filter((_, i) => i % 2 === 1);
    out[op] = median(h);
  }
  return out;
};
const vh0 = vanHalf(0), vh1 = vanHalf(1);
const drift = (op) => Math.abs(vh1[op] - vh0[op]) / vh0[op];
const geoDrift = Math.exp(ops.reduce((s, op) => s + Math.log(1 + drift(op)), 0) / ops.length) - 1;

const geomean = (impl) =>
  Math.exp(ops.reduce((s, op) => s + Math.log(median(pool[impl][op])), 0) / ops.length);

console.log(`legs: ${files.length}, pooled samples per op: ` +
  ops.map((op) => `${op}=${pool.vanilla[op].length}`).join(' '));
console.log(`vanilla drift floor (odd/even half split): ${(geoDrift * 100).toFixed(2)}% geomean\n`);

const header = ['op', ...impls.map((i) => `med(${i})`), 'b128/b64', 'b64/van', 'b128/van'];
const rows = [header];
for (const op of ops) {
  const meds = Object.fromEntries(impls.map((i) => [i, median(pool[i][op])]));
  rows.push([
    op,
    ...impls.map((i) => meds[i].toFixed(2)),
    (meds.b128 / meds.b64).toFixed(4),
    (meds.b64 / meds.vanilla).toFixed(3),
    (meds.b128 / meds.vanilla).toFixed(3),
  ]);
}
rows.push(['geomean', ...impls.map((i) => geomean(i).toFixed(2)),
  (geomean('b128') / geomean('b64')).toFixed(4),
  (geomean('b64') / geomean('vanilla')).toFixed(3),
  (geomean('b128') / geomean('vanilla')).toFixed(3)]);
console.log(rows.map((r) => r.map((c) => String(c).padStart(12)).join('')).join('\n'));

// verdict per op: |ratio-1| vs 2x drift floor
console.log('\nverdict (signal threshold = 2x drift floor per op):');
for (const op of ops) {
  const r = median(pool.b128[op]) / median(pool.b64[op]);
  const thr = 2 * drift(op);
  const d = r - 1;
  const tag = Math.abs(d) > thr ? (d < 0 ? 'WIN-128' : 'REGRESS') : 'noise';
  console.log(`  ${op}: 128 vs 64 ${(d * 100).toFixed(2)}% (thr ±${(thr * 100).toFixed(2)}%) -> ${tag}`);
}
const g = geomean('b128') / geomean('b64') - 1;
const gthr = 2 * geoDrift;
console.log(`  geomean: 128 vs 64 ${(g * 100).toFixed(2)}% (thr ±${(gthr * 100).toFixed(2)}%) -> ${Math.abs(g) > gthr ? (g < 0 ? 'WIN-128' : 'REGRESS') : 'noise'}`);

// memory table
console.log('\nmemory (MB, forced-GC JSHeapUsedSize, pooled across legs where present):');
const mkeys = Object.keys(legs[0].memory[impls[0]] ?? {});
if (mkeys.length) {
  const mrow = ['mem-op', ...impls.map((i) => `med(${i})`), 'b128-b64'];
  console.log(mrow.map((c) => String(c).padStart(14)).join(''));
  for (const k of mkeys) {
    const meds = Object.fromEntries(impls.map((i) => [i, median(legs.flatMap((l) => l.memory[i][k]))]));
    console.log([k, ...impls.map((i) => meds[i].toFixed(3)), (meds.b128 - meds.b64).toFixed(3)]
      .map((c) => String(c).padStart(14)).join(''));
  }
}
