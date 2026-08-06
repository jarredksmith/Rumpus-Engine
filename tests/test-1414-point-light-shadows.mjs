// build 1414: a point light can cast a shadow.
//
// Builds 1132 and 1348 both refused it, and both were right on the evidence they had: a point light's
// shadow is a cube map, six depth passes for one lamp. 1348 tried to price it and could not — its frame
// sweep FAILED ITS OWN CONTROL (a 0-caster baseline read 396 ms, the return to 0 read 554 ms) — and it
// parked the feature saying so rather than shipping an expensive thing on a broken measurement, leaving
// the checkbox absent with an explanation beside it.
//
// The re-run changed the MEASURAND, not the patience. Wall-clock frames under SwiftShader have a noise
// floor bigger than the effect; DRAW CALLS are integers, they are exactly what a shadow map costs, and a
// control either returns to the baseline or the instrument is broken. tools/probe/point-shadow-cost.mjs:
//
//     casters      0     1     2     4     0 (control)
//     calls      104   193   289   474   104     <- returns EXACTLY, which 1348 could not get
//     per caster       +89  +185  +370
//
// So the price is +89 draw calls per caster — two independent runs agreed to the call while their
// BASELINES differed (104 and 173, by how much of the level had loaded), which is what the linearity row
// exists to establish: it is a property of the caster, not of the frame. Real, payable, and worth
// capping hard — which is what `_maxPointShadows` is. tools/probe/point-shadow-blocks.mjs then proves it
// WORKS on pixels: the floor behind a wall goes 75.7% darker while the lamp's own side is byte-identical.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the cap, executed
{
  const mk = (step, coarse) => new Function('_prStepI', 'IS_COARSE',
    extractFunction('_maxPointShadows') + '; return _maxPointShadows;')(step, coarse);
  eq(mk(0, false)(), 2, 'two point casters on a desktop at full resolution');
  eq(mk(0, true)(), 0, 'NONE on a phone — the measurement says one caster nearly doubles the draw calls, ' +
                       'and IS_COARSE is the device that can least afford it');
  eq(mk(1, false)(), 0, 'and none once the resolution scaler engages, the same rung the spot budget sheds on');
  eq(mk(3, false)(), 0, '...and further down the ladder');

  // it must be TIGHTER than the spot cap, or the split buys nothing
  const spot = new Function('_prStepI', 'IS_COARSE',
    extractFunction('_maxShadowLights') + '; return _maxShadowLights;')(0, false);
  assert(mk(0, false)() < spot(), 'the point cap is strictly tighter than the spot cap, because a cube is ' +
    'six passes and a spot is one (' + mk(0, false)() + ' vs ' + spot() + ')');
}

