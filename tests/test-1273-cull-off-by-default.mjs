import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1273: reported from play against 1267 — "I've placed some props and they don't appear now unless
// I'm right in front of them... large models I've imported literally don't appear until the player gets
// right up on them. Then they disappear as soon as the player has barely moved away."
//
// I could NOT reproduce it. Probed with a real imported GLB placed through spawnProp: bbox 79 x 8.5 x 79,
// cached _lodR 56.02 matching a live re-measure to 3 decimals, and NOT culled at any distance out to 120 m.
// So the radius maths is right for that asset and the mechanism behind the report is still unidentified.
//
// Which is exactly why this build does not try to out-argue it. A performance feature that removes a
// creator's content by default, and that I cannot fully explain, does not get to stay on by default. It
// ships OFF, gains a near-distance floor that makes the reported symptom unreachable by construction, and
// re-measures before it removes anything so a wrong radius can never be the last word.

{ // 1. OFF BY DEFAULT — the unblock
  assert(/lodPx:0,/.test(src), 'culling ships OFF; a creator opts in');
  assert(!/lodPx:[1-9]/.test(src), 'and no default anywhere turns it on');
}

const LOD_NEAR_KEEP = +extractConst('LOD_NEAR_KEEP');
const LOD_HYST = +extractConst('LOD_HYST');
const LOD_BUDGET = +extractConst('LOD_BUDGET');
const LOD_SHADOW_MUL = +extractConst('LOD_SHADOW_MUL');
assert(LOD_NEAR_KEEP >= 25, 'the near floor is generous (' + LOD_NEAR_KEEP + 'm) — this is a safety rail, not a tuning knob');

function rig(props, opts = {}) {
  const body = [
    'const LOD_HYST = ' + LOD_HYST + ', LOD_BUDGET = ' + LOD_BUDGET + ', LOD_SHADOW_MUL = ' + LOD_SHADOW_MUL +
      ', LOD_NEAR_KEEP = ' + LOD_NEAR_KEEP + ';',
    'let _lodCursor = 0, _lodAnyCulled = false, editorOpen = false, remeasures = 0;',
    // build 1431 added a GEOMETRY rung to _lodTick and a restore call to _lodRestoreAll. This harness
    // is about the cull and shadow rungs and says nothing about geometry, so the new dependency is
    // supplied INERT — _lodGeoN of 0 is exactly 'no mesh has a level of detail', which is the state
    // every assertion here was written against.
    'let _lodGeoN = 0; function _lodGeoTick(){} function _lodGeoRestoreAll(){}',
    'function _dirtyShadows(){}',
    extractFunction('_lodPxNow'), extractFunction('_lodEligible'), extractFunction('_lodSetCasting'),
    extractFunction('_lodRemeasure').replace('const bb =', 'remeasures++; const bb ='),
    // build 1440: the batches got their own rung inside _lodTick. Supplied LIFTED FROM SOURCE with an
    // empty batch list, so it runs here as a real no-op rather than a restated stub — these rigs are
    // about the PER-PROP rungs, and test-1440 owns the batch one.
    'let instanceMeshes = [];', extractFunction('_lodInstShadowTick'),
    extractFunction('_lodRestoreAll'), extractFunction('_lodTick'),
    'return { tick:_lodTick, remeasures:()=>remeasures, setEditor:(v)=>{ editorOpen=v; } };',
  ].join('\n');
  return new Function('THREE', 'worldCfg', 'propModels', 'renderer', 'camera', body)(
    THREE, opts.world || { lodPx: 2 }, props,
    { domElement: { clientHeight: 720, height: 518 } },   // a downshifted backing store, as measured live
    { position: { x: 0, y: 0, z: 0 }, fov: 75 });
}
function prop(z, size) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  m.castShadow = true; g.add(m); g.position.set(0, 0, z); g.updateMatrixWorld(true);
  return g;
}

