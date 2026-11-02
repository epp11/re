// Official-runner reconciliation: re vs solid vs vanilla, all 11 columns.
// Reads webdriver-ts/results/*.json (official selenium runner output).
import fs from 'node:fs';

const R = '/home/z/my-project/js-framework-benchmark/webdriver-ts/results';
const FWS = ['vanillajs', 'solid-v1.9.3', 're-v0.1.0', 're-old-v0.1.0'];
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
const MEM = [
  ['21_ready-memory', 'ready mem'],
  ['22_run-memory', 'run mem'],
  ['25_run-clear-memory', 'run-clear mem'],
];

const load = (fw, op) => {
  const f = `${R}/${fw}-keyed_${op}.json`;
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return d;
};

// One shape probe
const probe = load('vanillajs', '01_run1k');
console.log('=== JSON shape probe (vanillajs 01_run1k) ===');
console.log('top keys:', Object.keys(probe));
console.log('values keys:', Object.keys(probe.values ?? {}));
console.log('total:', JSON.stringify(probe.values?.total));
console.log('script:', JSON.stringify(probe.values?.script));
console.log('bench runs:', probe.values?.bench ?? probe.values?.results?.length ?? '?');

const data = {};
for (const fw of FWS) {
  data[fw] = {};
  for (const [op] of OPS) data[fw][op] = load(fw, op);
  for (const [op] of MEM) data[fw][op] = load(fw, op);
}

const med = (fw, op) => {
  const d = data[fw]?.[op];
  if (!d) return null;
  const v = d.values?.total?.median;
  return typeof v === 'number' ? v : null;
};
const scriptMed = (fw, op) => {
  const d = data[fw]?.[op];
  const v = d?.values?.script?.median;
  return typeof v === 'number' ? v : null;
};
const memVal = (fw, op) => {
  const d = data[fw]?.[op];
  if (!d) return null;
  // memory/size JSONs: values.DEFAULT.median (MB for memory, KB for size)
  const v = d.values?.DEFAULT?.median ?? d.values?.total?.median;
  return typeof v === 'number' ? v : null;
};
const scriptMean = (fw, op) => {
  const d = data[fw]?.[op];
  const v = d?.values?.script?.mean;
  return typeof v === 'number' ? v : null;
};
const geo = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);

const fmtF = (x) => (x == null ? '   —   ' : x.toFixed(2).padStart(7));
const fmtM = (x) => (x == null ? '   —   ' : (x / 1048576).toFixed(1).padStart(6) + 'M');

console.log('\n=== SCRIPT-TIME MEDIANS (ms, official runner) ===');
const hdr =
  'op            '.padEnd(16) + 'van'.padStart(9) + '  solid'.padStart(9) + '    re'.padStart(9) + '  re-old'.padStart(9);
console.log(hdr);
const factors = { 're/van': [], 'solid/van': [], 're/solid': [] };
for (const [op, label] of OPS) {
  const v = scriptMed('vanillajs', op);
  const s = scriptMed('solid-v1.9.3', op);
  const r = scriptMed('re-v0.1.0', op);
  const ro = scriptMed('re-old-v0.1.0', op);
  if (v && r) factors['re/van'].push(r / v);
  if (v && s) factors['solid/van'].push(s / v);
  if (s && r) factors['re/solid'].push(r / s);
  console.log(
    label.padEnd(14),
    v?.toFixed(2).padStart(8) ?? '   —   ',
    s?.toFixed(2).padStart(8) ?? '   —   ',
    r?.toFixed(2).padStart(8) ?? '   —   ',
    ro?.toFixed(2).padStart(8) ?? '   —   ',
  );
}
console.log('\n=== FACTORS (script median, keyed vanilla = 1.00) ===');
for (const [op, label] of OPS) {
  const v = scriptMed('vanillajs', op);
  const s = scriptMed('solid-v1.9.3', op);
  const r = scriptMed('re-v0.1.0', op);
  const ro = scriptMed('re-old-v0.1.0', op);
  console.log(
    label.padEnd(14),
    ('re/van ' + fmtF(r && v ? r / v : null)).padStart(16),
    ('solid/van ' + fmtF(s && v ? s / v : null)).padStart(18),
    ('re/solid ' + fmtF(r && s ? r / s : null)).padStart(17),
    ('reold/van ' + fmtF(ro && v ? ro / v : null)).padStart(18),
  );
}
const gf = (arr) => (arr.length ? geo(arr) : null);
console.log('\nGEOMEAN(9 ops)  re/van =', gf(factors['re/van'])?.toFixed(4));
console.log('GEOMEAN(9 ops)  solid/van =', gf(factors['solid/van'])?.toFixed(4));
console.log('GEOMEAN(9 ops)  re/solid =', gf(factors['re/solid'])?.toFixed(4));

console.log('\n=== TOTAL-TIME MEDIANS (ms) for reference ===');
for (const [op, label] of OPS) {
  console.log(
    label.padEnd(14),
    med('vanillajs', op)?.toFixed(1).padStart(8) ?? '   —   ',
    med('solid-v1.9.3', op)?.toFixed(1).padStart(8) ?? '   —   ',
    med('re-v0.1.0', op)?.toFixed(1).padStart(8) ?? '   —   ',
  );
}

console.log('\n=== MEMORY (MB, values.DEFAULT.median) ===');
console.log('op             '.padEnd(16) + 'van'.padStart(9) + '  solid'.padStart(9) + '    re'.padStart(9));
for (const [op, label] of MEM) {
  console.log(
    label.padEnd(14),
    memVal('vanillajs', op)?.toFixed(3).padStart(8) ?? '   —   ',
    memVal('solid-v1.9.3', op)?.toFixed(3).padStart(8) ?? '   —   ',
    memVal('re-v0.1.0', op)?.toFixed(3).padStart(8) ?? '   —   ',
  );
}

console.log('\n=== SIZES (KB) ===');
for (const [op, label] of [['41_size-uncompressed', 'uncompressed'], ['42_size-compressed', 'compressed']]) {
  console.log(
    label.padEnd(14),
    memVal('vanillajs', op)?.toFixed(1).padStart(8) ?? '   —   ',
    memVal('solid-v1.9.3', op)?.toFixed(1).padStart(8) ?? '   —   ',
    memVal('re-v0.1.0', op)?.toFixed(1).padStart(8) ?? '   —   ',
  );
}

console.log('\n=== MEAN-based factors (official site uses mean) ===');
const fmean = { re: [], solid: [] };
for (const [op, label] of OPS) {
  const v = scriptMean('vanillajs', op);
  const s = scriptMean('solid-v1.9.3', op);
  const r = scriptMean('re-v0.1.0', op);
  if (v && r) fmean.re.push(r / v);
  if (v && s) fmean.solid.push(s / v);
  console.log(
    label.padEnd(14),
    ('re/van ' + fmtF(r && v ? r / v : null)).padStart(16),
    ('solid/van ' + fmtF(s && v ? s / v : null)).padStart(18),
  );
}
console.log('GEOMEAN(mean)  re/van =', gf(fmean.re)?.toFixed(4), '  solid/van =', gf(fmean.solid)?.toFixed(4));
