// build 1163: undo stops throwing your selection away, and hide/lock become undoable.
//
// Two review-panel findings, both verified: (1) restoreLevel ends with `selProps.length = 0` — right for a
// level load, but undo/redo run through the same path, so every Ctrl+Z cleared the selection and the core
// tweak-undo-tweak rhythm meant reselecting every time. (2) the outliner's hide/lock buttons mutate
// SERIALIZED state (e.eh / e.elk ride the level file) with no snapshot — hide 30 props and Ctrl+Z did
// nothing. Props carry stable serialized nids, so selection is remembered by identity across the rebuild.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- selection survives the rebuild
{
  // build 1291: undo and redo share one step, and the reselect is only needed on the RELOAD path — the
  // fast transform path never tears the scene down, so there is no selection to recover. Asserted once,
  // on the branch that still rebuilds.
  const h = extractFunction('_historyStep');
  for (const [name, fn] of [['_historyStep', h]]) {
    assert(/const selN = _selNids\(\);/.test(fn), name + ' records the selected nids before the restore');
    assert(/_reselectByNids\(selN\);/.test(fn), '...and reselects them after');
    assert(fn.indexOf('restoreLevel(level)') < fn.indexOf('_reselectByNids(selN)'),
      '...in that order — the reselect must run on the rebuilt scene');
    assert(fn.indexOf('const selN = _selNids();') > fn.indexOf('if(fast) _edFastRefresh();'),
      '...and only on the reload branch — the fast path keeps the selection rather than recovering it');
  }
}
{
  const fn = extractFunction('_reselectByNids');
  assert(/propByNid==='function'\)\?propByNid\(nid\):null/.test(fn),
    'reselection is by NID — the stable serialized identity, not by array index into a rebuilt list');
  assert(/if\(first < nids\.length\) setTimeout\(apply, 350\);/.test(fn),
    'models respawn async, so a second pass picks up imports that land late');
  assert(/if\(!got\.length\) return 0;/.test(fn),
    'a selection the undone edit deleted reselects nothing rather than something wrong');
}
{
  // executable: the reselect logic against a stub scene
  const fn = extractFunction('_selNids') + '\n' + extractFunction('_reselectByNids');
  const mk = (nid) => ({ userData: { nid } });
  const a = mk('n1'), b = mk('n2');
  const env = { selProps: [a, b, null, { userData: {} }], propModels: [a, b],
    editorActive: '', editorTargets: { props: { idx: -1 } }, calls: [] };
  const api = new Function('selProps', 'propModels', 'editorTargets',
    'let editorActive="";\n' +
    'const propByNid = (nid)=>propModels.find(o=>o&&o.userData.nid===nid)||null;\n' +
    'const updateSelectionHighlight = ()=>{};\nconst renderEditorFields = ()=>{};\n' +
    'const setTimeout = (f)=>{};\n' +   // second pass not needed for the sync case
    extractFunction('_selNids') + '\n' + extractFunction('_reselectByNids') + '\n' +
    'return { _selNids, _reselectByNids, sel:()=>selProps, idx:()=>editorTargets.props.idx };'
  )(env.selProps, env.propModels, env.editorTargets);
  eq(api._selNids().join(','), 'n1,n2', 'nid capture skips holes and props without identity');
  // simulate the rebuild: fresh objects, same nids
  const a2 = mk('n1'), b2 = mk('n2');
  env.propModels.length = 0; env.propModels.push(a2, b2);
  env.selProps.length = 0;
  api._reselectByNids(['n1', 'n2']);
  eq(api.sel().length, 2, 'both props are reselected on the rebuilt scene');
  assert(api.sel()[0] === a2 && api.sel()[1] === b2, '...as the NEW objects, found by nid');
  eq(api.idx(), 1, 'and the primary index points at the last of them');
  // a deleted prop: only the survivor comes back
  env.propModels.length = 0; env.propModels.push(b2);
  env.selProps.length = 0;
  api._reselectByNids(['n1', 'n2']);
  eq(api.sel().length, 1, 'a prop the undone edit removed is simply not reselected');
}

// ---------------------------------------------------------------- hide/lock snapshot
{
  assert(/pushUndoSnapshot\(\); _outSetHide\(o, !u\.edHide\);/.test(src), 'the row hide button snapshots first');
  assert(/pushUndoSnapshot\(\); _outSetLock\(o, !u\.edLock\);/.test(src), '...and the row lock button');
  assert(/pushUndoSnapshot\(\); for\(const it of fitems\) _outSetHide\(it\.o, !allH\);/.test(src),
    'a folder-wide hide takes ONE snapshot per gesture, before the loop');
  assert(/pushUndoSnapshot\(\); for\(const it of fitems\) _outSetLock\(it\.o, !allL\);/.test(src),
    '...and folder-wide lock the same');
  // the state really is serialized, which is why the snapshot matters
  assert(/if\(p\.eh\) obj\.userData\.edHide=true;/.test(src) && /if\(p\.elk\) obj\.userData\.edLock=true;/.test(src),
    'edHide/edLock ride the level file — mutating them without a snapshot was un-undoable saved state');
  // and the setters themselves stay snapshot-free, so callers control gesture granularity
  assert(!/pushUndoSnapshot/.test(extractFunction('_outSetHide')), '_outSetHide itself does not snapshot (callers own the gesture)');
  assert(!/pushUndoSnapshot/.test(extractFunction('_outSetLock')), '_outSetLock the same');
}

done('build 1163: undo/redo remember the selection by nid across the rebuild (with a late pass for async model spawns), and outliner hide/lock — serialized state — snapshot once per gesture so Ctrl+Z finally undoes them');
