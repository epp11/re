// FINAL official-runner table: re-v0.3.1 vs keyed vanilla vs solid, all 11 columns.
// All numbers: same-session paired (runner measures all frameworks per invocation).
import fs from 'node:fs';

const R = '/home/z/my-project/js-framework-benchmark/webdriver-ts/results';
const OPS = [
  ['01_run1k', 'run 1k'],
  ['02_replace1k', 'replace 1k'],
  ['03_update10th1k_x16', 'update 10th'],
  ['04_select1k', 'select'],
  ['05_swap1k', 'swap rows'],
  ['06_remove-one-1k', 'remove row'],
  ['07_create10k', 'create 10k'],
  ['08_create1k-after1k_x2', 'append 1k'],
  ['09_clear1k_x8', 'clear 1k'],
];
const MEM = [['21_ready-memory', 'ready mem'], ['22_run-memory', 'run mem'], ['25_run-clear-memory', 'run-clear mem']];

const load = (fw, op) => {
  try {
    return JSON.parse(fs.readFileSync(`${R}/${fw}-keyed_${op}.json`, 'utf8'));
  } catch {
    return null;
  }
};
const s = (fw, op) => load(fw, op)?.values?.script ?? null;
const m = (fw, op) => load(fw, op)?.values?.DEFAULT?.median ?? null;
const geo = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);

const f1 = (x) => (x == null ? '—' : x.toFixed(1));
const f3 = (x) => (x == null ? '—' : x.toFixed(2));

console.log('=== OFFICIAL RUNNER — SCRIPT MEDIANS (ms) — final bundle, same-session pairs ===');
console.log('op'.padEnd(13), 'van'.padStart(8), 'solid'.padStart(8), 're'.padStart(7), '  re/van'.padStart(9), 're/solid'.padStart(9), '  verdict');
const fv = [];
const fsd = [];
for (const [op, label] of OPS) {
  const v = s('vanillajs', op);
  const sd = s('solid-v1.9.3', op);
  const r = s('re-v0.3.1', op);
  const rv = v && r ? r.median / v.median : null;
  const rs = sd && r ? r.median / sd.median : null;
  if (rv) fv.push(rv);
  if (rs) fsd.push(rs);
  const verdict = rv == null ? '' : rv < 0.97 ? 'WIN' : rv > 1.03 ? 'behind' : 'parity';
  console.log(
    label.padEnd(13),
    f1(v?.median).padStart(8),
    f1(sd?.median).padStart(8),
    f1(r?.median).padStart(7),
    f3(rv).padStart(9),
    f3(rs).padStart(9),
    '  ' + verdict,
  );
}
console.log('GEO(9)'.padEnd(13), ''.padStart(8), ''.padStart(8), ''.padStart(7), geo(fv).toFixed(3).padStart(9), geo(fsd).toFixed(3).padStart(9));

console.log('\n=== MEANS (official site tail-risk view) ===');
for (const [op, label] of OPS) {
  const v = s('vanillajs', op)?.mean;
  const r = s('re-v0.3.1', op)?.mean;
  console.log(label.padEnd(13), f1(v).padStart(8), f1(r).padStart(8), f3(v && r ? r / v : null).padStart(9));
}

console.log('\n=== MEMORY (MB) ===');
for (const [op, label] of MEM) {
  const v = m('vanillajs', op);
  const sd = m('solid-v1.9.3', op);
  const r = m('re-v0.3.1', op);
  const d = v != null && r != null ? ((r - v) * 1024).toFixed(0) + 'KB' : '—';
  console.log(label.padEnd(16), (v?.toFixed(3) ?? '—').padStart(8), (sd?.toFixed(3) ?? '—').padStart(8), (r?.toFixed(3) ?? '—').padStart(8), '  Δvs van ' + d);
}

console.log('\n=== session provenance ===');
for (const [op] of [...OPS, ...MEM]) {
  const st = fs.statSync(`${R}/re-v0.3.1-keyed_${op}.json`);
  console.log(op.padEnd(26), st.mtime.toISOString().slice(5, 16).replace('T', ' '));
}
