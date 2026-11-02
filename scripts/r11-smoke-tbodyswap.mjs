/**
 * R11 smoke: whole-subtree tbody swap protocol (v0.4.0) on the OFFICIAL
 * bench page served by the OFFICIAL server. Gates before burning runner time.
 * Sequence mirrors the runner's own interaction graphs for 01/02/03/04/05/06/09/25.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'index.ts'], {
  cwd: '/home/z/my-project/js-framework-benchmark/server',
  stdio: 'pipe',
});
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
const page = await browser.newPage();

let fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name}: ${got}${ok ? '' : ' (want ' + want + ')'}`);
}
const click = (sel) => page.evaluate(`document.querySelector('${sel}').click()`);
const rowsN = () => page.locator('#tbody tr').count();
const cell1 = (n) => page.locator(`#tbody tr:nth-of-type(${n}) td:nth-of-type(1)`).innerText();
const cell2 = (n) => page.locator(`#tbody tr:nth-of-type(${n}) td:nth-of-type(2)`).innerText();

const URL = 'http://localhost:8080/frameworks/keyed/re/index.html';
console.log('page', URL);
await page.goto(URL, { waitUntil: 'load' });

// 01 run
await click('#run');
check('run1k rows', await rowsN(), 1000);
check('run1k row1 id', await cell1(1), '1');
check('run1k row1000 id', await cell1(1000), '1000');

// 02 replace (swap protocol): old 1000 rows leave as one subtree
await click('#run');
check('replace rows', await rowsN(), 1000);
check('replace row1 id = 1001', await cell1(1), '1001');
check('replace row1000 id = 2000', await cell1(1000), '2000');

// 03 update every 10th
await click('#update');
const lbl = await cell2(11); // kids[10] -> 11th row (official 'every 10th row' semantics)
check('update11 label has !!!', lbl.endsWith(' !!!'), true);
const lbl991 = await cell2(991);
check('update991 label has !!!', lbl991.endsWith(' !!!'), true);

// 04 select (table-level delegation)
await click('#tbody tr:nth-of-type(5) > td:nth-of-type(2)');
check('select row5 class', await page.locator('#tbody tr:nth-of-type(5)').getAttribute('class'), 'danger');

// 06 remove (table-level delegation, sectionRowIndex addressing)
await click('#tbody tr:nth-of-type(5) > td:nth-of-type(3)');
check('remove -> 999 rows', await rowsN(), 999);
check('deselected on remove', await page.locator('#tbody tr:nth-of-type(5)').getAttribute('class'), null);

// 05 swap
await click('#run'); // replace again (rows 999 -> swap protocol, ids 2001..)
check('pre-swap rows', await rowsN(), 1000);
const r2 = await cell1(2);
const r999 = await cell1(999);
await click('#swaprows');
check('swap row2 -> old row999', await cell1(2), r999);
check('swap row999 -> old row2', await cell1(999), r2);

// 09 clear + re-run x5 (25 sequence) — tbody swaps every clear
for (let i = 0; i < 5; i++) {
  await click('#clear');
  check(`clear#${i + 1} -> 0 rows`, await rowsN(), 0);
  check(`clear#${i + 1} tbody id preserved`, await page.evaluate(`document.querySelectorAll('tbody#tbody').length`), 1);
  await click('#run');
  check(`rerun#${i + 1} -> 1000 rows`, await rowsN(), 1000);
}

// events still live after swaps: select + remove on the newest tbody
await click('#tbody tr:nth-of-type(7) > td:nth-of-type(2)');
check('select after swaps', await page.locator('#tbody tr:nth-of-type(7)').getAttribute('class'), 'danger');
await click('#tbody tr:nth-of-type(7) > td:nth-of-type(3)');
check('remove after swaps -> 999', await rowsN(), 999);

// 08 append
await click('#add');
check('append -> 1999', await rowsN(), 1999);

// single tbody in document at all times
check('exactly one tbody', await page.evaluate(`document.getElementsByTagName('tbody').length`), 1);

await browser.close();
server.kill();
console.log(fail === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
