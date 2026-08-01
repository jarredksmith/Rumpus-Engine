import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1262: a NAMED LEVEL LIBRARY — the audit's last editor CRITICAL. There was exactly one local
// save, so a creator could hold one level at a time while every engine on the comparison list ships a
// project list. Build 1254 stopped a foreign level EATING that slot; this removes the slot as a
// ceiling. Names live in localStorage (a tiny index, so the list renders with no async flicker),
// payloads in the IndexedDB store the durable copy already uses.

function rig(opts = {}) {
  const ls = Object.assign({}, opts.store || {});
  const db = Object.assign({}, opts.db || {});
  const world = { toasts: [], puts: [], drops: [], saved: 0 };
  const names = ['LVLIB_KEY','LVLIB_MAX','_libIndex','_libWriteIndex','_libName','_libPut','_libGet','_libDrop',
                 'libSaveAs','libCommit','libRename','libDelete','_libStopTracking'];
  const body = [
    "const LVLIB_KEY='breach_levels_v1', LVLIB_MAX=" + (opts.max || 40) + ";",
    'let _libCurrent=' + (opts.current ? `'${opts.current}'` : 'null') + ';',
    extractFunction('_libIndex'), extractFunction('_libWriteIndex'), extractFunction('_libName'),
    extractFunction('_libPut'), extractFunction('_libGet'), extractFunction('_libDrop'),
    extractFunction('libSaveAs'), extractFunction('libCommit'),
    extractFunction('libRename'), extractFunction('libDelete'), extractFunction('_libStopTracking'),
    'return { libSaveAs, libCommit, libRename, libDelete, _libIndex, _libName, stop:_libStopTracking,' +
    '  cur:()=>_libCurrent, foreign:()=>_foreignLevel, dirty:()=>_levelDirty };',
  ].join('\n');
  const mk = new Function('localStorage','serializeLevel','_levelDB','_levelDBPutKey','_levelDBGetKey','_levelDBDelKey',
    'flashToast','world','__setForeign','__setDirty',
    `let _foreignLevel=${opts.foreign ? 'true' : 'false'}, _levelDirty=${opts.dirty ? 'true' : 'false'};\n${body}`);
  return Object.assign(mk(
    { getItem:(k)=> (k in ls ? ls[k] : null), setItem:(k,v)=>{ if(opts.lsFull) throw new Error('quota'); ls[k]=String(v); }, removeItem:(k)=>{ delete ls[k]; } },
    () => ({ props:[opts.marker || 'LEVEL'] }),
    () => Promise.resolve({}),
    (k, str) => { world.puts.push(k); db[k] = str; return Promise.resolve(true); },
    (k) => Promise.resolve(db[k] || null),
    (k) => { world.drops.push(k); delete db[k]; return Promise.resolve(true); },
    (t) => world.toasts.push(t), world, null, null), { ls, db, world });
}

