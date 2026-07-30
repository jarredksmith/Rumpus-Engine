// build 1153: a loot box no longer freezes the game when it spawns.
//
// Reported from play: loot boxes appearing mid-match froze everything for 2-3 seconds. The cause is the one
// the user guessed — `buildChestMesh` did `new THREE.PointLight(...)` and `mesh.add(beam)` per crate. Adding
// a light CHANGES THE SCENE'S LIGHT COUNT, and in three that invalidates every lit material's program, so
// the first crate to spawn recompiled every shader in the level. Removing the crate took the light with it
// and did it again on the way out; editor markers are built by the same function and toggled with
// `.visible`, and an invisible light is not counted, so opening the editor recompiled too.
//
// This is the THIRD time this fault has been fixed in this engine, which is why the fix is a pool and not a
// special case:
//   build 636  `_blastLightPool` — pre-seated so an explosion only ever RE-AIMS an existing light
//   build 977  the flashlight — "ALWAYS visible at intensity 0 - toggling .visible changes the light count
//              and recompiles every shader (the first-L freeze)"
// The rule both encode: the NUMBER of lights in the scene must not change during play. Position, colour,
// distance and intensity are plain uniforms and are free; existence is not.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the pool itself
{
  const fn = extractFunction('_ensureChestLights');
  assert(/new THREE\.PointLight\(0xffd166, 0, 16\)/.test(fn), 'pool lights are created at intensity ZERO');
  assert(/L\.visible = true;/.test(fn), '...always visible, because an invisible light is not counted (build 977)');
  assert(/L\.castShadow = false;/.test(fn), '...and never shadow-casting, which would add a shadow map to the count too');
  assert(/scene\.add\(L\);/.test(fn), '...and they live in the scene permanently');
  assert(/while\(_chestLightPool\.length < want\)/.test(fn), 'the pool only ever GROWS to the target — it is never shrunk mid-session');
}
// ---------------------------------------------------------------- claim / release / reconcile, executed
{
  const mkLight = () => ({ color:{ setHex(h){ this.h = h; } }, intensity:0, distance:16, visible:true, castShadow:false,
    position:{ set(x,y,z){ this.x=x; this.y=y; this.z=z; } } });
  function build(lootSpots, chests, lootMarkers){
    const pool = [];
    const scene = { add(){}, };
    const THREE = { PointLight: function(){ return mkLight(); } };
    const ctx = new Function('THREE','scene','_chestLightPool','lootSpots','chests','lootMarkers',
      extractFunction('_ensureChestLights') + '\n' +
      extractFunction('_claimChestLight') + '\n' +
      extractFunction('_releaseChestLight') + '\n' +
      extractFunction('_reconcileChestLights') + '\n' +
      'return { _ensureChestLights, _claimChestLight, _releaseChestLight, _reconcileChestLights };'
    )({ PointLight: function(c,i,d){ const L = mkLight(); L.intensity = i; L.distance = d; return L; } },
      scene, pool, lootSpots, chests, lootMarkers);
    return { ...ctx, pool };
  }
  {
    const api = build([], [], []);
    api._ensureChestLights();
    assert(api.pool.length >= 4, 'a level with no placed loot still gets a pool for the random spawns (' + api.pool.length + ')');
    const before = api.pool.length;
    api._ensureChestLights();
    eq(api.pool.length, before, 'seating twice does not grow it — growing IS a light-count change');
  }
  {
    // a level with placed loot needs a beam for the marker AND the crate of every spot, plus the randoms
    const api = build(new Array(5), [], []);
    api._ensureChestLights();
    assert(api.pool.length >= 5 * 2, 'sized for a marker and a crate per placed spot: ' + api.pool.length);
  }
  {
    const api = build([], [], []);
    const L = api._claimChestLight(0xff0000, 7, 1, 2, 3);
    assert(L, 'a crate gets a light');
    eq(L.intensity, 7, '...at the intensity it asked for');
    eq(L.color.h, 0xff0000, '...in its own colour');
    eq(L.position.x + ',' + L.position.y + ',' + L.position.z, '1,2,3', '...placed in WORLD space, since it is not parented to the crate');
    const busy = api.pool.filter(e => e.busy).length;
    eq(busy, 1, 'and it is marked busy so the next crate takes a different one');
    const L2 = api._claimChestLight(0x00ff00, 8, 4, 5, 6);
    assert(L2 && L2 !== L, 'the next crate gets a DIFFERENT light');
    api._releaseChestLight(L);
    eq(L.intensity, 0, 'releasing parks it at intensity 0 rather than removing it');
    eq(api.pool.filter(e => e.busy).length, 1, '...and frees the slot');
  }
  {
    // exhaustion must degrade to "no beam", never to a recompile
    const api = build([], [], []);
    api._ensureChestLights();
    const got = [];
    for(let i = 0; i < api.pool.length + 3; i++) got.push(api._claimChestLight(0xffd166, 8, 0, 0, 0));
    eq(got.filter(Boolean).length, api.pool.length, 'the pool hands out exactly what it has');
    eq(got.filter(g => g === null).length, 3, '...and returns null past that — a missing glow, not a frozen game');
  }
  {
    // THE reclaim: crates are removed from four different places, so reconcile is what keeps this honest
    const chests = [], markers = [];
    const api = build([], chests, markers);
    const a = api._claimChestLight(0xffd166, 8, 0, 0, 0);
    const b = api._claimChestLight(0xffd166, 8, 0, 0, 0);
    chests.push({ mesh: { userData: { beam: a } } });
    markers.push({ userData: { beam: b } });
    api._reconcileChestLights();
    eq(api.pool.filter(e => e.busy).length, 2, 'a live crate and a live marker both keep their beams');
    chests.length = 0;                       // removed by ANY path: snapshot reconcile, buyChest, wipeScene
    api._reconcileChestLights();
    eq(api.pool.filter(e => e.busy).length, 1, 'the removed crate hands its beam back');
    eq(a.intensity, 0, '...parked at zero');
    eq(b.intensity, 8, '...and the marker keeps its own');
    markers.length = 0;
    api._reconcileChestLights();
    eq(api.pool.filter(e => e.busy).length, 0, 'and a removed marker does too');
  }
  {
    // a crate that never got a beam (pool exhausted) must not confuse the reconcile
    const chests = [{ mesh: { userData: { beam: null } } }, { mesh: null }, {}];
    const api = build([], chests, []);
    api._claimChestLight(0xffd166, 8, 0, 0, 0);
    api._reconcileChestLights();
    eq(api.pool.filter(e => e.busy).length, 0, 'a crate with no beam holds nothing, and holes do not throw');
  }
}
// ---------------------------------------------------------------- the call site
{
  const fn = extractFunction('buildChestMesh');
  assert(!/new THREE\.PointLight/.test(fn), 'buildChestMesh no longer CREATES a light — that was the freeze');
  assert(/_claimChestLight\(/.test(fn), '...it claims one from the pool');
  assert(!/mesh\.add\(beam\)/.test(fn),
    'and does not parent it to the crate: removing the crate would take the light out of the scene and change the count again');
  assert(/mesh\.userData\.beam = beam;/.test(fn), 'the crate still remembers its beam, so the reconcile can find it');
}
{
  // seated where a recompile is already happening, never mid-match
  assert(/if\(typeof _ensureChestLights === 'function'\) _ensureChestLights\(\);/.test(extractFunction('spawnPlacedLoot')),
    'the pool is seated at DEPLOY, a moment that already recompiles');
  assert(/_ensureMuzzleLights\(\); if\(typeof _ensureChestLights==='function'\) _ensureChestLights\(\);/.test(src),
    '...and at load beside the other pools, BEFORE warmFlipbookShaders compiles against the count');
  const pv = src.match(/function preloadVfx\(\)[^\n]*/)[0];
  assert(pv.indexOf('_ensureChestLights') < pv.indexOf('warmFlipbookShaders'),
    'in that order: seat every pool, THEN warm the shaders');
}
{
  // the reconcile has to actually run
  assert(/_reconcileChestLights\(\);/.test(extractFunction('updateChests')), 'updateChests reconciles every frame');
}
// ---------------------------------------------------------------- the rule this build shares with 636 + 977
{
  assert(/ALWAYS visible at intensity 0/.test(src), 'the flashlight still states the rule (build 977)');
  assert(/created EAGERLY at load/.test(src), 'and the blast pool still states it too (build 636)');
  assert(/the number of lights in the scene must not change during play/i.test(src),
    'and build 1153 writes the shared rule down in one place, since three builds have now hit it');
}

// ---------------------------------------------------------------- the model path, same fault by two routes
{
  const fn = extractFunction('buildChestMesh');
  // 1. a GLB can CARRY a light. GLTFLoader turns KHR_lights_punctual into a real three light, so a crate
  //    model containing one changes the scene's light count on every spawn — the same freeze, second route.
  assert(/const kill = \[\]; model\.traverse\(o=>\{ if\(o\.isLight\) kill\.push\(o\); \}\);/.test(fn),
    'a crate model\'s own lights are stripped');
  assert(/for\(const L of kill\)\{ if\(L\.parent\) L\.parent\.remove\(L\); \}/.test(fn),
    '...removed from their parent, not just hidden — hiding a light changes the count too (build 977)');
}
{
  // 2. the first crate of a match also paid for the model's fetch, parse and first-render program compile.
  const fn = extractFunction('warmChestModel');
  assert(/if\(!url \|\| _chestModelWarmed === url\) return;/.test(fn), 'the model is warmed once per url, not per deploy');
  assert(/renderer\.compile\(scene, camera\);/.test(fn), '...by compiling it for real');
  assert(/m\.position\.set\(0, -99999, 0\);/.test(fn), '...off-screen while it happens');
  assert(/scene\.remove\(m\);/.test(fn), '...and the throwaway instance leaves the scene');
  assert(/if\(o\.isLight\) kill\.push\(o\)/.test(fn),
    'and the WARM pass strips lights too, or warming would itself move the light count');
  assert(/_chestModelWarmed = '';/.test(fn), 'a failed load resets, so it can be retried on the next deploy');
  assert(/if\(typeof warmChestModel === 'function'\) warmChestModel\(\);/.test(extractFunction('spawnPlacedLoot')),
    'and it runs at deploy, which happens whether or not the level places any loot');
}

done('build 1153: loot-box beams come from a pre-seated pool — spawning a crate mid-match no longer changes the scene\'s light count, which was recompiling every shader in the level');
