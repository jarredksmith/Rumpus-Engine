// build 1438 — the Signals fold says whose prop it is editing, and can reach the rest.
//
// Found by a four-critic audit. Build 1299's whole subject was that the inspector had two different rules
// for one selection with nothing saying which was which, and it labelled every fold it found. It missed
// this one — the fold a logic-driven level is actually built in:
//
//   `buildSignalsUI(sgBody, sel.userData, renderEditorFields)`   <- the PRIMARY prop, no banner
//
// Shift-select the ten plates of a shooting range, add `On hit -> Logic event HIT`, and it lands on ONE.
// You test, nine plates score nothing, and nothing on screen said why.
//
// And it was worse than a missing banner. The fold carries its OWN Tag input writing `store.tag` on the
// primary, while the Object & selection Tag row has used `_selApply` across the whole selection since
// 1299. Two fields, the same label, opposite scope — with a comment on one of them claiming they are kept
// in step, which was true when it was written and false for every multi-selection since.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const ui = extractFunction('buildSignalsUI', src);

/* ---- EXECUTED: the scope of every writer in the fold ---------------------------------------------- */
// Drive the real function against a fake DOM, once with a selection and once without, and record which
// stores each row writes to. That is the property; the banner is only how it is announced.
const mkDom = () => {
  const made = [];
  const el = (tag) => {
    const e = { tag, style: { cssText: '', margin: '', minWidth: '', accentColor: '' }, children: [],
      appendChild(c) { this.children.push(c); return c; }, setAttribute() {}, };
    Object.defineProperty(e, 'textContent', { get: () => e._t || '', set: (v) => { e._t = v; }, configurable: true });
    Object.defineProperty(e, 'innerHTML', { get: () => e._h || '', set: (v) => { e._h = v; }, configurable: true });
    made.push(e); return e;
  };
  return { made, doc: { createElement: el } };
};

const run = (stores, withSel) => {
  const primary = stores[0];
  const calls = { snapshots: 0, applied: 0, toasts: [] };
  const { made, doc } = mkDom();
  const host = doc.createElement('div');
  const fn = new Function('document', 'sgBody', 'store', 'rerender', 'opts', 'K', `
    ${extractFunction('_selBanner', src)}
    const pushUndoSnapshot = ()=>{ K.snapshots++; };
    const renderEditorFields = ()=>{};
    const flashToast = (m)=>{ K.toasts.push(m); };
    const _lgRefreshDatalists = undefined;
    ${extractFunction('_isWorldVerb', src)}
    ${ui}
    return buildSignalsUI(sgBody, store, rerender, opts);
  `);
  const opts = withSel ? { count: stores.length,
    applyStore: (f) => { calls.applied++; for (const st of stores) f(st); } } : undefined;
  fn(doc, host, primary, () => {}, opts, calls);
  return { made, host, calls };
};

const find = (made, pred) => made.filter(pred);
const inputs = (made, type) => find(made, e => e.tag === 'input' && e.type === type);
const buttons = (made) => find(made, e => e.tag === 'button');

/* --- with a multi-selection: Tag and Needs reach every prop --- */
{
  const A = { tag: 'old' }, B = {}, C = {};
  const { made, calls } = run([A, B, C], true);
  const tag = inputs(made, 'text')[0];
  assert(tag, 'the fold builds a Tag input');
  tag.value = ' plate '; tag.onchange();
  eq(A.tag, 'plate', 'Tag reaches the primary');
  eq(B.tag, 'plate', '...and the second selected prop');
  eq(C.tag, 'plate', '...and the third — the same scope as the Object & selection Tag row');
  eq(calls.snapshots, 0, 'and _selApply owns the undo snapshot, so the row does not take a second one');

  const need = inputs(made, 'number')[0];
  need.value = '3'; need.onchange();
  eq(A.sigNeed, 3, 'Needs reaches the primary');
  eq(C.sigNeed, 3, '...and the rest');
  need.value = '1'; need.onchange();
  assert(!('sigNeed' in A) && !('sigNeed' in C), 'and 1 clears it everywhere rather than writing a default');
}

/* --- the signal LIST stays per-object, and Copy to all is the one way to spread it --- */
{
  const A = { signals: [{ when: 'damaged', do: 'emit', target: 'HIT' }] };
  const B = { signals: [{ when: 'interacted', do: 'open', target: 'door' }] };
  const { made, calls } = run([A, B], true);
  const copy = buttons(made).find(b => /Copy to all/.test(b.textContent));
  assert(copy, 'a multi-selection offers an explicit Copy to all');
  eq(copy.textContent, '⧉ Copy to all 2', '...naming how many it will reach');

  const add = buttons(made).find(b => b.textContent === '+ Add signal');
  add.onclick();
  eq(A.signals.length, 2, 'adding a signal edits the primary...');
  eq(B.signals.length, 1, '...and NOT the others — a list is structure, not a scalar');

  copy.onclick();
  eq(B.signals.length, 2, 'Copy to all replaces the rest with the primary’s list');
  eq(B.signals[0].do, 'emit', '...contents and all');
  assert(calls.toasts.length === 1 && /2 props/.test(calls.toasts[0]), '...and says it did');

  // the copy must be DEEP, or every prop shares one array and editing any edits all
  assert(A.signals !== B.signals, 'the copy is not the same array');
  assert(A.signals[0] !== B.signals[0], '...nor the same signal objects');
  A.signals[0].target = 'CHANGED';
  eq(B.signals[0].target, 'HIT', '...so editing the primary afterwards does not reach into the others');
}

