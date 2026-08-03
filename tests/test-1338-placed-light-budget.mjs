import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1338 — rendering audit #5, re-verified at the line before building: `registerEmitterLight` is
// called from emissive props (13014) and adopted GLB lights (17036/17058) and NOT from `buildLight`. So the
// Lights tool — the thing a creator actually lights a level with — produced point and spot lights that were
// never distance-culled, never faded and never capped. Build 811's budget had existed for 500 builds and the
// one surface that most needed it was outside it.
//
// It is NOT done by calling registerEmitterLight, and that is the design. `updateLightBudget` WRITES
// light.intensity every frame, and a placed light already has an owner writing that same value —
// `updateLights`, which ramps it between the signal on/off states. Two writers of one value is the defect
// this file has recorded five times; the second one wins, so registering would have turned every
// signal-controlled lamp back on. The budget is a FACTOR the existing owner multiplies in.
//
// Measured live (tools/probe/placed-lights.mjs), 20 lights in a line receding from the camera, cap 8:
//   z            0   -4   -8  -12  -16  -20  -24  -28  -32  -36  -40  -44  -48 …
//   intensity    8    8    8    8    8    8    8    8  6.4  4.8  3.2  1.6    0 …   <- the 5-rank band
//   saved        8    8    8    8    8    8    8    8    8    8    8    8    8 …   <- authored, never faded
//   signal-off nearest 0.000 while its neighbour holds 8.000      <- one writer, not two
//   shadow-caster farthest 8.00 while its neighbour is 0.00       <- exempt
//   deploy cap  60 placed + 11 emitter, cap 48 -> 23 dropped, 37 live, 23 restored, 60 back in the editor
//   under budget: the rank map is null — no ranking, no per-light lookup, no cost

// ---------------------------------------------------------------- the authored brightness is what saves
{
  assert(/intensity:\+\(\(g\.userData\.litI!=null\) \? g\.userData\.litI : L\.intensity\)/.test(src),
    '_lightOpts writes litI, the value the slider sets and every fade restores to');
  assert(/Saving the live number would quietly write the creator/.test(src), 'with the reason recorded');
  // this was already latent before the fade existed: a `startOff` light sits at intensity 0 at deploy
  assert(/`startOff` light at deploy/.test(src), 'and the fact that it was only safe by coincidence');
}

// ---------------------------------------------------------------- the ranking, executed
{
  const rank = new Function('lightModels', 'camera', 'MAXL', `
    const THREE = { Vector3: function(){ this.x=0; this.y=0; this.z=0;
      this.distanceToSquared = function(p){ const dx=this.x-p.x, dy=this.y-p.y, dz=this.z-p.z; return dx*dx+dy*dy+dz*dz; }; } };
    const _maxActiveLights = ()=>MAXL;
    let _plRankF = null;
    const _plD = new THREE.Vector3();
    ${extractFunction('_rankPlacedLights')}
    _rankPlacedLights();
    return _plRankF;`);
  const mk = (z, opts) => ({ userData: Object.assign({ ltype: 'point' }, opts || {}),
    getWorldPosition(v){ v.x = 0; v.y = 0; v.z = z; } });
  const cam = { position: { x: 0, y: 0, z: 0 } };   // the code reads camera.position, not the camera

  // under the cap there is no map at all — the cheap path is genuinely cheap
  eq(rank([mk(0), mk(-4), mk(-8)], cam, 8), null, 'under budget: no ranking is done and no map is built');

  const lights = Array.from({ length: 14 }, (_, i) => mk(-i * 4));
  const m = rank(lights, cam, 8);
  assert(m, 'over budget: a factor map exists');
  const f = lights.map(l => m.get(l));
  eq(JSON.stringify(f.slice(0, 8)), JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1]), 'the nearest MAXL are untouched');
  near(f[8], 0.8, 1e-9, 'and past it the band eases: rank 8 -> 0.8');
  near(f[9], 0.6, 1e-9, 'rank 9 -> 0.6');
  near(f[12], 0, 1e-9, 'rank 12 and beyond -> 0 (a five-rank band, so lights ease rather than snap)');
  eq(f[13], 0, 'the farthest is fully out');

  // ORDER, not index: shuffling the array must not change which light is bright
  const shuffled = [lights[13], lights[0], lights[7], lights[9], lights[1]].concat(lights.slice(2, 7), lights[8], lights.slice(10, 13));
  const m2 = rank(shuffled, cam, 8);
  eq(m2.get(lights[0]), 1, 'the nearest light is still full after a shuffle…');
  eq(m2.get(lights[13]), 0, '…and the farthest is still out — the rank is distance, not array position');

  // a shadow-caster is not in the map at all, so it never gets a factor
  const withCaster = lights.slice(0, 13).concat([mk(-100, { wantShadow: true })]);
  const m3 = rank(withCaster, cam, 8);
  eq(m3.get(withCaster[13]), undefined, 'a shadow-caster is excluded from the ranking entirely');
  // ...and excluding it does not consume a slot: 13 non-casters, so ranks 8..12 still fade
  near(m3.get(withCaster[12]), 0, 1e-9, 'the non-casters are ranked among themselves');

  // only point and spot are lit per fragment; a hemi/dir placed light is not in the budget
  const mixed = lights.concat([mk(-200, { ltype: 'hemi' }), mk(-200, { ltype: 'dir' })]);
  const m4 = rank(mixed, cam, 8);
  eq(m4.get(mixed[14]), undefined, 'a placed hemisphere light is not ranked');
  eq(m4.get(mixed[15]), undefined, 'nor a directional one — neither is a per-fragment point/spot cost');
}

