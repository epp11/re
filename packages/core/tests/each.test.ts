import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './helpers/dom.ts';
setupDom();

const { html, append, each, signal, mountList, refRow } = await import('../src/index.ts');

interface Row {
  id: number;
  label: string;
}

function mkRows(n: number, offset = 0): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1 + offset,
    label: 'r' + (i + 1 + offset),
  }));
}

function host(): HTMLElement {
  return document.createElement('div');
}

function rowTpl(r: Row): Node {
  return html`<div class="row" data-id=${r.id}>${r.label}</div>`;
}

function texts(h: HTMLElement): string[] {
  return Array.from(h.querySelectorAll('.row')).map((e) => e.textContent);
}

test('each: initial render + reactive append via signal', () => {
  const rows = signal(mkRows(3));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r2', 'r3']);
  rows.value = rows.peek().concat(mkRows(2, 3));
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r2', 'r3', 'r4', 'r5']);
});

test('each: clear via empty array (fast path)', () => {
  const rows = signal(mkRows(10));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  const sec = h.querySelector('section') as HTMLElement;
  assert.equal(sec.childNodes.length, 11); // anchor + 10
  rows.value = [];
  assert.equal(sec.childNodes.length, 1); // anchor only
  assert.ok(sec.firstChild === list._view!.anchor);
});

test('each: replace all with disjoint keys (fast path)', () => {
  const rows = signal(mkRows(5));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  rows.value = mkRows(5, 100);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r101', 'r102', 'r103', 'r104', 'r105']);
});

test('each: partial update via per-cell signal (no list churn)', () => {
  const rows = signal(
    mkRows(3).map((r) => ({ ...r, label: signal(r.label) })),
  );
  const list = each(
    rows,
    (r) => r.id,
    (r) => html`<div class="row">${r.label}</div>`,
  );
  const h = host();
  append(h, html`<section>${list}</section>`);
  const sec = h.querySelector('section') as HTMLElement;
  (rows.peek()[1]!.label as ReturnType<typeof signal>).value += ' !!!';
  assert.deepEqual(
    Array.from(sec.children).map((c) => c.textContent),
    ['r1', 'r2 !!!', 'r3'],
  );
});

test('each: swap non-adjacent (1 <-> 998 style)', () => {
  const rows = signal(mkRows(1000));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  const sec = h.querySelector('section') as HTMLElement;
  const arr = rows.peek();
  list.swap(arr[1]!.id, arr[998]!.id);
  const out = texts(sec);
  assert.equal(out[1], 'r999'); // data[998] has id 999, label r999
  assert.equal(out[998], 'r2');
  assert.equal(out[0], 'r1');
  assert.equal(out[999], 'r1000');
  // signal value kept in sync quietly
  assert.equal(rows.peek()[1]!.id, 999);
});

test('each: swap adjacent', () => {
  const rows = signal(mkRows(3));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  list.swap(1, 2);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r2', 'r1', 'r3']);
});

test('each: swap symmetric (any argument order)', () => {
  const rows = signal(mkRows(4));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  list.swap(4, 2);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r4', 'r3', 'r2']);
});

test('each: remove by key (fast path)', () => {
  const rows = signal(mkRows(5));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  list.remove(3);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r2', 'r4', 'r5']);
  assert.equal(rows.peek().length, 4);
});

test('each: ref gives the root node', () => {
  const rows = signal(mkRows(3));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  const n = list.ref(2) as HTMLElement;
  assert.equal(n.dataset['id'], '2');
});

test('each: keyed reorder via signal set (generic diff)', () => {
  const rows = signal(mkRows(4));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  const shuffled = [rows.peek()[2]!, rows.peek()[0]!, rows.peek()[3]!, rows.peek()[1]!];
  rows.value = shuffled;
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r3', 'r1', 'r4', 'r2']);
});

test('each: node identity preserved across updates (keyed contract)', () => {
  const rows = signal(mkRows(4));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  const before = list.ref(3);
  rows.value = [rows.peek()[1]!, rows.peek()[0]!, rows.peek()[2]!, rows.peek()[3]!];
  assert.ok(list.ref(3) === before, 'same DOM node must be reused for same key');
});

test('each: row disposal unsubscribes per-row bindings', () => {
  const rows = signal(mkRows(2).map((r) => ({ id: r.id, label: signal(r.label) })));
  const list = each(
    rows,
    (r) => r.id,
    (r) => html`<div>${r.label}</div>`,
  );
  const h = host();
  append(h, html`<section>${list}</section>`);
  const sig1 = rows.peek()[0]!.label as ReturnType<typeof signal>;
  list.remove(1);
  // After removal, updating the orphaned signal must not touch the DOM.
  sig1.value = 'ghost';
  const sec = h.querySelector('section') as HTMLElement;
  assert.equal(sec.children[0]!.textContent, 'r2');
});

test('each: plain array mode (manual sync)', () => {
  const rows: Row[] = mkRows(2);
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  rows.push({ id: 3, label: 'r3' });
  list.sync(rows);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r2', 'r3']);
});

