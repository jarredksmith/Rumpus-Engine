import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1299 — editor audit finding 4.2, CRITICAL, verified still live before fixing:
//
//   "The gizmo is group-aware, the material fold is group-aware and SAYS SO, and the tag field, interact,
//    signals, name and dialogue are all primary-only with no indication. Two different rules for one
//    selection, in adjacent folds. A creator who tags 30 crates one at a time will conclude the editor is
//    fine; a creator who assumes the fields follow the selection will silently corrupt their level."
//
// The fix is NOT "make everything group-aware" — some of these fields are per-object by nature. It is that
// every field says which rule it follows. Silent inconsistency was the bug; labelled asymmetry is a design.
//
// Measured through the real editor (toggleEditor -> Build mode -> select five props): the banner reads
// "Editing 5 selected props — changes apply to all", and one tag edit tagged all five.

const mkDom = () => {
  const mk = () => ({ className: '', style: { cssText: '' }, innerHTML: '', children: [],
    appendChild(c) { this.children.push(c); return c; },
    get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); } });
  return { document: { createElement: mk }, host: mk() };
};

// ---------------------------------------------------------------- who the fields act on
const mkT = (selProps, primary) => new Function('selProps', 'editorTargets',
  extractFunction('_selTargets') + '; return _selTargets;')(
  selProps, { props: { obj: () => primary } });
{
  const a = { n: 'a' }, b = { n: 'b' }, p = { n: 'primary' };
  eq(mkT([a, b], p)().length, 2, 'a multi-selection is the target set');
  eq(mkT([a, b], p)()[0], a, '...in selection order');
  eq(mkT([], p)()[0], p, 'with nothing multi-selected it falls back to the primary');
  eq(mkT([], p)().length, 1);
  eq(mkT(null, p)().length, 1, 'a missing selection array is not a crash');
  eq(mkT([], null)().length, 0, 'and nothing selected at all is an empty set, never [null]');
  eq(mkT([a, null, b], p)().length, 2, 'holes in the selection are dropped');
  // it must NOT filter by material, the way _matTargets does — a tag applies to an imported model too
  const st = extractFunction('_selTargets');
  assert(!/isMatPrimitive/.test(st),
    'it does not filter to material primitives — an imported GLB can carry a tag, a lock and an interact flag');
  assert(/isMatPrimitive/.test(extractFunction('_matTargets')), '...while the material one still does');
}

// ---------------------------------------------------------------- one snapshot per gesture
const mkApply = (list) => {
  const st = { snaps: 0, dirty: false };
  const fn = new Function('selProps', 'editorTargets', 'ST',
    'let _levelDirty=false;\n' +
    'const pushUndoSnapshot = () => { ST.snaps++; };\n' +
    extractFunction('_selTargets') + '\n' + extractFunction('_selApply') +
    '; return { apply:_selApply, dirty:()=>_levelDirty };')(list, { props: { obj: () => null } }, st);
  return { fn, st };
};
{
  const props = [{ userData: {} }, { userData: {} }, { userData: {} }];
  const { fn, st } = mkApply(props);
  eq(fn.apply(o => { o.userData.tag = 'vault'; }), 3, 'it reports how many it touched');
  eq(props.filter(o => o.userData.tag === 'vault').length, 3, 'EVERY selected prop took the change');
  eq(st.snaps, 1,
    'ONE undo snapshot for the whole gesture — per-object would cost thirty Ctrl+Z presses to undo one edit');
  eq(fn.dirty(), true, 'and the level is marked dirty, so autosave sees it');
}
{ // a throwing field handler must not abandon the rest of the selection half-applied
  const props = [{ userData: {} }, { userData: {} }, { userData: {} }];
  const { fn } = mkApply(props);
  let n = 0;
  fn.apply(o => { n++; if (n === 2) throw new Error('bad prop'); o.userData.tag = 'x'; });
  eq(n, 3, 'it kept going past the failure');
  eq(props.filter(o => o.userData.tag === 'x').length, 2, '...and applied to the ones that could take it');
}
{ // nothing selected costs nothing, including no undo entry
  const { fn, st } = mkApply([]);
  eq(fn.apply(() => { throw new Error('should not run'); }), 0, 'an empty selection applies nothing');
  eq(st.snaps, 0, 'and pushes no snapshot — an empty gesture must not fill the undo stack');
}

