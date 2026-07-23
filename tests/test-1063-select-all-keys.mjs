// (build 1063) CROSS-BONE KEY SELECTION — author: "drag and select all key frames for all
// bones at once or have a button that just allows you to select all so you can easily delete
// them or select just which ones you want and delete them." The dope-sheet selection used to be
// times scoped to ONE bone (_aeSelKeys on _aeSel). It now spans the whole sheet: the active
// row's times stay in _aeSelKeys, every other row's in _aeSelExtra (Map<slot,Set<t4>>). A
// "Select all" button grabs every key; a marquee dragged across rows selects the box it covers;
// Delete (or "Delete keys") removes the whole selection at once. The pure set-algebra helpers
// are exercised here; the live canvas drag runs in the browser smoke.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// build the pure helpers with a stubbed selection state and _aeTLRows
const stubs = `
let _aeSel='L:uparm', _aeSelKeys=[], _aeSelExtra=new Map(), _aeClip=null;
${extractFunction('_aeKeysInRange', src)}
${extractFunction('_aeCellsInBox', src)}
${extractFunction('_aeAllCells', src)}
${extractFunction('_aeSelUnified', src)}
${extractFunction('_aeSelMerge', src)}
${extractFunction('_aeSelSetFromMap', src)}
${extractFunction('_aeSelHasCell', src)}
${extractFunction('_aeSelCount', src)}
const _t4=(t)=>(+t).toFixed(4);
`;
const env = new Function(stubs + `
  return {
    set clip(c){ _aeClip=c; }, get clip(){ return _aeClip; },
    setSel(s, keys, extra){ _aeSel=s; _aeSelKeys=keys.slice(); _aeSelExtra=new Map(); for(const k in extra) _aeSelExtra.set(k, new Set(extra[k].map(_t4))); },
    unified(){ return [..._aeSelUnified().entries()].map(([s,t])=>[s, t.slice().sort((a,b)=>a-b)]); },
    allCells(rows){ return [..._aeAllCells(_aeClip, rows).entries()].map(([s,t])=>[s,t]); },
    box(rows, ra, rb, ta, tb){ return [..._aeCellsInBox(_aeClip, rows, ra, rb, ta, tb).entries()].map(([s,t])=>[s,t]); },
    apply(mapEntries, act){ _aeSelSetFromMap(new Map(mapEntries), act); return { sel:_aeSel, keys:_aeSelKeys.slice(), extra:[..._aeSelExtra.entries()].map(([s,set])=>[s,[...set]]) }; },
    merge(a, b){ return [..._aeSelMerge(new Map(a), new Map(b)).entries()]; },
    has(s, t){ return _aeSelHasCell(s, t); },
    count(){ return _aeSelCount(); },
  };
`)();

// a three-bone clip
const clip = { dur: 1, tracks: {
  'L:uparm': { q: [[0, 0,0,0,1], [0.5, 0,0,0,1], [1, 0,0,0,1]] },
  'R:uparm': { q: [[0.25, 0,0,0,1], [0.75, 0,0,0,1]] },
  hips: { q: [[0, 0,0,0,1]], p: [[0.5, 0,0,0]] },
} };
env.clip = clip;
const rows = ['L:uparm', 'R:uparm', 'hips'];

// ---- Select all: every key on every bone ----
{
  const all = new Map(env.allCells(rows));
  eq(all.get('L:uparm').join(','), '0,0.5,1', 'all keys of L:uparm');
  eq(all.get('R:uparm').join(','), '0.25,0.75', 'all keys of R:uparm');
  eq(all.get('hips').sort((a,b)=>a-b).join(','), '0,0.5', 'hips merges its q and p key times');
  const r = env.apply([...all.entries()], 'L:uparm');
  eq(r.sel, 'L:uparm', 'the active row stays active');
  eq(r.keys.join(','), '0,0.5,1', 'the active row\'s times land in _aeSelKeys');
  eq(r.extra.length, 2, 'the other two rows land in _aeSelExtra');
  eq(env.count(), 7, 'all seven keys are selected');
}