{ // 2. THE NEAR FLOOR — the reported symptom is unreachable by construction
  const tiny = prop(-(LOD_NEAR_KEEP - 5), 0.02);   // absurdly small, well inside the floor
  const r = rig([tiny], { world: { lodPx: 8 } });
  r.tick(); r.tick();
  eq(tiny.visible, true, 'nothing inside the near floor is culled, however small it looks');
  eq(!!tiny.userData._lodCull, false);
  eq(tiny.children[0].castShadow, true, '...and it still casts, too');
  // a prop that WAS culled far away comes straight back on entering the floor, without waiting for hysteresis
  const far = prop(-4000, 0.2);
  const r2 = rig([far], { world: { lodPx: 8 } });
  r2.tick();
  eq(far.visible, false, 'far away it is culled');
  far.position.z = -(LOD_NEAR_KEEP - 1);
  r2.tick();
  eq(far.visible, true, 'and walking up to it restores it immediately — the near floor beats the hysteresis band');
}
{ // 3. RE-MEASURE BEFORE REMOVING. A stale or wrong cached radius must not be able to delete a prop.
  const big = prop(-4000, 1);
  const r = rig([big], { world: { lodPx: 4 } });
  r.tick();                                  // caches the true radius; far enough that it culls
  const n = r.remeasures();
  assert(n > 0, 'removing a prop costs a live re-measure (' + n + ')');

  // the case that matters: a LIE in the cache. Nothing else changes.
  const lied = prop(-200, 60);
  const r2 = rig([lied], { world: { lodPx: 4 } });
  r2.tick();
  eq(lied.visible, true, 'a genuinely large prop at 200m stays');
  lied.userData._lodR = 0.01;                // pretend the cache is wrong by four orders of magnitude
  r2.tick();
  eq(lied.visible, true, 'AND A WRONG CACHED RADIUS STILL CANNOT HIDE IT — the live re-measure overrules it');
  assert(lied.userData._lodR > 1, '...and the re-measure repairs the cache in passing (' + lied.userData._lodR.toFixed(1) + ')');
}
{ // 4. CSS PIXELS, not the drawing buffer. Build 1141's ladder shrinks the backing store under load, so
  // the worse a device performed the more of the level it deleted — measured live at 518 against a 720 CSS
  // height (ratio 0.72), making every cull distance 32% shorter than the number the creator typed.
  const tick = extractFunction('_lodTick');
  assert(/renderer\.domElement\.clientHeight \|\| renderer\.domElement\.height \|\| 720/.test(tick),
    'the threshold is measured in the pixels the creator SEES, not the backing store');
  // the rig above is built with clientHeight 720 / height 518, so this is executed, not just pinned:
  // a prop right at the edge must be judged by 720, and 518 would cull it.
  const edge = prop(-300, 1.7);
  const r = rig([edge], { world: { lodPx: 2 } });
  r.tick(); r.tick();
  const kCss = (720 * 0.5) / Math.tan(75 * Math.PI / 360), kBuf = (518 * 0.5) / Math.tan(75 * Math.PI / 360);
  const rad = edge.userData._lodR;
  assert((rad / 300) * kCss >= 2 && (rad / 300) * kBuf < 2,
    'the probe prop is deliberately between the two measures (' + ((rad / 300) * kCss).toFixed(2) + ' CSS px vs ' + ((rad / 300) * kBuf).toFixed(2) + ' buffer px)');
  eq(edge.visible, true, 'and it survives — a downshifted resolution ladder no longer deletes more of the level');
}
{ // 5. everything 1267/1270 established still holds
  const far = prop(-4000, 0.3);
  const r = rig([far], { world: { lodPx: 2 } });
  r.tick();
  eq(far.visible, false, 'past the floor and below the threshold it is still culled — the feature still works');
  eq(far.children[0].castShadow, false, '...and the shadow rung still fires');
  const off = prop(-4000, 0.3);
  const r2 = rig([off], { world: { lodPx: 0 } });
  r2.tick(); r2.tick();
  eq(off.visible, true, 'at 0 nothing happens at all');
  eq(off.children[0].castShadow, true);
  const ed = prop(-4000, 0.3);
  const r3 = rig([ed], { world: { lodPx: 4 } });
  r3.tick(); r3.setEditor(true); r3.tick();
  eq(ed.visible, true, 'and the editor still restores everything');
}
{ // 6. the control explains itself, including that it is off and what it will never touch
  assert(/OFF by default \(0\)/.test(src), 'the hint leads with the fact that it is off');
  assert(/Try 1 or 2 first and look around before going higher/.test(src), '...tells a creator how to adopt it safely');
  assert(/Nothing within '\+LOD_NEAR_KEEP\+'m is ever affected/.test(src),
    '...and states the near floor from the constant, so the text cannot drift from the code');
}

done('build 1273: culling ships OFF after a play report I could not reproduce (a real imported GLB measured 56.02 radius and survived to 120m) — plus a ' + LOD_NEAR_KEEP + 'm near floor that makes the reported symptom unreachable, a live re-measure before anything is removed so a wrong cached radius can never delete a prop, and a threshold measured in CSS pixels rather than the backing store the adaptive ladder shrinks');