test('each: dispose clears everything and unsubscribes', () => {
  const rows = signal(mkRows(3));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  list._view!.dispose();
  const sec = h.querySelector('section') as HTMLElement;
  assert.equal(sec.childNodes.length, 1);
  rows.value = mkRows(5); // unsubscribed — view must not resurrect rows
  assert.equal(sec.childNodes.length, 1);
});

test('each: works with anchor + foreign siblings (no fast-path corruption)', () => {
  const rows = signal(mkRows(3));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  // host has foreign children + anchor + rows
  const p = el('p', 'head');
  h.appendChild(p);
  append(h, html`<span>${list}</span>`);
  const span = h.querySelector('span') as HTMLElement;
  // view parent is <span>; anchor inside span
  rows.value = [];
  assert.equal(span.childNodes.length, 1);
  rows.value = mkRows(2);
  assert.equal(span.querySelectorAll('.row').length, 2);
  assert.ok(h.querySelector('p') === p, 'foreign sibling intact');
});

test('each: swapAt (index-addressed, no key materialization)', () => {
  const rows = signal(mkRows(5));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  list.swapAt(1, 4);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r5', 'r3', 'r4', 'r2']);
  // source array stays aligned (index space = DOM order)
  assert.equal(rows.peek()[1]!.id, 5);
  assert.equal(rows.peek()[4]!.id, 2);
  // out-of-bounds / same-index are silent no-ops
  list.swapAt(0, 99);
  list.swapAt(2, 2);
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r5', 'r3', 'r4', 'r2']);
});

test('each: removeAt (index-addressed) keeps keys coherent for later key ops', () => {
  const rows = signal(mkRows(6));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  append(h, html`<section>${list}</section>`);
  list.removeAt(2); // remove r3
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r1', 'r2', 'r4', 'r5', 'r6']);
  assert.equal(rows.peek().length, 5);
  // key-addressed ops must still work after index-addressed ones
  list.swapAt(0, 4); // r6 <-> r1  ->  [r6, r2, r4, r5, r1]
  list.remove(6);    // by key — index space must be coherent
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r2', 'r4', 'r5', 'r1']);
  // append after removals stays aligned
  rows.value = rows.peek().concat(mkRows(1, 100));
  assert.deepEqual(texts(h.querySelector('section') as HTMLElement), ['r2', 'r4', 'r5', 'r1', 'r101']);
});

test('each: batch renderer object drives mega-template path (no cast)', async () => {
  const { rowRenderer } = await import('../src/index.ts');
  const rows = signal(mkRows(130)); // 2 full 50-batches + 30 tail
  const rr = rowRenderer<Row>(
    '<div class="row"><b></b><i></i></div>',
    [[0, 0], [1, 0]],
    {
      values(r, t) {
        t[0]!.data = '' + r.id;
        t[1]!.data = r.label;
      },
    },
  );
  const list = each(rows, (r) => r.id, rr);
  const h = host();
  append(h, html`<section>${list}</section>`);
  const sec = h.querySelector('section') as HTMLElement;
  const out = Array.from(sec.children).map((c) => c.textContent);
  assert.equal(out.length, 130);
  assert.equal(out[0], '1r1');
  assert.equal(out[129], '130r130');
  // keyed direct ops on batch-built rows
  list.swapAt(0, 1);
  assert.equal((sec.children[0] as HTMLElement).textContent, '2r2');
  list.removeAt(3);
  assert.equal(sec.children.length, 129);
  // replace-all with disjoint keys (batch path)
  rows.value = mkRows(60, 500);
  assert.equal(sec.children.length, 60);
  assert.equal((sec.children[0] as HTMLElement).textContent, '501r501');
  // clear
  rows.value = [];
  assert.equal(sec.children.length, 0);
});

test('mountEach: mounts immediately (lean embedding is live)', async () => {
  const { mountEach } = await import('../src/index.ts');
  const rows = signal(mkRows(2));
  const list = each(rows, (r) => r.id, rowTpl);
  const h = host();
  const view = mountEach(h, list);
  assert.deepEqual(texts(h), ['r1', 'r2']);
  rows.value = mkRows(3); // signal subscription must already be live
  assert.deepEqual(texts(h), ['r1', 'r2', 'r3']);
  assert.equal(view.size, 3);
});

test('rehost: whole-subtree rehosting drops the ledger without DOM teardown', async () => {
  const rows = signal(mkRows(5));
  const h = host();
  const view = mountList(h, rows, (r) => r.id, rowTpl);
  assert.equal(h.children.length, 5); // comment anchor is not an element child
  // build a fresh host and rehost into it (caller discards the old host wholesale)
  const fresh = host();
  const oldRows = Array.from(view.r);
  view.rehost(fresh);
  assert.equal(view.size, 0);
  assert.equal(view.l.length, 0);
  // anchor moved: fresh host ends with the comment anchor
  assert.equal((fresh.lastChild as Comment).nodeType, 8);
  // old host keeps its rows untouched (caller owns their lifecycle)
  assert.equal(h.contains(oldRows[0] as Node), true);
  // the view is live in the new host: append works there
  rows.value = mkRows(2);
  assert.equal(fresh.querySelectorAll('.row').length, 2);
  assert.equal(h.querySelectorAll('.row').length, 5); // old host untouched
});

function el(tag: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}
