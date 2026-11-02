/** Quick functional sanity for bench/re-020 (0.2.0 control page). */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const server = spawn(process.execPath, ['bench/server.mjs'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8080/bench/re-020/index.html', { waitUntil: 'load' });
const wait = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.evaluate(`document.querySelector('#run').click()`);
await wait();
const rows = await page.locator('#tbody tr').count();
const firstId = await page.locator('#tbody tr:first-child td:first-child').innerText();
const label = await page.locator('#tbody tr:first-child td:nth-child(2)').innerText();
await page.evaluate(`document.querySelector('#runlots').click()`);
await wait();
const rows10k = await page.locator('#tbody tr').count();
console.log({ rows, firstId, label: label.slice(0, 30), rows10k });
const ok = rows === 1000 && firstId === '1' && label.length > 5 && rows10k === 10000;
console.log(ok ? 'RE-020 SMOKE PASS' : 'RE-020 SMOKE FAIL');
await browser.close();
server.kill();
process.exit(ok ? 0 : 1);
