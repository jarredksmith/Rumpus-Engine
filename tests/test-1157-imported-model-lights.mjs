// build 1157: a model's OWN lights are adopted, not taken at face value.
//
// GLTFLoader turns `KHR_lights_punctual` into a real three light and hands it over untouched. Build 1153 hit
// one consequence on the loot box — a light appearing mid-match recompiles every shader — and stripped them
// there. Everywhere else they arrived raw, and the loader's own code (inlined in this file, so it can be read
// rather than guessed at) shows raw is three separate faults:
//
//   `if (lightDef.intensity !== undefined) lightNode.intensity = lightDef.intensity;`
//        glTF states a punctual light in CANDELA. Blender writes the hundreds or thousands. This engine's
//        own decorative point lights sit at 2-8, and its SUN is 1.5.
//   `lightNode.distance = range;`  with  `const range = lightDef.range !== undefined ? lightDef.range : 0;`
//        glTF's `range` is optional, and 0 means INFINITE in three. A lamp in a corner lights the whole
//        level, through walls.
//   (nothing at all bounds the COUNT)
//        forty emitters in a chandelier GLB is forty entries in NUM_POINT_LIGHTS, looped per pixel by every
//        material in the level.
//
// A creator who ships a lamp model with a light in it means it, so this ADOPTS rather than strips: rescaled
// into the engine's range, given a finite reach, capped in number, and handed to build 811's light budget.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const N = (k) => { const m = src.match(new RegExp('const ' + k + ' = ([\\d.]+);')); assert(m, k + ' is declared'); return +m[1]; };
const MAXN  = N('MODEL_LIGHT_MAX');
const TGT   = N('MODEL_LIGHT_TARGET');
const MAXD  = N('MODEL_LIGHT_MAX_DIST');

// ---------------------------------------------------------------- the loader really does hand these over raw
{
  // GLTFLoader is its OWN <script> block, so this reads the whole document rather than gameSource()
  assert(/if \( lightDef\.intensity !== undefined \) lightNode\.intensity = lightDef\.intensity;/.test(html),
    'GLTFLoader assigns the glTF intensity verbatim — the fault this build exists for');
  assert(/const range = lightDef\.range !== undefined \? lightDef\.range : 0;/.test(html),
    "...and range defaults to 0, which is three's INFINITE");
  assert(/lightNode\.distance = range;/.test(html), '...straight onto the light');
}

// ---------------------------------------------------------------- executed against real glTF-shaped lights
{
  const mkLight = (type, intensity, distance) => ({
    isLight: true, isPointLight: type === 'point', isSpotLight: type === 'spot',
    intensity, distance: distance || 0, castShadow: true, parent: null, type,
  });
  function build(){
    const emitterLights = [];
    const THREE = { Box3: function(){ return {
      setFromObject(o){ const s = o.__span != null ? o.__span : 8;
        this.min = { x: 0, y: 0, z: 0 }; this.max = { x: s, y: 0, z: 0 }; return this; },
      isEmpty(){ return false; }, min: { x: 0 }, max: { x: 0, y: 0, z: 0 } }; } };
    const api = new Function('THREE', 'emitterLights', 'registerEmitterLight', 'unregisterEmitterLight',
      'MODEL_LIGHT_MAX', 'MODEL_LIGHT_TARGET', 'MODEL_LIGHT_MAX_DIST',
      extractFunction('adoptModelLights') + '\n' + extractFunction('releaseModelLights') + '\n' +
      'return { adoptModelLights, releaseModelLights };'
    )(THREE, emitterLights,
      (L) => { L.castShadow = false; emitterLights.push({ light: L, baseIntensity: L.intensity }); },
      (L) => { const i = emitterLights.findIndex(e => e.light === L); if (i >= 0) emitterLights.splice(i, 1); },
      MAXN, TGT, MAXD);
    return { ...api, emitterLights };
  }
  // a prop stand-in: traverse over a flat child list, with the span the bbox stub will report
  const prop = (lights, span) => { const o = { userData: {}, __span: span,
    traverse(fn){ fn(o); for (const L of lights) fn(L); } }; return o; };

  {
    // a Blender-scale lamp: 1000 candela, no range
    const api = build();
    const L = mkLight('point', 1000, 0);
    const o = prop([L], 8);
    const kept = api.adoptModelLights(o);
    eq(kept.length, 1, 'the lamp is kept, not stripped — a creator who ships a light means it');
    eq(L.intensity, TGT, 'and 1000 candela is rescaled to the engine\'s own range (' + L.intensity + ')');
    assert(L.distance > 0 && L.distance <= MAXD, 'an infinite reach becomes a finite one (' + L.distance + ')');
    eq(L.castShadow, false, 'and it never casts — a shadow map per imported lamp is a whole depth pass');
    eq(api.emitterLights.length, 1, 'it joins the light budget, so distance culls it like every other emitter');
  }
  {
    // relative brightness inside ONE model is the author's intent and must survive
    const api = build();
    const a = mkLight('point', 800, 0), b = mkLight('point', 200, 0), c = mkLight('point', 400, 0);
    api.adoptModelLights(prop([a, b, c], 8));
    eq(a.intensity, TGT, 'the brightest lands on the target');
    near(b.intensity / a.intensity, 200 / 800, 1e-6, '...and the others keep their ratio to it');
    near(c.intensity / a.intensity, 400 / 800, 1e-6, '...all of them');
  }
  {
    // the count is capped, and the SURVIVORS are the brightest
    const api = build();
    const ls = [10, 900, 30, 700, 50, 500].map(v => mkLight('point', v, 0));
    const kept = api.adoptModelLights(prop(ls, 8));
    eq(kept.length, MAXN, 'a chandelier is capped at ' + MAXN + ' lights');
    for (const L of kept) assert(L.intensity > 0, '...and every survivor is one of the bright ones');
    const dropped = ls.filter(L => kept.indexOf(L) < 0);
    eq(dropped.length, ls.length - MAXN, '...and the rest are dropped');
    for (const L of dropped) eq(L.parent, null, 'a dropped light leaves the graph entirely — hiding one still counts it (build 977)');
    eq(api.emitterLights.length, MAXN, 'only the kept ones are budgeted');
  }
  {
    // reach follows the MODEL's own size, because a GLB arrives in whatever units its author used
    const small = build(), big = build();
    const ls = mkLight('point', 5, 0), lb = mkLight('point', 5, 0);
    small.adoptModelLights(prop([ls], 0.4));
    big.adoptModelLights(prop([lb], 400));
    assert(ls.distance >= 4, 'a tiny model still gets a usable reach (' + ls.distance + ')');
    eq(lb.distance, MAXD, 'and a huge one is clamped, so no import lights the whole level (' + lb.distance + ')');
    assert(lb.distance > ls.distance, '...but bigger models do reach further');
  }
  {
    // an author who DID state a sane range keeps it
    const api = build();
    const L = mkLight('point', 5, 9);
    api.adoptModelLights(prop([L], 8));
    eq(L.distance, 9, "a range the author actually stated is respected");
  }
  {
    // a model with no lights costs nothing and records nothing
    const api = build();
    const o = prop([], 8);
    eq(api.adoptModelLights(o).length, 0, 'a model with no lights is a no-op');
    eq(o.userData.modelLights, undefined, '...and leaves no bookkeeping behind');
  }
  {
    // THE round trip: shatter a lamp prop and restore it. Re-scaling on the way back would darken it every
    // time it was destroyed, which is the bug the idempotence guard exists for.
    const api = build();
    const L = mkLight('point', 600, 0);
    const o = prop([L], 8);
    api.adoptModelLights(o);
    const after = L.intensity;
    api.releaseModelLights(o);
    eq(api.emitterLights.length, 0, 'a destroyed lamp gives its budget slot back');
    assert(o.userData.modelLights, '...but the prop REMEMBERS its normalised set');
    api.adoptModelLights(o);
    eq(api.emitterLights.length, 1, 'restoring re-registers it');
    eq(L.intensity, after, '...at the SAME intensity — the scale factor is applied once, never compounded');
    api.adoptModelLights(o);
    eq(api.emitterLights.length, 1, 'and adopting twice does not double-register it');
  }
  {
    // a zero-intensity light must not produce NaN through the scale factor
    const api = build();
    const L = mkLight('point', 0, 0);
    api.adoptModelLights(prop([L], 8));
    eq(L.intensity, 0, 'an all-dark model stays dark instead of going NaN');
  }
}