// ---------------------------------------------------------------- the budget, executed
//
// The load-bearing property is that the two kinds are ranked and capped SEPARATELY. One shared cap would
// let two point lamps quietly buy twelve depth passes out of a budget that was written for four spots.
{
  const camera = { position: { x: 0, y: 0, z: 0 } };
  const mkBudget = (lightModels) => {
    const _lp = { x: 0, y: 0, z: 0, distanceToSquared(p) {
      const dx = this.x - p.x, dy = this.y - p.y, dz = this.z - p.z; return dx*dx + dy*dy + dz*dz; } };
    let dirtied = 0;
    const fn = new Function('lightModels', 'camera', '_lp', '_prStepI', 'IS_COARSE', '_dirtyShadows',
      'let _shadowLightT = 0;' +
      extractFunction('_maxShadowLights') + ';' + extractFunction('_maxPointShadows') + ';' +
      extractFunction('updateShadowLightBudget') + '; return updateShadowLightBudget;'
    )(lightModels, camera, _lp, 0, false, () => { dirtied++; });
    return { run: (dt) => fn(dt), dirtied: () => dirtied };
  };
  const lamp = (type, dist, on) => ({
    userData: { ltype: type, wantShadow: true, lon: on !== false, light: { castShadow: false } },
    getWorldPosition(v) { v.x = dist; v.y = 0; v.z = 0; return v; }
  });

  // six spots and five points, all wanting a shadow, ordered near-to-far by construction
  const spots = [1, 2, 3, 4, 5, 6].map(d => lamp('spot', d));
  const points = [1.5, 2.5, 3.5, 4.5, 5.5].map(d => lamp('point', d));
  const all = [];                                       // interleaved, so nothing depends on list order
  for (let i = 0; i < 6; i++) { all.push(spots[i]); if (points[i]) all.push(points[i]); }
  const b = mkBudget(all);
  b.run(1);                                             // past the 0.33 s re-rank interval

  const casting = (l) => l.filter(x => x.userData.light.castShadow).length;
  eq(casting(spots), 4, 'four spots cast — the spot budget is untouched by this build');
  eq(casting(points), 2, '...and exactly two points, its own tighter cap');
  assert(spots[0].userData.light.castShadow && spots[1].userData.light.castShadow &&
         spots[2].userData.light.castShadow && spots[3].userData.light.castShadow && !spots[4].userData.light.castShadow,
    'the spots that cast are the four NEAREST');
  assert(points[0].userData.light.castShadow && points[1].userData.light.castShadow && !points[2].userData.light.castShadow,
    '...and the points that cast are the two nearest, ranked among themselves');
  assert(b.dirtied() > 0, 'and the shadow map is dirtied, because a light that just started casting has none yet');

  // the failure this split exists to prevent: a shared cap would let points eat the spot budget
  {
    const many = [1, 2, 3, 4, 5, 6].map(d => lamp('point', d));
    const b2 = mkBudget(many); b2.run(1);
    eq(casting(many), 2, 'six point lamps in a corridor still cast exactly two — under one shared cap of ' +
                         'four this would be four cube maps, i.e. twenty-four depth passes');
  }
  // a light a signal switched off never casts, on the point path exactly as on the spot path (build 699)
  {
    const off = [lamp('point', 1, false), lamp('point', 2), lamp('point', 3), lamp('point', 4)];
    const b3 = mkBudget(off); b3.run(1);
    assert(!off[0].userData.light.castShadow, 'a lamp a signal switched off never casts');
    assert(off[1].userData.light.castShadow, '...and the next one does');
    // Worth stating rather than asserting an ideal: a dark lamp still occupies its RANK, so only one of
    // these two slots is spent. That is build 1132's shipped shape (`on = i < n && lon !== false`) and it
    // is identical for spots; changing it is a different build with its own reasoning, not a side effect
    // of adding a light type. Recorded in CLAUDE.md's open work.
    assert(!off[2].userData.light.castShadow,
      'and the dark lamp still holds its rank, so a third lamp does not inherit the freed slot ' +
      '(pre-existing, shared with spots, recorded not changed)');
  }
  // nothing wanting a shadow at all is an early return, not a sort of an empty list every third of a second
  {
    const none = [{ userData: { ltype: 'point', light: { castShadow: false } } }];
    const b4 = mkBudget(none); b4.run(1);
    assert(!none[0].userData.light.castShadow, 'a light that never asked is never made to cast');
  }
  // and it only writes on a real change — reallocating a shadow map every frame thrashes
  {
    const st = [lamp('spot', 1), lamp('point', 2)];
    const b5 = mkBudget(st); b5.run(1);
    const before = b5.dirtied();
    b5.run(1);
    eq(b5.dirtied(), before, 'a second pass over an unchanged set dirties nothing');
  }
}

