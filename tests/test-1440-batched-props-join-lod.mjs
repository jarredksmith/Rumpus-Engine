// build 1440 — batched props stop being invisible to the LOD ladder.
//
// From the performance audit. Build 1430 gave every batch real world bounds so a frustum could reject it.
// Nothing gave it a RUNG, and nothing told the per-prop rungs a batch exists:
//
//  * `im.castShadow = true` unconditionally, so a batch cast into both cascades at any distance forever.
//    On a dense level the batched props are the MAJORITY, so build 1270's measured caster relief reached
//    almost none of the level it was written for.
//  * A batched prop is removed from the scene but stays in `propModels`, so both `_lodTick` and
//    `_lodGeoTick` walked it — spending budget slots deciding the visibility of an object nobody renders,
//    and (because the write flips `_lodDirty`) asking for a full re-render of both shadow cascades for a
//    change with no visible effect.
//
// Measured live on 16 clustered booths, 472 props, 25 batches, 428 instances, control returning EXACTLY:
//   lodPx 0 (default)          25 of 25 batches casting — unchanged
//   lodPx 6                    18
//   far corner, lodPx 8         5 of 25; the farthest four read 4-21 px against a 32 px threshold
//   a 3-prop batch at 182 m     2.4 px -> shed
//   standing INSIDE a cluster   9 still casting — the near exemption holds
//   LOD budget                  115 of 128 slots per sweep no longer spent on batched props
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();
const tick = extractFunction('_lodInstShadowTick', src);

const MUL = parseFloat(extractConst('LOD_SHADOW_MUL', src));
const NEAR = parseFloat(extractConst('LOD_NEAR_KEEP', src));
const HYST = parseFloat(extractConst('LOD_HYST', src));
assert(MUL > 0 && NEAR > 0 && HYST > 1, 'lifted the real rung constants from source');

/* ---- EXECUTED: the rung -------------------------------------------------------------------------- */
const batch = (cx, cy, cz, r, o = {}) => ({
  castShadow: o.cast !== false, count: o.count || 10, userData: o.ud || {},
  geometry: o.noGeo ? null : { boundingSphere: { center: { x: cx, y: cy, z: cz }, radius: r } },
});
const run = (batches, px, cam = { x: 0, y: 1.7, z: 0 }, k = 222) => {
  const out = { anyCulled: false };
  const fn = new Function('IM', 'OUT', `
    const LOD_SHADOW_MUL = ${MUL}, LOD_NEAR_KEEP = ${NEAR}, LOD_HYST = ${HYST};
    const instanceMeshes = IM;
    let _lodAnyCulled = false;
    ${tick}
    const d = _lodInstShadowTick(${px}, ${k}, { x:${cam.x}, y:${cam.y}, z:${cam.z} });
    OUT.anyCulled = _lodAnyCulled;
    return d;
  `);
  return { dirty: fn(batches, out), anyCulled: out.anyCulled, batches };
};

