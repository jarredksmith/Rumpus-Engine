// build 1155: shooting an explosive barrel no longer freezes the game — and the FIFTH instance of this fault
// will name itself.
//
// `buildPropFireGroup` did `new THREE.PointLight(...)` + `grp.add(light)` + `scene.add(grp)` the moment a prop
// caught fire. The commonest way a prop catches fire is `damageProp` -> `igniteProp` on a fused explosive —
// i.e. shooting a barrel, mid-match, in combat. Adding a light changes the scene's light count, which in three
// invalidates every lit material's program, so the first barrel cost a multi-second frame; shattering it
// removed the light and did it again.
//
// That is the same fault as builds 636 (explosions), 977 (the flashlight) and 1153 (loot boxes). All four were
// found by a player reporting a freeze and someone then GUESSING which subsystem had made a light — so this
// build also adds the standing guard, which costs nothing in a normal frame because it only looks at frames
// long enough to BE a recompile.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the pool
{
  const fn = extractFunction('_ensureFireLights');
  assert(/new THREE\.PointLight\(0xff6a1a, 0, 10\)/.test(fn), 'pool lights are created at intensity ZERO');
  assert(/L\.visible = true;/.test(fn), '...always visible, because an invisible light is not counted (build 977)');
  assert(/L\.castShadow = false;/.test(fn), '...and never shadow-casting');
  assert(/scene\.add\(L\);/.test(fn), '...and they live in the scene permanently');
  assert(/while\(_fireLightPool\.length < want\)/.test(fn), 'the pool only ever GROWS — it is never shrunk');
  // sized from the level, NOT a flat floor: a seated point light is looped over per pixel by every material
  // whether or not anything has claimed it, so a level with no fire must pay nothing.
  assert(/Math\.min\(FIRE_LIGHT_MAX, _burnablePropCount\(\)\)/.test(fn),
    'the pool is sized from what the level can actually burn, with no floor — no fire, no cost');
}
{
  const fn = extractFunction('_burnablePropCount');
  assert(/o\.userData\.onFire \|\| \(o\.userData\.explosive && \(\+o\.userData\.fireFuse\|\|0\)>0\)/.test(fn),
    'a prop can burn if it is authored alight OR is a fused explosive — the two things igniteProp is reachable from');
}
// ---------------------------------------------------------------- claim / release / reconcile, executed
{
  const mkLight = () => ({ intensity: 0, distance: 0, visible: true, castShadow: false,
    position: { set(x, y, z){ this.x = x; this.y = y; this.z = z; } } });
  function build(propModels){
    const pool = [];
    const api = new Function('THREE', 'scene', '_fireLightPool', 'propModels', 'FIRE_LIGHT_MAX',
      extractFunction('_burnablePropCount') + '\n' +
      extractFunction('_ensureFireLights') + '\n' +
      extractFunction('_claimFireLight') + '\n' +
      extractFunction('_releaseFireLight') + '\n' +
      extractFunction('_reconcileFireLights') + '\n' +
      'return { _burnablePropCount, _ensureFireLights, _claimFireLight, _releaseFireLight, _reconcileFireLights };'
    )({ PointLight: function(c, i, d){ const L = mkLight(); L.intensity = i; L.distance = d; return L; } },
      { add(){}, }, pool, propModels, 12);
    return { ...api, pool };
  }
  const barrel = () => ({ userData: { explosive: true, fireFuse: 2 } });
  const lit    = () => ({ userData: { onFire: true } });
  const plain  = () => ({ userData: {} });
  {
    const api = build([plain(), plain(), plain()]);
    api._ensureFireLights();
    eq(api.pool.length, 0, 'a level with nothing burnable seats NO lights — every seated light is a per-pixel cost');
  }
  {
    const api = build([barrel(), lit(), plain(), barrel()]);
    api._ensureFireLights();
    eq(api.pool.length, 3, 'a level with 2 barrels and 1 authored fire seats 3');
    api._ensureFireLights();
    eq(api.pool.length, 3, 'seating twice does not grow it — growing IS a light-count change');
  }
  {
    const api = build(new Array(40).fill(0).map(barrel));
    api._ensureFireLights();
    eq(api.pool.length, 12, 'and it is capped: 40 barrels do not put 40 point lights in every shader');
  }
  {
    const api = build([barrel(), barrel()]);
    api._ensureFireLights();
    const a = api._claimFireLight(9);
    assert(a, 'a burning prop gets a light');
    eq(a.distance, 9, '...at the range its own size asked for');
    eq(a.intensity, 0, '...starting dark, because _animateFire is what makes it flicker');
    eq(api.pool.filter(e => e.busy).length, 1, 'and it is marked busy');
    const b = api._claimFireLight(6);
    assert(b && b !== a, 'the next fire gets a DIFFERENT light');
    eq(api._claimFireLight(6), null, 'past the pool it is null — flames without a glow, not a frozen game');
    api._releaseFireLight(a);
    eq(a.intensity, 0, 'releasing parks it rather than removing it from the scene');
    eq(a.position.y, -9999, '...out of the world');
    eq(api.pool.filter(e => e.busy).length, 1, '...and frees exactly one slot');
  }
  {
    // THE reclaim: a burning prop can leave propModels without _removePropFireVisual ever running
    const props = [barrel(), barrel()];
    const api = build(props);
    api._ensureFireLights();
    props[0].userData._fireGroup = { userData: { light: api._claimFireLight(8) } };
    props[1].userData._fireGroup = { userData: { light: api._claimFireLight(8) } };
    api._reconcileFireLights();
    eq(api.pool.filter(e => e.busy).length, 2, 'two live fires keep their beams');
    props.length = 1;                            // clearRuntimeProps / a level swap / a shatter
    api._reconcileFireLights();
    eq(api.pool.filter(e => e.busy).length, 1, 'a prop that vanished hands its beam back');
    props[0].userData._fireGroup = null;
    api._reconcileFireLights();
    eq(api.pool.filter(e => e.busy).length, 0, 'and so does one whose fire simply went out');
  }
  {
    const props = [{ userData: {} }, { userData: { _fireGroup: { userData: {} } } }, null];
    const api = build([barrel()]);
    api._ensureFireLights(); api._claimFireLight(8);
    const api2 = build(props);                   // a pool with entries but props that hold nothing
    api2.pool.push({ light: mkLight(), busy: true });
    api2._reconcileFireLights();
    eq(api2.pool.filter(e => e.busy).length, 0, 'holes and fire-less props do not throw, and hold nothing');
  }
}
// ---------------------------------------------------------------- the call sites
{
  const fn = extractFunction('buildPropFireGroup');
  assert(!/new THREE\.PointLight/.test(fn), 'buildPropFireGroup no longer CREATES a light — that was the freeze');
  assert(/_claimFireLight\(/.test(fn), '...it claims one from the pool');
  assert(!/grp\.add\(light\)/.test(fn),
    'and does not parent it to the group: removing the group would take the light out of the scene and move the count again');
  assert(/lightPooled:true/.test(fn) && /lightY:rise\*0\.4/.test(fn),
    'the group remembers it is world-space, and how high above its own origin to sit');
}
{
  const fn = extractFunction('_removePropFireVisual');
  assert(/if\(g\.userData\.lightPooled\) _releaseFireLight\(g\.userData\.light\);/.test(fn),
    'putting a fire out hands its beam back instead of deleting a light');
}
{
  const fn = extractFunction('_animateFire');
  assert(/if\(u\.lightPooled\) u\.light\.position\.set\(g\.position\.x, g\.position\.y \+ \(u\.lightY\|\|0\), g\.position\.z\);/.test(fn),
    'an unparented light is aimed in WORLD space every frame, so a burning prop that moves takes its glow with it');
  assert(/if\(u\.light\)\{/.test(fn), '...and a fire that got no light (pool exhausted) still animates');
}
{
  assert(/function resetPropFires\(\)\{ _ensureFireLights\(\);/.test(src),
    'the pool is seated at DEPLOY, a moment that already recompiles');
  assert(/if\(typeof editorOpen!=='undefined' && editorOpen\) _ensureFireLights\(\);/.test(extractFunction('updateBurningProps')),
    '...and in the editor, where a creator placing a barrel needs its glow and a hitch is acceptable');
  assert(/_reconcileFireLights\(\);/.test(extractFunction('updateBurningProps')), 'and the reconcile runs every frame');
}
{
  // the fire ZONES are deliberately untouched: refreshFireZones disposes N and rebuilds N synchronously, so the
  // count at the next render is unchanged. Only the per-prop fire was a genuine mid-match add.
  assert(/const light=new THREE\.PointLight\(lcol\.getHex\(\), 2\.4, Math\.max\(8, r\*3\)\); light\.position\.set\(0, baseY\+rise\*0\.35, 0\); grp\.add\(light\);/.test(src),
    'a fire ZONE still owns its own light — it is built at load/edit, never mid-match');
}

// ---------------------------------------------------------------- the standing guard
{
  const fn = extractFunction('_hitchLightWatch');
  assert(/if\(!\(frameMs >= HITCH_MS\) \|\| _lightWatchN < 0\) return;/.test(fn),
    'the guard only looks at frames long enough to BE a recompile — it costs nothing in a normal frame');
  assert(/if\(!\(typeof gameOn!=='undefined' && gameOn\) \|\| \(typeof editorOpen!=='undefined' && editorOpen\)\) return;/.test(fn),
    '...and only during PLAY, because authoring legitimately moves the count');
  assert(/_lightWatchSaid >= 3/.test(fn), '...and stops shouting after a few');
  assert(/console\.warn/.test(fn), 'it names the fault in the console');
  assert(/_blastLightPool \/ _chestLightPool \/ _fireLightPool/.test(fn),
    '...and points at the three pools that are the fix, so the fifth instance does not need a guess');
  const cnt = extractFunction('_countSceneLights');
  assert(/scene\.traverseVisible\(/.test(cnt),
    'the count uses traverseVisible, matching what three actually counts — a plain traverse would be blind to build 977\'s .visible toggle');
  assert(!/scene\.traverse\(o=>\{ if\(o\.isLight\) n\+\+/.test(cnt), '...not a plain traverse');
}
{
  // the baseline is taken at DEPLOY, after every pool is seated, so even the FIRST offending frame has
  // something to compare against
  assert(/if\(typeof _lightWatchBaseline==='function'\) _lightWatchBaseline\(\);/.test(src),
    'the baseline is taken at deploy');
  const dep = src.slice(src.indexOf('resetDynamicProps();        // dynamic objects return'));
  const iBase = dep.indexOf('_lightWatchBaseline()'), iPhys = dep.indexOf('buildPhysWorld==');
  assert(iBase > 0 && iPhys > 0 && iBase > iPhys, 'and it is taken at the END of deploy, after the pools are seated');
  assert(/_hitchLightWatch\(_anow-_adaptLast\)/.test(src), 'and the watch runs off the always-on frame timer');
}
{
  // four builds, one rule — it must stay written down
  assert(/the number of lights in the scene must not change during play/i.test(src),
    'the rule is still stated in the source');
  assert(/ALWAYS visible at intensity 0/.test(src), 'build 977 still states it too');
  assert(/created EAGERLY at load/.test(src), 'and build 636');
}

done('build 1155: a burning prop\'s glow comes from a pre-seated pool, so shooting an explosive barrel no longer recompiles every shader in the level — and a hitch that moves the light count now names itself in the console instead of arriving as a bug report');
