// build 1132: a light a creator places can cast a shadow.
//
// None could before. buildLight never touched castShadow, so every lamp, floodlight and spotlight in
// every hand-authored level shone straight through walls — the sun was the only shadow-caster in the
// engine. That is a plain capability gap against Unity, Godot and Unreal, where any light can cast.
//
// Opt-in per light, and only on SPOT and DIRECTIONAL. A point light's shadow is a cube map — six depth
// passes for one lamp — which is not a cost to hand a creator behind a checkbox in a room with eight
// of them. A spot is one pass, and a spot is what you reach for when you want a visible shadow anyway.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- buildLight, executed
{
  const mkShadow = () => ({ mapSize:{ set(a,b){ this.x=a; this.y=b; } }, camera:{}, bias:0, normalBias:0 });
  const THREE = {
    Group: class { constructor(){ this.children=[]; this.userData={}; this.position={ set(){} }; } add(o){ this.children.push(o); } },
    Object3D: class { constructor(){ this.position={ set(){} }; } },
    Mesh: class { constructor(){ this.userData={}; } add(){} },
    SphereGeometry: class {}, CylinderGeometry: class {}, MeshBasicMaterial: class {},
    Vector3: class { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; } normalize(){ return this; } },
    SpotLight: class { constructor(c,i,d,a,p){ this.color=c; this.intensity=i; this.distance=d; this.angle=a; this.penumbra=p;
      this.castShadow=false; this.shadow=mkShadow(); } },
    DirectionalLight: class { constructor(c,i){ this.color=c; this.intensity=i; this.castShadow=false; this.shadow=mkShadow(); } },
    PointLight: class { constructor(c,i,d){ this.color=c; this.intensity=i; this.distance=d; this.castShadow=false; this.shadow=mkShadow(); } },
    HemisphereLight: class { constructor(c,g,i){ this.color=c; this.groundColor=g; this.intensity=i; this.castShadow=false; this.shadow=mkShadow(); } },
  };
  const mkBuild = (coarse) => { const lightModels = [];
    const fn = new Function('THREE', 'editorOpen', 'IS_COARSE', 'Math', 'String', '_aimLight', '_UP_Y', 'scene', 'lightModels',
      extractFunction('buildLight') + '; return buildLight;')(THREE, false, coarse, Math, String, () => {}, null, { add(){} }, lightModels);
    return (o) => fn(Object.assign({ t:[0,0,0] }, o)); };
  const build = mkBuild(false);

  // the default is unchanged: nothing casts unless asked
  for (const type of ['spot', 'dir', 'point', 'hemi']) {
    const g = build({ type });
    eq(g.userData.light.castShadow, false, 'a ' + type + ' light does not cast by default');
    assert(!g.userData.wantShadow, '...and is not marked as wanting to');
  }
  // opt in on the two types that are allowed to
  for (const type of ['spot', 'dir']) {
    const g = build({ type, shadow: 1 });
    eq(g.userData.light.castShadow, true, 'a ' + type + ' light casts when asked');
    eq(g.userData.wantShadow, true, '...and is marked, so the budget and the save path can see it');
    eq(g.userData.light.shadow.mapSize.x, 1024, '...at 1024 on a desktop');
  }
  // and NOT on the two that are not
  for (const type of ['point', 'hemi']) {
    const g = build({ type, shadow: 1 });
    eq(g.userData.light.castShadow, false, 'a ' + type + ' light never casts, even when asked (a cube map is six passes)');
    assert(!g.userData.wantShadow, '...and is not marked');
  }
  // the shadow camera has to bracket the light's own reach, or the shadow either clips or has no precision
  {
    const g = build({ type:'spot', shadow:1, distance:12 });
    const sh = g.userData.light.shadow;
    eq(sh.camera.far, 12, 'a spot\'s far plane is its range');
    eq(sh.camera.near, 0.4, '...with a near plane close enough for a lamp on a wall');
    // build 1125's rule: normalBias is a TEXEL quantity, and a spot's texel comes from its range
    const expect = Math.min(0.35, Math.max(0.01, (2 * 12 / 1024) * 7.7));
    assert(Math.abs(sh.normalBias - expect) < 1e-9, 'normalBias is derived from the range and the map size (' + sh.normalBias.toFixed(4) + ')');
    assert(sh.bias < 0, 'and the depth bias is negative, as on the sun');
  }
  {
    // a longer-reaching light needs a proportionally bigger offset, for the same reason the sun does
    const a = build({ type:'spot', shadow:1, distance:8 }).userData.light.shadow.normalBias;
    const b = build({ type:'spot', shadow:1, distance:30 }).userData.light.shadow.normalBias;
    assert(b > a, 'a 30 m spot gets a larger normalBias than an 8 m one (' + a.toFixed(4) + ' vs ' + b.toFixed(4) + ')');
    assert(b <= 0.35, '...capped, so a huge range cannot offset the shadow off the surface entirely');
  }
  {
    // phones get half the map
    eq(mkBuild(true)({ type:'spot', shadow:1 }).userData.light.shadow.mapSize.x, 512, 'a phone gets a 512 map');
  }
}

