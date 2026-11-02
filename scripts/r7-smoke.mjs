/**
 * R7 smoke: verify ?batch=64 and ?batch=128 pages behave identically
 * (row counts after run/add/update/swap/remove/clear + selection styling).
 * Functional gate before burning benchmark time on the interleaved legs.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const server = spawn(process.execPath, ['bench/server.mjs'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch();
const page = await browser.newPage();

const INIT = `
window.__t = async (sel) => {
  const t0 = performance.now();
  (typeof sel === 'string' ? document.querySelector(sel) : sel).click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return performance.now() - t0;
};
`;
await page.addInitScript(INIT);

let fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name}: ${got}${ok ? '' : ' (want ' + want + ')'}`);
}

for (const b of [64, 128]) {
  console.log(`\\n?batch=${b}`);
  const url = `http://localhost:8080/bench/re/index.html?batch=${b}`;
  await page.goto(url, { waitUntil: 'load' });

  await page.evaluate(`__t('#run')`);
  check('run1k rows', await page.locator('#tbody tr').count(), 1000);

  // selection via delegation (label column of row 501)
  await page.evaluate(`__t('#tbody tr:nth-child(501) td:nth-child(2)')`);
  check('select class', await page.locator('#tbody tr:nth-child(501)').getAttribute('class'), 'danger');

  // remove via delegation + sectionRowIndex addressing
  await page.evaluate(`__t('#tbody tr:nth-child(501) td:nth-child(3)')`);
  check('remove -> 999 rows', await page.locator('#tbody tr').count(), 999);
  check('shifted row id', await page.locator('#tbody tr:nth-child(501) td:first-child').innerText(), '502');

  // swap: swapAt(1, 998) is 0-based -> ids 2 and 999 exchange positions
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(`__t('#run')`);
  await page.evaluate(`__t('#swaprows')`);
  check('swap keeps row1 id', await page.locator('#tbody tr:first-child td:first-child').innerText(), '1');
  check('swap row2 -> id 999', await page.locator('#tbody tr:nth-child(2) td:first-child').innerText(), '999');
  check('swap row999 -> id 2', await page.locator('#tbody tr:nth-child(999) td:first-child').innerText(), '2');

  // update every 10th (label = 2nd column)
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(`__t('#run')`);
  await page.evaluate(`__t('#update')`);
  check('update label', (await page.locator('#tbody tr:first-child td:nth-child(2)').innerText()).endsWith('!!!'), true);

  // runlots + add + clear
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(`__t('#runlots')`);
  check('runlots rows', await page.locator('#tbody tr').count(), 10000);
  await page.evaluate(`__t('#add')`);
  check('append -> 11000', await page.locator('#tbody tr').count(), 11000);
  await page.evaluate(`__t('#clear')`);
  check('clear -> 0', await page.locator('#tbody tr').count(), 0);
}

await browser.close();
server.kill();
console.log(fail === 0 ? '\\nSMOKE PASS' : `\\nSMOKE FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