// ---- a marquee box: rows 0..1, time 0.2..0.8 ----
{
  const box = env.box(rows, 0, 1, 0.2, 0.8);
  const m = new Map(box);
  eq(m.get('L:uparm').join(','), '0.5', 'L:uparm: only the key inside the time band');
  eq(m.get('R:uparm').join(','), '0.25,0.75', 'R:uparm: both keys are inside');
  assert(!m.has('hips'), 'row 2 (hips) is outside the row band — not selected');
}
// right-to-left / bottom-to-top sweeps give the same box
eq(JSON.stringify(env.box(rows, 1, 0, 0.8, 0.2)), JSON.stringify(env.box(rows, 0, 1, 0.2, 0.8)),
  'the box is orientation-independent');

// ---- membership + apply round-trips the split store ----
{
  env.setSel('R:uparm', [0.25], { 'L:uparm': [0.5], hips: [0] });
  assert(env.has('R:uparm', 0.25), 'the active-row key reads selected');
  assert(env.has('L:uparm', 0.5), 'an extra-row key reads selected');
  assert(env.has('hips', 0), 'another extra-row key reads selected');
  assert(!env.has('L:uparm', 0), 'an unselected key reads unselected');
  const uni = new Map(env.unified());
  eq(uni.get('R:uparm').join(','), '0.25', 'unified() surfaces the active row');
  eq(uni.get('L:uparm').join(','), '0.5', '...and every extra row');
  eq(uni.size, 3, 'all three bones present in the unified view');
}

// ---- merge is a union (shift-add during a marquee) ----
{
  const a = [['L:uparm', [0]], ['R:uparm', [0.25]]];
  const b = [['L:uparm', [0.5]], ['hips', [0]]];
  const u = new Map(env.merge(a, b));
  eq(u.get('L:uparm').sort((x,y)=>x-y).join(','), '0,0.5', 'overlapping bone unions its times');
  eq(u.get('R:uparm').join(','), '0.25', 'a-only bone kept');
  eq(u.get('hips').join(','), '0', 'b-only bone added');
}

// ---- wiring pins ----
assert(/function _aeSelectAll\(\)\{/.test(src) && /const map=_aeAllCells\(_aeClip, rows\);/.test(src), 'Select-all grabs every key on every dope row');
assert(/function _aeDeleteSel\(\)\{/.test(src) && /for\(const \[slot,times\] of uni\)\{ const tr=_aeClip\.tracks\[slot\];/.test(src),
  'the deleter walks the whole cross-bone selection');
assert(/else if\(e\.code==='Delete' \|\| e\.code==='Backspace'\)\{ _aeDeleteSel\(\); \}/.test(src), 'Delete/Backspace removes the whole selection');
assert(/id="aeSelAll"/.test(src) && /id="aeDeselect"/.test(src) && /id="aeDelK"/.test(src), 'the toolbar has Select all / Deselect / Delete keys buttons');
assert(/el\.querySelector\('#aeSelAll'\)\.onclick=\(\)=>_aeSelectAll\(\);/.test(src), 'Select all is wired');
assert(/const box=_aeCellsInBox\(_aeClip, rows, drag\.row0, rowNow, drag\.t0, t\);/.test(src), 'the marquee builds the box across dragged rows');
assert(/for\(const \[slot,times\] of drag\.uni\)\{ moved\.set\(slot, _aeMoveKeys\(_aeClip, slot, times, delta/.test(src),
  'dragging a selected key moves EVERY selected bone by the same delta');
assert(/const selK=_aeSelHasCell\(slot, t\);/.test(src), 'the dope sheet highlights selected keys on any row');

done('build 1063: select every key at once (or marquee a box across bones), then delete or move the whole set');