// ---------------------------------------------------------------- it survives a save
{
  const fn = extractFunction('_lightOpts');
  assert(/if\(g\.userData\.wantShadow\) o\.shadow=1;/.test(fn), 'the flag serialises');
  // ...and only when set, so a level saved before this build gains no new key
  assert(!/o\.shadow=g\.userData/.test(fn), 'a non-casting light writes no shadow key at all');
}

// ---------------------------------------------------------------- the budget
{
  const fn = extractFunction('updateShadowLightBudget');
  assert(/_shadowLightT \+= \(dt\|\|0\); if\(_shadowLightT < 0\.33\) return;/.test(fn),
    're-ranked three times a second, not per frame — reallocating shadow maps every frame thrashes');
  assert(/g\.userData\.wantShadow && g\.userData\.light/.test(fn), 'only lights that asked are considered');
  assert(/want\.sort\(\(a,b\)=>a\._sd - b\._sd\);/.test(fn), 'nearest to the camera win');
  assert(/const L = want\[i\]\.userData\.light, on = i < cap && want\[i\]\.userData\.lon !== false;/.test(fn),
    'a light switched off by a signal does not hold a shadow slot');
  assert(/if\(L\.castShadow !== on\)\{ L\.castShadow = on; changed = true; \}/.test(fn), 'only writes on a real change');
  assert(/if\(changed && typeof _dirtyShadows==='function'\) _dirtyShadows\(2\);/.test(fn),
    '...and dirties the map, because a light that just started casting has none yet');
  const cap = extractFunction('_maxShadowLights');
  assert(/if\(typeof _hiFxOn!=='undefined' && !_hiFxOn\) return 0;/.test(cap),
    'the adaptive rung takes it to zero — a depth pass per light is exactly what to shed first');
  assert(/IS_COARSE\) \? 2 : 4;/.test(cap), 'two on a phone, four elsewhere');
  // executable: the cap responds to the rung and the device
  const mk = (hi, coarse) => new Function('_hiFxOn', 'IS_COARSE', extractFunction('_maxShadowLights') + '; return _maxShadowLights;')(hi, coarse);
  eq(mk(true, false)(), 4, 'desktop, rung up');
  eq(mk(true, true)(), 2, 'phone, rung up');
  eq(mk(false, false)(), 0, 'rung shed: nothing casts');
}
assert(/if\(typeof updateShadowLightBudget==='function'\) updateShadowLightBudget\(dt\);   \/\/ build 1132/.test(src),
  'the budget runs from the frame loop, beside the intensity budget it mirrors');

// ---------------------------------------------------------------- authorable
assert(/shSp\.textContent='Casts shadows';/.test(src), 'the Lights tab has the checkbox');
assert(/if\(g0\.userData\.ltype==='spot' \|\| g0\.userData\.ltype==='dir'\)\{/.test(src),
  '...shown only for the types that can cast, rather than offered and silently ignored');
assert(/const o=_lightOpts\(g0\); if\(on\) o\.shadow=1; else delete o\.shadow;/.test(src),
  'toggling REBUILDS the light through buildLight, where the shadow camera and bias are configured');
assert(/lightModels\.splice\(lightModels\.indexOf\(ng\),1\); lightModels\.splice\(idx,0,ng\);/.test(src),
  '...and puts it back in its own slot, so order and selection hold (the same move the type switch makes)');

done('build 1132: a placed spot or directional light casts a shadow, on a budget, and the level remembers');