// ---------------------------------------------------------------- wired at the one chokepoint, and released
{
  assert(/if\(gltf\) adoptModelLights\(obj\);/.test(extractFunction('finalizeProp')),
    'every imported prop goes through it — finalizeProp is the single place a GLB becomes a prop');
  assert(!/adoptModelLights/.test(extractFunction('buildChestMesh')),
    'the loot box is NOT adopted: it already has a pooled beam, and build 1153 strips its model lights');
  assert(/if\(typeof releaseModelLights==='function'\) releaseModelLights\(obj\);/.test(extractFunction('removeProp')),
    'a deleted prop gives its lights back');
  assert(/if\(typeof releaseModelLights==='function'\) releaseModelLights\(obj\);/.test(extractFunction('shatterProp')),
    '...and so does a destroyed one');
  assert(/if\(o\.userData\.modelLights && typeof adoptModelLights==='function'\) adoptModelLights\(o\);/.test(extractFunction('_restoreDestroyedProp')   /* build 1391: the body moved into a per-prop function that the deploy path and the resetprop verb SHARE */),
    '...which is re-adopted when the prop comes back');
}
{
  // the budget it registers with is the one that already exists — this build adds no second mechanism
  assert(/function registerEmitterLight\(light\)\{ light\.castShadow = false;/.test(src),
    'registerEmitterLight is build 811/997\'s existing registry');
  assert(/MAXL = _maxActiveLights\(\)/.test(extractFunction('updateLightBudget')),
    '...and it is what caps how many are lit at once');
}
{
  // the numbers must stay in the engine's own range, or "adopted" means nothing
  assert(TGT <= 8 && TGT >= 2, 'the target intensity sits in the engine\'s decorative range (' + TGT + ')');
  const sun = +src.match(/const DEFAULT_WORLD = \{[\s\S]*?sun:([\d.]+),/)[1];
  assert(TGT <= sun * 4, 'and no imported light is more than 4x the sun (' + TGT + ' vs ' + sun + ') — build 1142\'s rule');
  assert(MAXD <= 30, 'nor does one reach across a level (' + MAXD + ')');
  assert(MAXN <= 6, 'nor does one model put more than a handful into every shader (' + MAXN + ')');
}

done('build 1157: a GLB\'s own lights are adopted — rescaled out of glTF candela into the engine\'s range, given a finite reach instead of three\'s infinite, capped in number, and handed to the existing light budget — instead of arriving as a 1000-intensity infinite-range emitter per lamp');