// ---------------------------------------------------------------- the banner is the actual fix
const mkBanner = () => {
  const dom = mkDom();
  const fn = new Function('document', extractFunction('_selBanner') + '; return _selBanner;')(dom.document);
  return { fn, host: dom.host };
};
{
  const { fn, host } = mkBanner();
  fn(host, 1, true);
  eq(host.children.length, 0, 'a single selection gets no banner — it would be noise on every click');
  fn(host, 0, true); fn(host, 1, false);
  eq(host.children.length, 0);
  fn(null, 5, true);
  fn(host, 5, true);
  eq(host.children.length, 1, 'a multi-selection is announced');
  assert(/Editing 5 selected props/.test(host.children[0].innerHTML), '...by count');
  assert(/changes apply to all/.test(host.children[0].innerHTML), '...and by rule');
  fn(host, 5, false);
  assert(/5 props selected/.test(host.children[1].innerHTML), 'a primary-only fold says so too');
  assert(/edits the primary one only/.test(host.children[1].innerHTML), '...and states its own rule');
  assert(host.children[0].style.cssText !== host.children[1].style.cssText,
    'and the two read differently at a glance — the same colour for opposite rules is the bug all over again');
}

// ---------------------------------------------------------------- the mark-the-set fields
{
  assert(/tin\.onchange=\(\)=>\{ const v=tin\.value\.trim\(\); _selApply\(o=>\{ if\(v\) o\.userData\.tag=v; else delete o\.userData\.tag; \}\); renderEditorFields\(\); \};/.test(src),
    'TAG applies to the whole selection');
  assert(/icb\.onchange=\(\)=>\{ _selApply\(o=>\{ if\(icb\.checked\) o\.userData\.interact=true; else delete o\.userData\.interact; \}\); \};/.test(src),
    'INTERACTABLE too');
  assert(/lsel\.onchange=\(\)=>\{ _selApply\(o=>\{ if\(lsel\.value\) o\.userData\.lockId=lsel\.value; else \{ delete o\.userData\.lockId; delete o\.userData\.lockConsume; \} delete o\.userData\.unlocked; \}\); renderEditorFields\(\); \};/.test(src),
    'and LOCK — thirty doors, one key');
  // the reason tag in particular must be group-wide: a signal resolves it to a LIST
  assert(/for\(const o of propModels\)\{ if\(o && o\.userData && o\.userData\.tag===tag && !o\.userData\._shattered\) list\.push\(o\); \}/.test(src),
    'a tag resolves to a LIST of props at runtime, which is why one tag across a set is the normal move');
  assert(/A signal resolves a tag to a LIST/.test(src), '...and that reasoning is recorded beside the field');
  // each of the three announces itself
  eq((src.match(/_selBanner\(/g) || []).length, 5,
    'the definition plus every fold that can face a multi-selection — tag/interact, lock, dialogue, and build 1305’s impact sound. Each states its rule.');
  assert(/_selBanner\(th, _selTargets\(\)\.length, true\);/.test(src), 'the tag/interact fold announces group-wide');
  assert(/_selBanner\(lHost, _selTargets\(\)\.length, true\);/.test(src), 'the lock fold too');
}

// ---------------------------------------------------------------- the per-object fields, labelled
{
  assert(/_selBanner\(dBody, _selTargets\(\)\.length, false\);/.test(src),
    'the dialogue fold announces that it edits the primary only');
  assert(/nin\.onchange=\(\)=>\{ pushUndoSnapshot\(\); const v=nin\.value\.trim\(\)\.slice\(0,40\); if\(v\) sel\.userData\.npcName=v;/.test(src),
    'an NPC name stays on the primary…');
  assert(/ta\.onchange=\(\)=>\{ pushUndoSnapshot\(\);[\s\S]{0,200}sel\.userData\.dialogue=lines;/.test(src),
    '…and so does its script');
  assert(/thirty NPCs with one name and one script is not something anyone wants by accident/.test(src),
    'with the reason recorded, so this reads as a decision rather than the bug the audit found');
  assert(/Silent inconsistency was the bug; labelled asymmetry is a design\./.test(src),
    'and the principle is stated once, where the helpers live');
}

done('build 1299 (editor audit 4.2, CRITICAL): the inspector follows the selection — the gizmo and the material fold were group-aware while the tag, interactable and lock fields silently edited only the primary, so a creator who assumed the fields followed their selection corrupted their level quietly. Mark-the-set fields now apply to every selected prop (a tag resolves to a LIST at runtime, so that was always the intent) under ONE undo snapshot per gesture; per-object fields like an NPC name and its dialogue deliberately stay on the primary and now SAY so. Verified live: five props selected, one tag edit, five props tagged');
