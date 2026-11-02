import { deepEqual, equal } from 'node:assert';
import { test } from 'node:test';
import { setupDom } from './helpers/dom.ts';
setupDom();

const { rowRenderer, mountList, signal, swapKeys, removeKey } = await import('../src/index.ts');
const window = globalThis as unknown as Window & { document: Document };

interface R {
  id: number;
  label: string;
  t?: Text | null;
}

const SRC =
  '<tr><td class="col-md-1"></td><td class="col-md-4"><a></a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>';
const PATHS = [
  [0, 0], // id text
  [1, 0, 0], // label text
];

function mkRows(n: number, off = 0): R[] {
  const out: R[] = [];
  for (let i = 0; i < n; i++) out.push({ id: off + i + 1, label: 'r' + (off + i + 1) });
  return out;
}

function host(): HTMLElement {
  const div = (window as any).document.createElement('div');
  window.document.body.appendChild(div);
  div.innerHTML = '<table><tbody id="tb"></tbody></table>';
  return div;
}

test('rowRenderer: batch builds all rows with slot values + bind refs', () => {
  const rows = mkRows(120); // 2 full batches + 20 tail
  const seen: number[] = [];
  const rr = rowRenderer<R>(SRC, PATHS, {
    values(r, texts) {
      texts[0]!.data = '' + r.id;
      texts[1]!.data = r.label;
    },
    bind(r, tr, texts) {
      (tr as unknown as { data_id: number }).data_id = r.id;
      r.t = texts[1]!;
      seen.push(r.id);
    },
  });
  const tb = host().querySelector('#tb') as HTMLElement;
  const out: ChildNode[] = [];
  rr.batch(rows, 0, rows.length, tb, out);
  equal(out.length, 120);
  equal(tb.children.length, 120);
  equal((tb.children[0] as HTMLElement).textContent, '1r1');
  equal((tb.children[119] as HTMLElement).textContent, '120r120');
  equal((out[0] as unknown as { data_id: number }).data_id, 1);
  deepEqual(seen, rows.map((r) => r.id));
});

test('rowRenderer: tail batch is trimmed (no phantom rows)', () => {
  const rows = mkRows(53);
  const rr = rowRenderer<R>(SRC, PATHS, {
    values(r, texts) {
      texts[0]!.data = '' + r.id;
      texts[1]!.data = r.label;
    },
  });
  const tb = host().querySelector('#tb') as HTMLElement;
  const out: ChildNode[] = [];
  rr.batch(rows, 0, rows.length, tb, out);
  equal(tb.children.length, 53);
  equal((tb.children[52] as HTMLElement).textContent, '53r53');
});

test('rowRenderer: values write numbers (id) via text.data', () => {
  const rows = mkRows(3);
  const rr = rowRenderer<R>(SRC, PATHS, {
    values(r, texts) {
      texts[0]!.data = '' + r.id;
      texts[1]!.data = r.label;
    },
  });
  const tb = host().querySelector('#tb') as HTMLElement;
  const out: ChildNode[] = [];
  rr.batch(rows, 0, rows.length, tb, out);
  equal((tb.children[2] as HTMLElement).querySelector('td')!.textContent, '3');
});

test('mountList: end-to-end init/append/replace/clear/swap/remove', () => {
  const rows = signal<R[]>(mkRows(100));
  const rr = rowRenderer<R>(SRC, PATHS, {
    values(r, texts) {
      texts[0]!.data = '' + r.id;
      texts[1]!.data = r.label;
    },
    bind(r, tr, texts) {
      (tr as unknown as { data_id: number }).data_id = r.id;
      r.t = texts[1]!;
    },
  });
  const tb = host().querySelector('#tb') as HTMLElement;
  const view = mountList(tb, rows, (r) => r.id, rr as unknown as (r: R) => Node);
  equal(tb.children.length, 100);

  // append via signal (prefix fast path)
  rows.value = [...rows.peek(), ...mkRows(50, 100)];
  equal(tb.children.length, 150);
  equal(view.size, 150);

  // replace-all via signal (disjoint keys)
  rows.value = mkRows(80, 500);
  equal(tb.children.length, 80);
  equal((tb.children[0] as HTMLElement).textContent, '501r501');

  // swap O(1)
  swapKeys(view, 501, 570);
  equal((tb.children[0] as HTMLElement).textContent, '570r570');
  equal((tb.children[69] as HTMLElement).textContent, '501r501');
  equal(rows.peek()[0]!.id, 570);
  equal(rows.peek()[69]!.id, 501);

  // remove O(1)
  removeKey(view, 502);
  equal(tb.children.length, 79);
  equal(rows.peek().length, 79);
  equal(rows.peek().some((r) => r.id === 502), false);

  // clear via empty signal
  rows.value = [];
  equal(tb.children.length, 0);

  // re-init after clear
  rows.value = mkRows(10, 900);
  equal(tb.children.length, 10);
  equal((tb.children[0] as HTMLElement).textContent, '901r901');
});