// ---------------------------------------------------------------- buildLight configures a CUBE
//
// Executed with the same isolated scope test-1132 uses, so a retune of the shared derivation moves both.
{
  const mkShadow = () => ({ mapSize: { set(a, b) { this.x = a; this.y = b; } }, camera: {}, bias: 0, normalBias: 0 });
  const THREE = {
    Group: class { constructor() { this.children = []; this.userData = {}; this.position = { set() {} }; } add(o) { this.children.push(o); } },
    Object3D: class { constructor() { this.position = { set() {} }; } },
    Mesh: class { constructor() { this.userData = {}; } add() {} },
    SphereGeometry: class {}, CylinderGeometry: class {}, MeshBasicMaterial: class {},
    SpotLight: class { constructor(c, i, d, a, p) { this.distance = d; this.castShadow = false; this.shadow = mkShadow(); } },
    DirectionalLight: class { constructor() { this.castShadow = false; this.shadow = mkShadow(); } },
    PointLight: class { constructor(c, i, d) { this.distance = d; this.castShadow = false; this.shadow = mkShadow(); } },
    HemisphereLight: class { constructor() { this.castShadow = false; this.shadow = mkShadow(); } },
  };
  const mkBuild = (coarse) => {
    const lightModels = [];
    // the real _sunNormalBias and its four constants, lifted rather than restated — test-1132's rig, so a
    // retune of the shared derivation moves both files or neither
    const fn = new Function('THREE', 'editorOpen', 'IS_COARSE', 'Math', 'String', '_aimLight', 'scene', 'lightModels',
      `const SUN_NB_TEXELS = ${extractConst('SUN_NB_TEXELS')};
       const WALL_REF_M = ${extractConst('WALL_REF_M')};
       const SUN_NB_MAX_M = ${extractConst('SUN_NB_MAX_M')};
       const SUN_NB_MIN_TEXELS = ${extractConst('SUN_NB_MIN_TEXELS')};
       ${src.match(/const _sunNbCap = [^\n]+/)[0]}
       ${src.slice(src.indexOf('const _sunNormalBias = '), src.indexOf('const SHADOW_REFIT_TEXELS'))}
       ` + extractFunction('buildLight') + '; return buildLight;'
    )(THREE, false, coarse, Math, String, () => {}, { add() {} }, lightModels);
    return (o) => fn(Object.assign({ t: [0, 0, 0] }, o));
  };
  const build = mkBuild(false);

  const g = build({ type: 'point', shadow: 1, distance: 24 });
  const sh = g.userData.light.shadow;
  eq(g.userData.light.castShadow, true, 'a point light casts when asked');
  eq(g.userData.wantShadow, true, '...and is marked, so the budget can rank it');
  eq(sh.camera.far, 24, 'its shadow camera reaches exactly as far as the lamp does');
  eq(sh.camera.near, 0.25, '...from a near plane close enough for a lamp on a wall');
  assert(!('fov' in sh.camera) && !('aspect' in sh.camera),
    'and nothing sets the fov or the aspect — three owns those on a cube (a fixed 90 degrees per face), ' +
    'so only the depth range is ours to set');

  // the map is SMALLER than a spot's, because it is six of them
  eq(sh.mapSize.x, 512, 'the cube is 512 per face on a desktop...');
  eq(mkBuild(true)({ type: 'point', shadow: 1 }).userData.light.shadow.mapSize.x, 256, '...and 256 on a phone');
  eq(build({ type: 'spot', shadow: 1 }).userData.light.shadow.mapSize.x, 1024,
    '...against a spot\'s 1024, so a point caster costs 1.5x a spot\'s memory rather than 6x it');

  // the default is still off: this is a checkbox, never something a creator buys by accident
  eq(build({ type: 'point' }).userData.light.castShadow, false, 'a point light still does not cast by default');
  assert(!build({ type: 'point' }).userData.wantShadow, '...and is not marked');

  // an absent distance must not leave the far plane at three's default 500, spread over a range the lamp
  // never lights — that is the whole reason the point branch touches the camera at all
  {
    const d = build({ type: 'point', shadow: 1 });
    assert(d.userData.light.shadow.camera.far > 0 && d.userData.light.shadow.camera.far <= 30,
      'a lamp with no stated distance still gets a far plane at its own default reach, not 500 (' +
      d.userData.light.shadow.camera.far + ')');
  }
}

// ---------------------------------------------------------------- and the creator is told the price
{
  const i = src.indexOf("if(g0.userData.ltype==='point'){");
  assert(i > 0, 'the point-light branch is still in the light panel');
  const blk = src.slice(i, i + 900);
  assert(/90 draw calls/.test(blk),
    'it names the MEASURED cost rather than an adjective — the notice build 1348 wrote said the light ' +
    'shines through walls, which stopped being true');
  assert(/two/.test(blk) && /phone/.test(blk),
    '...and says how many actually cast and where none do, so a creator who ticks a third box is not ' +
    'left wondering why nothing happened');
}

// the measurement itself is recorded at the constant, so nobody re-derives it or "tidies" the cap away
{
  const fn = src.slice(src.indexOf('build 1414: and how many of them may be POINT lights'),
                       src.indexOf('function _maxPointShadows'));
  assert(/104/.test(fn) && /193/.test(fn), 'the draw-call sweep is recorded at the constant');
  assert(/\+89/.test(fn), '...and the per-caster figure, which is the one that replicated across runs');
  assert(/FAILED ITS OWN CONTROL/.test(fn), '...beside why build 1348 could not get one');
  assert(/point-shadow-cost\.mjs/.test(fn), '...and the probe that produced it, so it can be re-run');
}

done('build 1414: a placed point light casts a real cube shadow, capped at two by a measured price');
