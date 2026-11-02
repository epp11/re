/**
 * @zhenre — the minimal, fastest frontend framework.
 *
 * Native-level experience, zero learning curve:
 *   - templates are real HTML (tagged templates, compiled once, cloned fast)
 *   - components are real Web Components (custom elements)
 *   - state is fine-grained signals (direct DOM updates, no VDOM, no diff)
 *   - lists are anchored keyed views with O(1) direct ops
 *
 * Zero dependencies. ~4KB min+gz.
 */

export {
  signal,
  computed,
  effect,
  batch,
  untrack,
  isSignal,
} from './signal.ts';
export type { Signal, Computed, Reactive, Sub } from './signal.ts';

export { onCleanup, runWithCleanup, runCleanups } from './lifecycle.ts';

export {
  html,
  append,
  registerTemplates,
  __wireTemplate,
  __compileDebug,
  ReFragment,
} from './template.ts';
export type { Slot, CompiledTemplate } from './template.ts';

export {
  each,
  KeyedView,
  mountEach,
  mountList,
  swapKeys,
  removeKey,
  refRow,
} from './each.ts';
export type { EachDirective, RowBatchFn, RowRender } from './each.ts';

export { rowRenderer } from './factory.ts';
export type { CompiledRowRenderer, RowRendererOptions } from './factory.ts';

export { mountRows } from './rowsview.ts';
export type { RowsView, RowsFillFn } from './rowsview.ts';

export { defineElement } from './element.ts';
export type { ElementOptions } from './element.ts';