// ---------------------------------------------------------------- one writer, not two
{
  const f = extractFunction('updateLights');
  assert(/_rankPlacedLights\(\);/.test(f), 'the ranking runs inside the light owner’s own tick');
  assert(/const tgt = \(\(ud\.lon===false\) \? 0 : \(ud\.litI!=null \? ud\.litI : L\.intensity\)\) \* bf;/.test(f),
    'and multiplies the TARGET — so an off light stays off (0 × anything is 0) and a fade still ramps');
  assert(/if\(typeof editorOpen!=='undefined' && editorOpen\) return;/.test(f),
    'and none of it happens in the editor, where every light is held at full so it can be aimed');
  // the budget must NOT have been wired the obvious way
  assert(!/registerEmitterLight\(light\)[^]{0,200}buildLight/.test(src), 'buildLight does not register…');
  const bl = extractFunction('buildLight');
  assert(!/registerEmitterLight/.test(bl),
    '…which would have made updateLightBudget a SECOND writer of a value updateLights already owns');
  assert(/Two writers of one value is the defect\n\/\/ this file has recorded five times/.test(src), 'with the reason recorded');
}

// ---------------------------------------------------------------- the deploy cap, and getting them back
{
  const f = extractFunction('enforceEmitterCap');
  assert(/const room = Math\.max\(0, cap - emitterLights\.length\)/.test(f),
    'placed lights share ONE budget with the emitter lights — the per-pixel cost is the total set');
  assert(/if\(ud\.wantShadow\) continue;/.test(f), 'shadow-casters are never dropped');
  assert(/drop\.sort\(\(a,b\)=>b\._plD2 - a\._plD2\)/.test(f), 'the farthest from the spawn go first');
  assert(/g\.userData\._capParent = L\.parent;/.test(f),
    'and the parent is REMEMBERED, because a light must go back exactly where it was');
  assert(/L\.parent\.remove\(L\)/.test(f) && !/\.visible *= *false/.test(f),
    'removed from the graph, not hidden — hiding still leaves it counted (build 977)');
  // an emissive prop's glow is a side effect; a lamp a creator placed is a decision
  assert(/a lamp they positioned by hand is a decision/.test(src), 'the drop order between the two kinds is justified');

  const r = extractFunction('_restoreCappedLights');
  assert(/ud\._capParent\.add\(L\)/.test(r), 'the editor gets every dropped light back…');
  assert(/_placedRefused = 0;/.test(r), '…and the count resets with them');
  assert(/_restoreCappedLights\(\);   \/\* build 1338: nothing is missing in the editor \*\//.test(extractFunction('_lightsToFull')),
    'wired into the one function that runs on the way back into the editor');
  assert(/the cap is a RUNTIME budget, not an edit to their scene/.test(src), 'with the rule stated');
}

// ---------------------------------------------------------------- and the creator is told
{
  assert(/_placedRefused>0\)/.test(src), 'Level Check reports the placed lights that were dropped…');
  assert(/They are all back in the editor/.test(src), '…and says they are not lost');
  assert(/the furthest from the player spawn go first/.test(src), '…and which ones went');
}

done('build 1338 (rendering audit #5): registerEmitterLight was called from emissive props and adopted GLB lights and NOT from buildLight, so the Lights tool — the thing a creator actually lights a level with — produced point and spot lights that were never distance-culled, never faded and never capped, for 500 builds. It is deliberately NOT fixed by calling registerEmitterLight: updateLightBudget writes light.intensity every frame and a placed light already has an owner writing that same value (updateLights, ramping it between the signal on/off states), so registering would have made the budget a second writer and turned every signal-controlled lamp back on. The budget is a FACTOR the existing owner multiplies into its target, so an off light stays off, a fade still ramps, and there is still exactly one writer — measured: a signal-off light held 0.000 while its neighbour held 8.000. Shadow-casters are exempt from both the fade and the cap, since they are already bounded by _shadowLightBudget and fading one while it still renders a depth pass is the worst of both. The deploy cap counts placed lights in the SAME budget, because the per-pixel cost is the total set and REMOVING a light is the only lever that changes r149\'s NUM_POINT_LIGHTS loop — the fade is a visual measure and saves almost nothing there, which is build 1257\'s own finding. Every dropped light comes back on the way into the editor, because the cap is a runtime budget and not an edit to the creator\'s scene. And _lightOpts now saves the AUTHORED brightness rather than the live one: it was safe before this build only because _lightsToFull happened to run first, which the fade would have turned into silent data loss');