/* --- with ONE prop, and with an inventory item (no opts), nothing changed --- */
{
  const A = { tag: 'x' };
  const { made, calls } = run([A], true);
  assert(!buttons(made).some(b => /Copy to all/.test(b.textContent)),
    'a single selection is offered no copy action — there is nothing to copy to');
  assert(!made.some(e => /selected/.test(e.innerHTML || '')), '...and no banner');
  inputs(made, 'text')[0].value = 'y'; inputs(made, 'text')[0].onchange();
  eq(A.tag, 'y', '...and the Tag row still writes');
}
{
  // the inventory-item call site passes no opts at all: the fold must behave exactly as it did before
  const item = { tag: 'idol' };
  const { made, calls } = run([item], false);
  const tag = inputs(made, 'text')[0];
  tag.value = 'relic'; tag.onchange();
  eq(item.tag, 'relic', 'an inventory item still edits its own store');
  eq(calls.snapshots, 1, '...and takes its own undo snapshot, since there is no _selApply to own one');
  eq(calls.applied, 0, '...through no group path at all');
  assert(!buttons(made).some(b => /Copy to all/.test(b.textContent)), '...and is offered no copy action');
}

/* ---- the banners, and that build 1299's four existing ones did not change a word ------------------ */
const ban = extractFunction('_selBanner', src);
assert(/function _selBanner\(host, n, groupWide, what\)/.test(ban), 'the banner can name what it governs');
{
  const outs = [];
  const fn = new Function('document', `
    ${ban}
    const host = { appendChild:(c)=>{ out.push(c.innerHTML); } };
    const out = [];
    _selBanner(host, 3, true); _selBanner(host, 3, false);
    _selBanner(host, 3, true, 'X applies to all.'); _selBanner(host, 1, true);
    return out;
  `)({ createElement: () => ({ style: { cssText: '' }, set className(v) {}, }) });
  eq(fn[0], '<b>Editing 3 selected props</b> — changes apply to all.',
    'build 1299’s group-wide wording is byte-identical');
  eq(fn[1], '<b>3 props selected</b> — this fold edits the primary one only.',
    '...and so is its primary-only wording');
  eq(fn[2], '<b>Editing 3 selected props</b> — X applies to all.', 'a named banner replaces only the tail');
  eq(fn.length, 3, 'and one selected prop still gets no banner at all');
}
// two banners, because this fold genuinely has two rules — each sits above the rows it governs
assert(/_selBanner\(sgBody, _n, true, '<b>Tag<\/b> and <b>Needs<\/b> apply to all of them\.'\)/.test(ui),
  'the group-wide rule is stated above Tag and Needs');
assert(/_selBanner\(sgBody, _n, false, 'the <b>signals<\/b> below edit the primary one/.test(ui),
  'and the per-object rule above the list');
const iG = ui.indexOf("apply to all of them"), iT = ui.indexOf("textContent='Tag'"),
      iP = ui.indexOf('edit the primary one'), iL = ui.indexOf('const sigs = store.signals');
assert(iG > 0 && iT > iG, 'the group-wide banner comes before the Tag row it describes');
assert(iP > 0 && iL > iP, 'and the per-object banner before the list it describes');

/* ---- the call sites -------------------------------------------------------------------------------- */
assert(/buildSignalsUI\(sgBody, sel\.userData, renderEditorFields,\s*\{ count: _selTargets\(\)\.length, applyStore: \(fn\)=>_selApply\(o=>\{ if\(o && o\.userData\) fn\(o\.userData\); \}\) \}\)/.test(src),
  'the prop fold supplies the selection');
assert(/buildSignalsUI\(sgWrap, it, \(\)=>renderInvItems\(host\)\);/.test(src),
  'and the inventory-item fold passes nothing, so its behaviour is untouched');
eq((src.match(/buildSignalsUI\(/g) || []).length, 3, 'one definition, two callers — no third path to keep in step');

done('build 1438: the Signals fold no longer edits one prop while a selection of ten is highlighted and ' +
     'nothing says so — Tag and Needs reach the whole selection like their twin in Object & selection, ' +
     'the signal list stays per-object and says so, and Copy to all is the one explicit way to spread it');