{
  // a small batch far away: 2 m radius at 180 m is ~2.5 px, well under a lodPx-8 threshold of 32
  const b = batch(180, 1, 0, 2);
  const r = run([b], 8);
  eq(b.castShadow, false, 'a small distant batch stops casting');
  assert(r.dirty, '...and says so, so the static shadow map is refreshed');
  assert(r.anyCulled, '...and marks the ladder dirty so leaving the rung restores it');
}
{
  // the same batch inside the near floor always casts, whatever the threshold says
  const b = batch(20, 1, 0, 2);
  run([b], 16);
  eq(b.castShadow, true, 'inside the near floor a batch always casts');
}
{
  // a batch's sphere spans its whole cell, so the camera is very often INSIDE it — that is the near case
  const b = batch(10, 1, 0, 14);
  run([b], 16);
  eq(b.castShadow, true, 'a batch the camera is standing in always casts');
}
{
  // big and close enough to be worth a shadow
  const b = batch(46, 1, 0, 12);
  run([b], 2);
  eq(b.castShadow, true, 'a large nearby cluster keeps casting at the default-ish threshold');
}
{
  // REMEMBERED, not assumed: a batch authored never to cast must never start
  const b = batch(180, 1, 0, 2, { cast: false });
  run([b], 8);
  eq(b.castShadow, false, 'a non-casting batch stays non-casting when far');
  run([b], 0, { x: 179, y: 1, z: 0 });
  eq(b.castShadow, false, '...and is NOT switched on when it comes close (build 1270’s lesson)');
  eq(b.userData._castAuth, false, '...because the authored value is what the rung remembers');
}
{
  // hysteresis: a batch on the boundary cannot flicker between casting and not
  const b = batch(100, 1, 0, 10);           // sp = 10/100*222 = 22.2 px
  run([b], 8);                              // spx = 32 -> sheds
  eq(b.castShadow, false, 'sheds below the threshold');
  run([b], 5.6);                            // spx = 22.4; 22.2 < 22.4*HYST -> stays shed
  eq(b.castShadow, false, '...and does not come straight back inside the hysteresis band');
  run([b], 3);                              // spx = 12; 22.2 > 12*HYST -> returns
  eq(b.castShadow, true, '...but does return once clearly above it');
}
{
  const b = batch(180, 1, 0, 2, { noGeo: true });
  const r = run([b], 8);
  eq(b.castShadow, true, 'a batch with no bounds is left alone rather than guessed at');
  eq(r.dirty, false, '...and reports nothing to refresh');
}
{
  eq(run([], 8).dirty, false, 'no batches: nothing to do, nothing reported');
}
{
  // idempotent — the common case is a frame where nothing changed, and it must not dirty the shadow map
  const b = batch(46, 1, 0, 12);
  run([b], 2);
  eq(run([b], 2).dirty, false, 'a settled frame reports no change, so the map is not re-rendered');
}

/* ---- the wiring -------------------------------------------------------------------------------------- */
// the flag, at both push sites and cleared on restore
eq((src.match(/o\.userData\._instOut = true;/g) || []).length, 2,
  'both batching paths mark the props they took out of the scene');
assert(/delete o\.userData\._instOut; if\(propModels\.indexOf\(o\)>=0\) scene\.add\(o\);/.test(src),
  'and teardown clears it as it puts them back — a flag that leaks would freeze a prop out of the ladder');

const lod = extractFunction('_lodTick', src), geo = extractFunction('_lodGeoTick', src);
assert(/if\(o\.userData\._instOut\) continue;/.test(lod), 'the cull/shadow rung skips a batched prop');
assert(/o\.userData\._instOut\) continue;/.test(geo), 'and so does the geometry rung');
const iSkip = lod.indexOf('_instOut'), iElig = lod.indexOf('_lodEligible(o)');
assert(iSkip > 0 && iElig > iSkip,
  '...before _lodEligible, whose first call on a prop is two full subtree walks and a Box3');
assert(/_lodInstShadowTick\(px, k, cam\)/.test(lod), 'and the batches get their own rung, once per sweep');
assert(lod.indexOf('_lodInstShadowTick') < lod.indexOf('if(_lodDirty'),
  '...before the shadow refresh, so a batch change is included in it rather than landing a frame late');

// and leaving the ladder restores them, or the editor would show a shed batch shadowless
const restore = extractFunction('_lodRestoreAll', src);
assert(/im\.userData\._castAuth && !im\.castShadow\) im\.castShadow = true;/.test(restore),
  'restoring the ladder restores the batches too');
assert(/_castAuth/.test(restore), '...through the authored value, never a blanket true');

done('build 1440: the batches join the ladder — they stop casting into both cascades from any distance ' +
     'once they are small on screen (remembering whether they were ever meant to cast), while the props ' +
     'they draw stop consuming the per-prop rungs’ budget and stop asking for shadow refreshes nobody sees');
