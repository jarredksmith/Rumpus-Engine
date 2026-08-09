import { gameSource, extractFunction, assert, eq, done, appliedOnceByBothLoaders } from './harness.mjs';
const src = gameSource();
// build 671: the in-game radial Deploy menu is per-level configurable (radialCfg). Each slot is a built-in shape
// or a custom model URL with its own colour / texture / scale / explosive / label-icon. Saved with the level;
// deployed props (and their material) already sync to all players via the prop reconciler.

// --- config + sanitize (executable) ---
const DEFAULT_RADIAL = (new Function('return ('+extractConstArr('DEFAULT_RADIAL', src)+')'))();
function extractConstArr(name, s){ const m = s.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n\\]);')); return m?m[1]:'[]'; }
/* build 1320: the shape list is written ONCE (PRIM_SHAPES) and RADIAL_PRIMS maps its keys, so the
   radial menu cannot offer a shape the engine cannot build. Derive it here the same way the engine does —
   asserting the same fact through the new single source. */
const PRIM_SHAPES = (new Function('return ('+(src.match(/const PRIM_SHAPES = (\[[\s\S]*?\n\]);/)||[])[1]+')'))();
assert(/const RADIAL_PRIMS = PRIM_SHAPES\.map\(_s=>_s\[0\]\);/.test(src), 'RADIAL_PRIMS IS the shape table');
const RADIAL_PRIMS = PRIM_SHAPES.map(s=>s[0]);
assert(Array.isArray(DEFAULT_RADIAL) && DEFAULT_RADIAL.length===5, 'five default slots');
// build 1411: this quoted the whole list, so adding a shape broke it with its assertion still true —
// a pin against the literal rather than against what it says. Line 14 already asserts RADIAL_PRIMS
// IS the shape table; what THIS means is that every buildable shape is on the radial.
for(const k of ['box','cylinder','sphere','cone','pillar','wedge','stairs','dome','tube','torus','sign'])
  assert(RADIAL_PRIMS.indexOf(k)>=0, 'the built-in shapes are all on the radial (build 928: the full 871 primitive set) — '+k);

const _sanitizeRadial = new Function('DEFAULT_RADIAL','RADIAL_PRIMS', extractFunction('_sanitizeRadial') + '; return _sanitizeRadial;')(DEFAULT_RADIAL, RADIAL_PRIMS);
{
  const d = _sanitizeRadial(undefined);
  eq(d.length, 5, 'blank -> defaults');
  eq(_sanitizeRadial([]).length, 5, 'empty -> defaults');
  const big = _sanitizeRadial(new Array(20).fill({src:'box'}));
  eq(big.length, 8, 'capped at 8 slots');
  const one = _sanitizeRadial([{src:'https://x/m.glb', label:'My Statue', icon:'🗿', exp:true, col:0x10203040, tex:'t.png', scale:99}])[0];
  eq(one.src, 'https://x/m.glb', 'a custom model URL is kept');
  eq(one.exp, true, 'explosive flag kept');
  eq(one.col, 0x203040, 'colour masked to 24-bit');
  eq(one.tex, 't.png', 'texture kept');
  eq(one.scale, 4, 'scale clamped');
  eq(_sanitizeRadial([{src:'box', col:'bad'}])[0].col, null, 'a bad colour -> none (default grey)');
  eq(_sanitizeRadial([{src:''}])[0].src, 'box', 'missing src -> box');
}

// --- deployProp uses the slot (material + scale + explosive) ---
const dp = extractFunction('deployProp');
assert(/function deployProp\(slot, at\)\{/.test(src), 'deployProp takes a slot (+ aimed placement, build 928)');
assert(/const sc = \(slot\.scale>0\) \? slot\.scale : 0\.9;/.test(dp), 'per-slot scale');
assert(/\(mat\.col!=null \|\| mat\.tex\) \? mat : null/.test(dp), 'the material descriptor (or null) is passed to spawnProp');

// --- the wheel renders from the config (icon + label per slot) ---
const op = extractFunction('openRadial');
assert(/radialCfg\.forEach\(\(it,i\)=>\{/.test(op) && /it\.icon/.test(op) && /it\.label/.test(op), 'the wheel is built from radialCfg');

// --- editor + persistence ---
assert(/function renderBuildMenuPanel\(\)\{/.test(src), 'a Build-menu editor panel exists');
assert(/sec\('Build menu', 'buildmenu', '<div id="edBuildMenu"><\/div>'\)/.test(src), 'the section is registered');
assert(/rules:\s*\['game','pickups','loot','invitems','buildmenu','logic','cutscenes'\]/.test(src), 'it lives in the Gameplay mode');
assert(/radial: _sanitizeRadial\(radialCfg\)/.test(src), 'serialized with the level');
appliedOnceByBothLoaders(/radialCfg = _sanitizeRadial\(level\.radial\)/g, 'restored in both load paths');

done('build 671: configurable radial build menu (shapes/models + materials)');
