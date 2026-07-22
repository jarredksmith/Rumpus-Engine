// (build 1038) OUTLINER FIXES — author field report: (1) double-click rename never fired (the
// first click rebuilt the panel, so the second click landed on a new DOM node); (2) locking did
// not stop moving (rows and group expansion could still select locked props, and the gizmo drags
// whatever is selected); (3) rows should drag into folders; (4) dropdown text was unreadably
// light in the native option popup.
import { readFileSync } from 'node:fs';
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- executable: the rebuild-proof double-click (keyed by item, not DOM node) ----
{
  let t = 1000;
  const env = new Function('performance',
    "const _outClickMem={ key:'', t:0 };\n" + extractFunction('_outClick2', src) + '\nreturn _outClick2;')({ now: () => t });
  const log = [];
  const S = () => log.push('s'), D = () => log.push('d');
  env('props:1', S, D);                 // first click -> select
  t += 200; env('props:1', S, D);       // second click on the SAME item within 400ms -> rename
  eq(log.join(','), 's,d', 'two quick clicks on one item = select, then rename');
  t += 200; env('props:1', S, D);       // the double consumed the memory -> this is a fresh single
  eq(log.join(','), 's,d,s', 'the double resets — a third click is a fresh select');
  t += 200; env('props:2', S, D);       // a different item never chains
  t += 100; env('props:1', S, D);
  eq(log.join(','), 's,d,s,s,s', 'clicks on different items never chain into a rename');
  t += 1000; env('props:1', S, D); t += 500; env('props:1', S, D);
  eq(log.join(','), 's,d,s,s,s,s,s', 'slow clicks stay single (400ms window)');
  const noRen = []; env('spawns:0', () => noRen.push('s'), null); t += 100; env('spawns:0', () => noRen.push('s'), null);
  eq(noRen.join(','), 's,s', 'types with no rename (dbl=null) always select');
}

// ---- lock means untouchable, everywhere ----
assert(/if\(u\.edLock\)\{ if\(typeof toast==='function'\) toast\('Locked — click the padlock to unlock'\); return; \}/.test(src),
  'clicking a locked row selects nothing (a toast points at the padlock)');
assert(/\(o\)=>_groupMembers\(o\)\.filter\(m=>!\(m && m\.userData && m\.userData\.edLock\)\)/.test(src),
  'the marquee group expansion drops locked members');
assert(/const mem = obj \? _groupMembers\(obj\)\.filter\(m=>!\(m && m\.userData && m\.userData\.edLock\)\) : \[\];/.test(src),
  'viewport group-click expansion drops locked members');
{
  const ug = extractFunction('updateGizmo', src);
  assert(/const _lk = !!\(_lkO && _lkO\.userData && _lkO\.userData\.edLock\);/.test(ug) && /const pos = \(movable && !_lk\) \? getSelPos\(\) : null;/.test(ug),
    'the gizmo never grows handles on a locked primary (props/lights/spawns/turrets)');
}

// ---- drag rows into folders ----
assert(/r\.draggable=true;/.test(src) && /r\.ondragstart=\(e\)=>\{ _outDragObj=o;/.test(src), 'prop rows are drag sources');
{
  const dt = extractFunction('_outDropTarget', src);
  assert(/el\.ondragover=/.test(dt) && /el\.ondrop=/.test(dt) && /el\.classList\.add\('dropHint'\)/.test(dt), 'folder rows accept drops with a visible hint');
  assert(/const list=\(selProps\.indexOf\(_outDragObj\)>=0\) \? selProps\.slice\(\) : \[_outDragObj\];/.test(dt),
    'dragging a selected row files the whole selection');
  assert(/if\(folder\) o\.userData\.folder=String\(folder\)\.slice\(0,40\); else delete o\.userData\.folder;/.test(dt),
    'dropping writes (or clears) the serialized folder');
}
assert(/_outDropTarget\(fh, fname\);/.test(src), 'every folder row is a drop target');
assert(/if\(kind==='props'\) _outDropTarget\(h, ''\);/.test(src), 'the Props header un-files (root) on drop');

// ---- rename input survives panel rebuilds ----
eq((src.match(/inp\.select\(\); _outRenaming=true;/g)||[]).length, 2, 'both rename inputs raise the renaming flag');
assert(/if\(_outRenaming\) return;   \/\/ build 1038: never yank a rename input out from under the keyboard/.test(src),
  '_outRefresh will not rebuild while a rename is typing');
eq((src.match(/if\(done\) return; done=true; _outRenaming=false;/g)||[]).length, 3, 'every commit/cancel clears the flag');

// ---- the raw-index clamp (found while verifying the lock fix): props' idx indexes propModels
// RAW, but renderEditorFields clamped it against the non-null count(), so with null holes
// (failed model loads) any fresh selection got yanked onto a different prop ----
{
  const env = new Function(
    'let propModels;\n' + 'const T = { idx: 0, ' + (gameSource().match(/clampIdx\(\)\{[\s\S]*?this\.idx=i; \},/)||[''])[0] + ' };\n'
    + 'return { T, set:(l)=>{ propModels=l; } };')();
  const a = {}, b = {}, c = {};
  env.set([a, null, b, null, c]);
  env.T.idx = 4; env.T.clampIdx();
  eq(env.T.idx, 4, 'a valid raw index (past the non-null count) is left alone');
  env.T.idx = 3; env.T.clampIdx();
  eq(env.T.idx, 2, 'a null hole walks back to the nearest real prop');
  env.T.idx = 9; env.T.clampIdx();
  eq(env.T.idx, 4, 'past-the-end clamps to the raw tail');
  env.set([null, null, a]);
  env.T.idx = 1; env.T.clampIdx();
  eq(env.T.idx, 2, 'leading holes walk forward instead');
}
assert(/if\(typeof tgt\.clampIdx==='function'\) tgt\.clampIdx\(\); else tgt\.idx = Math\.max\(0, Math\.min\(tgt\.idx, n-1\)\);/.test(src),
  'renderEditorFields defers to the raw-aware clamp');

// ---- readable dropdowns ----
assert(/#outliner select option, \.outMove select option \{ background:#0d151a; color:#f2fffa;/.test(html),
  'option popups get explicit dark styling (they rendered light-on-white)');
assert(/#outliner \.outTools select, \.outMove select \{ color:#f2fffa; font-weight:600; \}/.test(html), 'closed selects read heavier');
assert(/\.outRow\.dropHint, \.outGrpHead\.dropHint \{ outline:1\.5px dashed var\(--accent\);/.test(html), 'the drop hint has its style');

// ---- docs follow the behavior change ----
assert(/A locked object can't be selected or moved at all/.test(manual), 'the manual states the stricter lock');
assert(/drag a row onto a folder<\/b>/.test(manual), '...and the drag-to-file gesture');

done('build 1038: rename fires, locks hold, rows drag into folders, dropdowns are readable');
