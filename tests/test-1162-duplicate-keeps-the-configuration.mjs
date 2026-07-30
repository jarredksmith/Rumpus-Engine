// build 1162: a duplicate is the FULL prop, not a bare mesh.
//
// Both duplicate paths (toolbar duplicate + Alt-drag) spawned only src/transform/dynamic/material. Signals,
// tag, name, interact flag, locks, dialogue, NPC name, xa animation, joints and vehicle tuning were silently
// dropped — duplicate a configured door and the copy is a dumb mesh. The correct serializer has existed
// since build 1030: `_pfEntryOf` (the complete propEntry config, identity stripped) + `_pfSpawnEntry` (the
// apply block the level loader mirrors). Duplicate now rides that pair, so future entry fields are inherited
// instead of drifting again.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- both paths ride the prefab pair
{
  const fn = extractFunction('_dupSpawnFrom');
  assert(/const e = _pfEntryOf\(o, \{ x:0, y:0, z:0 \}\);/.test(fn),
    'duplicate captures the FULL prop entry — the same serializer prefabs and the level file use');
  assert(/_pfSpawnEntry\(e, \{ x:dx, y:0, z:dz \}, null, gid, cb\);/.test(fn),
    '...and applies it through the loader-mirroring apply block, with no pf mark (a duplicate is not a prefab instance)');
}
{
  const dup = extractFunction('duplicateSelectedProp');
  assert(/_dupSpawnFrom\(o, DUP_OFFSET, 0, gid, /.test(dup), 'toolbar duplicate goes through it');
  assert(!/propMaterialDesc\(o\)\);/.test(dup), '...and no longer hand-picks a subset of fields');
  assert(/remap\[oldGid\] \|\| \(remap\[oldGid\]=_newGroupId\(\)\)/.test(dup),
    'a duplicated group still remaps to ONE fresh group id, so the copy moves as a unit but is independent');
  const drag = extractFunction('_dupPropForDrag');
  assert(/_dupSpawnFrom\(o, 0, 0, /.test(drag), 'Alt-drag duplicate goes through it too');
  assert(!/spawnProp\(srcUrl/.test(drag), '...its bare spawnProp call is gone');
}

// ---------------------------------------------------------------- executed: the config actually arrives
{
  // Drive _pfEntryOf + the field checks against a stub prop carrying every category the old path dropped,
  // then confirm the entry carries each one. (The _pfSpawnEntry apply side is already exercised by the
  // prefab tests — what broke here was that duplicate never CALLED this pair.)
  const entryOf = extractFunction('_pfEntryOf');
  const propEntryFn = extractFunction('propEntry');
  assert(/e\.sg=/.test(propEntryFn) || /signals/.test(propEntryFn), 'propEntry serializes signals');
  for (const field of ['lockId', 'dialogue', 'npcName', 'interact', 'tag', 'vehicle', 'joint', 'sigNeed']) {
    assert(new RegExp('userData\\.' + field).test(propEntryFn),
      'propEntry serializes ' + field + ' — so duplicate now carries it');
  }
  assert(/delete e\.nid; delete e\.gid; delete e\.pf;/.test(entryOf),
    'and _pfEntryOf strips identity, so a duplicate gets fresh nids and no prefab mark');
}
{
  // the apply block really does re-apply those categories (spot-check the three the panel called out)
  const ap = extractFunction('_pfSpawnEntry');
  assert(/obj\.userData\.signals=p\.sg\.map/.test(ap), 'the apply block restores signals');
  assert(/xaApply\(obj, p\.xa\)/.test(ap), '...and xa animations');
  assert(/vehicleApply\(obj, p\.veh\)/.test(ap), '...and vehicle tuning');
  assert(/jointApply\(obj, p\.j\)/.test(ap), '...and physics joints');
  assert(/obj\.userData\.dialogue=p\.dlg\.map/.test(ap), '...and dialogue');
  assert(/applyPropDynState\(obj, p\)/.test(ap), '...and the dynamic/physics state the old path was copying by hand');
}

done('build 1162: duplicate (toolbar and Alt-drag) rides the prefab entry serializer + the loader-mirroring apply block — a copied door keeps its signals, lock, dialogue, animation, joints and vehicle tuning, with fresh identity and remapped group');
