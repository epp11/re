/**
 * R8 3-way compare — pooled medians across leg files.
 * Roles: focus=re030 (shipping candidate), base=re020 (npm 0.2.0), ctrl=vanilla.
 * Verdicts: |Δ| vs 2x per-op vanilla drift (odd/even half-split).
 *
 * Usage: node scripts/compare-3way.mjs /tmp/results-r8-1.json [/tmp/results-r8-2.json ...]
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/compare-3way.mjs <leg1.json> [leg2.json ...]');
  process.exit(1);
}

const legs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const impls = Object.keys(legs[0].durations);
if (!impls.includes('re030') || !impls.includes('re020') || !impls.includes('vanilla')) {
  console.error('expected impls vanilla/re030/re020, got: ' + impls.join(','));
  process.exit(1);
}
const ops = Object.keys(legs[0].durations.vanilla);

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

const pool = {};
for (const impl of impls) {
  pool[impl] = {};
  for (const op of ops) pool[impl][op] = legs.flatMap((l) => l.durations[impl][op]);
}

const vanHalf = (which) => {
  const out = {};
  for (const op of ops) {
    const s = legs.flatMap((l) => l.durations.vanilla[op]);
    out[op] = median(which === 0 ? s.filter((_, i) => i % 2 === 0) : s.filter((_, i) => i % 2 === 1));
  }
  return out;
};
const vh0 = vanHalf(0), vh1 = vanHalf(1);
const drift = (op) => Math.abs(vh1[op] - vh0[op]) / vh0[op];
const geoDrift = Math.exp(ops.reduce((s, op) => s + Math.log(1 + drift(op)), 0) / ops.length) - 1;

const geomean = (impl) =>
  Math.exp(ops.reduce((s, op) => s + Math.log(median(pool[impl][op])), 0) / ops.length);

console.log(`legs: ${files.length}, pooled samples: ` +
  ops.map((op) => `${op}=${pool.vanilla[op].length}`).join(' '));
console.log(`vanilla drift floor: ${(geoDrift * 100).toFixed(2)}% geomean\n`);

const rows = [['op', 'med(van)', 'med(020)', 'med(030)', '030/020', '020/van', '030/van']];
for (const op of ops) {
  rows.push([
    op,
    median(pool.vanilla[op]).toFixed(2),
    median(pool.re020[op]).toFixed(2),
    median(pool.re030[op]).toFixed(2),
    (median(pool.re030[op]) / median(pool.re020[op])).toFixed(4),
    (median(pool.re020[op]) / median(pool.vanilla[op])).toFixed(3),
    (median(pool.re030[op]) / median(pool.vanilla[op])).toFixed(3),
  ]);
}
rows.push([
  'geomean',
  geomean('vanilla').toFixed(2),
  geomean('re020').toFixed(2),
  geomean('re030').toFixed(2),
  (geomean('re030') / geomean('re020')).toFixed(4),
  (geomean('re020') / geomean('vanilla')).toFixed(3),
  (geomean('re030') / geomean('vanilla')).toFixed(3),
]);
console.log(rows.map((r) => r.map((c) => String(c).padStart(12)).join('')).join('\n'));

console.log('\nverdict 030 vs 020 (threshold = 2x per-op vanilla drift):');
let regress = 0;
for (const op of ops) {
  const r = median(pool.re030[op]) / median(pool.re020[op]) - 1;
  const thr = 2 * drift(op);
  const tag = Math.abs(r) > thr ? (r < 0 ? 'WIN' : 'REGRESS') : 'noise/flat';
  if (tag === 'REGRESS') regress++;
  console.log(`  ${op}: ${(r * 100).toFixed(2)}% (thr ±${(thr * 100).toFixed(2)}%) -> ${tag}`);
}
const g = geomean('re030') / geomean('re020') - 1;
console.log(`  geomean: ${(g * 100).toFixed(2)}% (thr ±${(2 * geoDrift * 100).toFixed(2)}%) -> ${Math.abs(g) > 2 * geoDrift ? (g < 0 ? 'WIN' : 'REGRESS') : 'noise/flat'}`);
console.log(regress === 0 ? '\nRELEASE GATE: no per-op regression vs 0.2.0' : `\nRELEASE GATE: ${regress} op(s) regress vs 0.2.0 — INVESTIGATE`);

console.log('\nmemory (MB, forced-GC):');
const mkeys = Object.keys(legs[0].memory?.re030 ?? {});
if (mkeys.length) {
  console.log(['mem-op', 'med(van)', 'med(020)', 'med(030)', '030-020'].map((c) => String(c).padStart(14)).join(''));
  for (const k of mkeys) {
    const mv = median(legs.flatMap((l) => l.memory.vanilla[k] ?? [NaN]));
    const m0 = median(legs.flatMap((l) => l.memory.re020[k]));
    const m3 = median(legs.flatMap((l) => l.memory.re030[k]));
    console.log([k, mv.toFixed(3), m0.toFixed(3), m3.toFixed(3), (m3 - m0).toFixed(3)].map((c) => String(c).padStart(14)).join(''));
  }
}
