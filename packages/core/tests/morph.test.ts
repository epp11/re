import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './helpers/dom.ts';
setupDom();

const { rowRenderer, each, signal, mountEach } = await import('../src/index.ts');

interface Row {
  id: number;
  label: string;
}

const SRC =
  '<tr><td class="col-md-1"></td><td class="col-md-4"><a></a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>';
const PATHS = [
  [0, 0], // id text
  [1, 0, 0], // label text
];

function mkRows(n: number, offset = 0): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1 + offset,
    label: 'r' + (i + 1 + offset),
  }));
}

function renderer(bind?: boolean) {
  return rowRenderer<Row>(SRC, PATHS, {
    values(r, t) {
      t[0]!.data = '' + r.id;
      t[1]!.data = r.label;
    },
    ...(bind
      ? {
          bind(r: Row, root: ChildNode) {
            (root as unknown as { data_id: number }).data_id = r.id;
          },
        }
      : {}),
  });
}

test('each: same-shape total re-key morphs compiled rows in place', () => {
  const rows = signal(mkRows(130)); // spans 3 batches (default 50)
  const list = each(rows, (r) => r.id, renderer());
  const tb = document.createElement('tbody');
  document.body.appendChild(tb);
  mountEach(tb, list);

  const before = Array.from(tb.children) as HTMLElement[];
  assert.equal(before.length, 130);
  assert.equal(before[0]!.textContent, '1r1');

  // total re-key, same shape: ids 501..630 share nothing with 1..130
  rows.value = mkRows(130, 500);

  const after = Array.from(tb.children) as HTMLElement[];
  assert.equal(after.length, 130);
  // node identity preserved — morph, not rebuild
  assert.ok(after[0] === before[0]);
  assert.ok(after[64] === before[64]);
  assert.ok(after[129] === before[129]);
  // texts re-written for every row (batch boundaries included)
  assert.equal(after[0]!.textContent, '501r501');
  assert.equal(after[49]!.textContent, '550r550');
  assert.equal(after[50]!.textContent, '551r551');
  assert.equal(after[129]!.textContent, '630r630');
});

test('each: morph falls back to rebuild when bind state exists', () => {
  const rows = signal(mkRows(10));
  const list = each(rows, (r) => r.id, renderer(true));
  const tb = document.createElement('tbody');
  document.body.appendChild(tb);
  mountEach(tb, list);
  const before = Array.from(tb.children) as HTMLElement[];
  rows.value = mkRows(10, 100);
  const after = Array.from(tb.children) as HTMLElement[];
  assert.equal(after.length, 10);
  // rebuild path: fresh nodes, fresh bind state
  assert.ok(after[0] !== before[0]);
  assert.equal(after[0]!.textContent, '101r101');
  assert.equal((after[0] as unknown as { data_id: number }).data_id, 101);
});

test('each: morph keeps keyed ops coherent after re-key', () => {
  const rows = signal(mkRows(5));
  const list = each(rows, (r) => r.id, renderer());
  const tb = document.createElement('tbody');
  document.body.appendChild(tb);
  mountEach(tb, list);
  rows.value = mkRows(5, 100); // morph
  // keyed direct ops must see the NEW keys
  list.remove(102);
  assert.equal(tb.children.length, 4);
  assert.equal((tb.children[0] as HTMLElement).textContent, '101r101');
  assert.equal((tb.children[1] as HTMLElement).textContent, '103r103');
  list.swapAt(0, 3);
  assert.equal((tb.children[0] as HTMLElement).textContent, '105r105');
  assert.equal((tb.children[3] as HTMLElement).textContent, '101r101');
});
