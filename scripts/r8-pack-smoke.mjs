/**
 * Pack smoke: import the published-tarball ESM bundle of @zhenre/core 0.3.0
 * inside a happy-dom realm and exercise the shipped API surface
 * (signal -> each -> rowRenderer batch build -> swapAt/removeAt).
 * Validates the exact artifact that npm publish will ship.
 */
import { Window } from 'happy-dom';
import assert from 'node:assert/strict';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis;
g.window = win; g.document = win.document; g.Node = win.Node;
g.Element = win.Element; g.HTMLElement = win.HTMLElement;
g.HTMLTemplateElement = win.HTMLTemplateElement;
g.DocumentFragment = win.DocumentFragment; g.Document = win.Document;
g.Text = win.Text; g.Comment = win.Comment; g.Event = win.Event;
g.CustomEvent = win.CustomEvent; g.MouseEvent = win.MouseEvent;
g.SVGElement = win.SVGElement; g.NodeFilter = win.NodeFilter;

const core = await import('/tmp/core030pack/package/dist/re.js');
const api = Object.keys(core).sort();
console.log('exports(' + api.length + '):', api.join(', '));
for (const k of ['signal', 'each', 'mountEach', 'rowRenderer', 'html', 'append']) {
  assert.ok(k in core, 'missing export: ' + k);
}

// end-to-end: compiled row protocol build + indexed ops on the shipped bundle
const ROW_HTML =
  '<tr><td class="col-md-1"></td><td class="col-md-4"><a></a></td>' +
  '<td class="col-md-1"><a></a></td><td class="col-md-6"></td></tr>';
const rowBatch = core.rowRenderer(ROW_HTML, [[0, 0], [1, 0, 0]], {
  batch: 8,
  values(r, t) { t[0].data = '' + r.id; t[1].data = r.label; },
});
const rows = core.signal(
  Array.from({ length: 30 }, (_, i) => ({ id: i + 1, label: 'row-' + (i + 1) })),
);
const list = core.each(rows, (r) => r.id, rowBatch);
const tbody = win.document.createElement('tbody');
core.mountEach(tbody, list);
assert.equal(tbody.children.length, 30, 'batch build row count');
assert.equal(tbody.children[4].childNodes[1].firstChild.firstChild.data, 'row-5', 'slot fill');

list.swapAt(1, 28);
assert.equal(tbody.children[1].firstChild.firstChild.data, '29', 'swapAt');
list.removeAt(2);
assert.equal(tbody.children.length, 29, 'removeAt');
assert.equal(tbody.children[2].firstChild.firstChild.data, '4', 'removeAt shifts');

console.log('PACK SMOKE PASS — shipped 0.3.0 bundle functional end-to-end');