{ // Save as: an entry appears, the payload is written, and the level becomes YOURS by name
  const r = rig({ foreign: true, dirty: true });
  const e = r.libSaveAs('  My Arena  ');
  eq(e.name, 'My Arena', 'the name is trimmed');
  eq(r._libIndex().length, 1, 'the index gains one entry');
  eq(r.cur(), e.id, 'and the active slot now tracks it');
  assert(r.world.puts.includes('lvl:' + e.id), 'the payload goes to the level store under its own key');
  eq(r.foreign(), false, 'saving under a name ADOPTS a level that arrived from outside (1254)');
  eq(r.dirty(), false, '...and it is no longer unsaved');
  eq(JSON.parse(r.db['lvl:' + e.id]).props[0], 'LEVEL', 'the payload is the serialized level');
}
{ // names never silently collide — a namesake would be indistinguishable in the list
  const r = rig();
  eq(r.libSaveAs('Arena').name, 'Arena');
  eq(r.libSaveAs('Arena').name, 'Arena 2', 'a duplicate name is numbered, never overwritten');
  eq(r.libSaveAs('Arena').name, 'Arena 3');
  eq(r.libSaveAs('').name, 'Untitled level', 'a blank name still lands somewhere findable');
  eq(r.libSaveAs('x'.repeat(200)).name.length, 48, 'and a hostile one is capped');
}
{ // commit: Save writes back into the entry being worked on
  const r = rig({ marker: 'V1' });
  const e = r.libSaveAs('Work');
  const first = r._libIndex()[0].t;
  r.world.puts.length = 0;
  eq(r.libCommit(), true, 'commit succeeds while tracking');
  assert(r.world.puts.includes('lvl:' + e.id), 'and rewrites that entry');
  assert(r._libIndex()[0].t >= first, 'bumping its timestamp');
  const none = rig();
  eq(none.libCommit(), false, 'with nothing open, Save touches only the active slot — the pre-1262 behaviour');
}
{ // an entry deleted elsewhere must not be resurrected by a later Save
  const r = rig();
  const e = r.libSaveAs('Gone');
  r.ls['breach_levels_v1'] = JSON.stringify([]);   // another tab deleted it
  eq(r.libCommit(), false, 'commit refuses');
  eq(r.cur(), null, '...and stops tracking rather than recreating the entry');
}
{ // delete + rename
  const r = rig();
  const a = r.libSaveAs('A'), b = r.libSaveAs('B');
  eq(r.cur(), b.id);
  r.libDelete(b.id);
  eq(r._libIndex().length, 1, 'the entry is gone from the index');
  assert(r.world.drops.includes('lvl:' + b.id), 'and its payload is dropped, not orphaned');
  eq(r.cur(), null, 'deleting the OPEN entry stops tracking it');
  r.libDelete(a.id);
  eq(r._libIndex().length, 0);
  const r2 = rig();
  const x = r2.libSaveAs('Old');
  r2.libSaveAs('Taken');
  eq(r2.libRename(x.id, 'Taken'), true);
  eq(r2._libIndex().find(e=>e.id===x.id).name, 'Taken 2', 'renaming onto a taken name is numbered too');
  eq(r2.libRename('nope', 'x'), false, 'renaming a missing entry fails cleanly');
}
{ // caps and storage honesty
  const r = rig({ max: 3 });
  r.libSaveAs('a'); r.libSaveAs('b'); r.libSaveAs('c');
  const over = r.libSaveAs('d');
  assert(over && over.err && /3 levels/.test(over.err), 'past the cap it says so rather than silently dropping one');
  eq(r._libIndex().length, 3, 'and the library is untouched');
  const full = rig({ lsFull: true });
  const res = full.libSaveAs('x');
  assert(res && res.err, 'a full localStorage is reported, not swallowed');
}
{ // _libStopTracking is what New / a foreign load use
  const r = rig();
  const e = r.libSaveAs('Proj');
  eq(r.cur(), e.id);
  r.stop();
  eq(r.cur(), null, 'stopping means Save goes back to touching only the active slot');
}

// --- wiring pins ------------------------------------------------------------------------------------
assert(/if\(_libCurrent && typeof libCommit==='function'\)\{ try\{ libCommit\(\); \}catch\(e\)\{\} \}/.test(src),
  'saveLevel writes the tracked entry as well as the active slot');
{
  const mf = extractFunction('markForeignLevel');
  assert(/_libStopTracking\(\)/.test(mf), 'a shared/imported level stops tracking your project — Save must not write THEIR level into YOUR entry');
}
{
  const op = extractFunction('libOpen');
  assert(/markForeignLevel\(/.test(op), 'opening from the library still rescues unsaved work first (1254)');
  assert(/_foreignLevel=false/.test(op), '...but the level itself is yours, so autosave resumes immediately');
  assert(/saveLevel\(\)/.test(op), 'and the active slot follows, so a reload lands on what you opened');
}
assert(/id="edLibrary"/.test(src), 'the Save tab hosts the list');
assert(/uiPromptForm\('Rename level'/.test(src) && /uiConfirm\('Delete /.test(src),
  'rename and delete use the engine’s themed dialogs — build 815 banned native prompt/confirm, and the suite caught it');
assert(/const LVLIB_NAME|const LVLIB_KEY='breach_levels_v1', LVLIB_MAX=40;/.test(src), 'the index key and cap are named');

done('build 1262: the level library — save-as/commit/rename/delete/duplicate executed against stub stores, name collisions numbered, cross-tab deletion not resurrected, caps and quota failures reported, and the 1254 foreign-guard interplay pinned');
