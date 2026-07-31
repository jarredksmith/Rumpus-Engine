// build 1197: delta + keyframe snapshots — the world broadcast stops resending what didn't change.
//
// The multiplayer critic's bandwidth item. The broadcast was the FULL state 20x/sec in raw-float JSON —
// every resting coin, sleeping crate and idle chest re-serialized with 17-digit positions — and the
// appliers prune by absence, so nothing could ever be omitted. Now every 10th snapshot (and the first any
// new connection sees) is a FULL keyframe with the old semantics exactly; the nine between carry only
// changes: per-entity deltas with death tombstones for enemies/dynamic props, changed-only sub-lists for
// coins/chests/powerups, and cm/mrad quantization throughout. Relevancy filtering was considered and
// REJECTED with a reason: per-client serialization multiplies host work N-fold at entity counts (<=60)
// where one shared snapshot is cheaper — the bytes were in repetition and precision, not in distance.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the delta core, executed
{
  const delta = new Function(extractFunction('_snapDelta') + '\nreturn _snapDelta;')();
  const keyOf = (e) => e.p.join('|');
  const prev = new Map();
  { const r = delta(true, [{ id: 1, p: [0, 0] }, { id: 2, p: [5, 5] }], prev, keyOf);
    eq(r.list.length, 2, 'a keyframe carries everything');
    eq(r.gone, undefined, '...and never tombstones (absence already means gone)');
    eq(prev.size, 2, '...and seeds the baseline'); }
  { const r = delta(false, [{ id: 1, p: [0, 0] }, { id: 2, p: [6, 5] }], prev, keyOf);
    eq(r.list.length, 1, 'a delta carries only the mover');
    eq(r.list[0].id, 2, '...the one that moved'); }
  { const r = delta(false, [{ id: 1, p: [0, 0] }, { id: 2, p: [6, 5] }], prev, keyOf);
    eq(r.list.length, 0, 'nothing moved: an EMPTY delta — the resting world costs zero entries'); }
  { const r = delta(false, [{ id: 2, p: [6, 5] }], prev, keyOf);
    eq(r.gone.join(','), '1', 'a vanished entity gets a tombstone...');
    eq(prev.size, 1, '...and leaves the baseline');
    const r2 = delta(false, [{ id: 2, p: [6, 5] }], prev, keyOf);
    eq(r2.gone, undefined, '...exactly once'); }
  { const r = delta(false, [{ id: 2, p: [6, 5] }, { id: 9, p: [1, 1] }], prev, keyOf);
    eq(r.list.length, 1, 'a NEW entity rides the delta like a change');
    eq(r.list[0].id, 9, '...'); }
}

// ---------------------------------------------------------------- the serializer wiring
{
  const sw = extractFunction('serializeWorld');
  assert(/const full = \(_snapN % 10 === 1\) \|\| _nConn !== _snapConnN;/.test(sw),
    'keyframe every 10th tick — and the moment the CONNECTION COUNT changes, so a fresh join always starts from a keyframe (deltas against a baseline the joiner never saw would be garbage)');
  assert(/for\(const pp of P\)\{ pp\.p=\[q2\(pp\.p\[0\]\),q2\(pp\.p\[1\]\),q2\(pp\.p\[2\]\)\]; pp\.y=q3\(pp\.y\|\|0\); pp\.pi=q3\(pp\.pi\|\|0\); \}/.test(sw),
    'player positions quantize to cm, angles to mrad — beyond visual resolution for an interpolated avatar, and the biggest single JSON cut');
  assert(/const K = full \? \(chests\.length \? Kall : undefined\) : \(_ks!==_snapPrevK \? Kall : undefined\);/.test(sw),
    'chests: full sub-list only when CHANGED between keyframes ([] when changed to empty, so the prune still runs); keyframes keep the old undefined-when-empty exactly');
  assert(/const D=_dd\.list\.length \? _dd\.list : undefined;/.test(sw),
    'a SLEEPING physics crate serializes nothing at all');
  assert(/dl: full\?undefined:1/.test(sw) && /en:_hostileAlive\(\)/.test(sw),   // build 1226: the count excludes friendlies — same intent, the client HUD gets the true HOSTILE count
    'deltas are marked, and the true enemy count always rides (the HUD must not read a partial E)');
}

// ---------------------------------------------------------------- the applier wiring
{
  const aw = extractFunction('applyWorld');
  assert(/if\(!msg\.dl\)\{ for\(const id in NET\.enemyMeshes\)\{ if\(!es\.has\(\+id\)\) _rmEnemy\(id\); \} \}/.test(aw),
    'keyframes prune by absence — the pre-1197 semantics, byte-for-byte in effect');
  assert(/else if\(msg\.Ex\)\{ for\(const id of msg\.Ex\) _rmEnemy\(id\); \}/.test(aw),
    'deltas remove only tombstoned enemies — a kill never lingers to the next keyframe, and an unchanged enemy never flickers out');
  assert(/if\(msg\.C\)\{/.test(aw), 'the coin section runs only when coins were sent (omitted on a delta = unchanged)');
  assert(/msg\.PU !== undefined \|\| !msg\.dl/.test(aw) && /msg\.K !== undefined \|\| !msg\.dl/.test(aw),
    'powerups and chests: on a delta, omitted means unchanged; on a keyframe, omitted still means empty (the old prune)');
  assert(/'HOSTILES: '\+\(msg\.en!=null\?msg\.en:msg\.E\.length\)/.test(aw),
    'the HUD count reads the authoritative field with the legacy fallback');
}

done('build 1197: delta + keyframe snapshots — the delta core executed through keyframe/delta/rest/tombstone/new-entity cases (a resting world costs zero entries, a death tombstones exactly once), keyframes every 10th tick and on every join, cm/mrad quantization, changed-only sub-lists, sleeping props free, and appliers that prune only on keyframes — with relevancy filtering explicitly rejected for a reason, not forgotten');
