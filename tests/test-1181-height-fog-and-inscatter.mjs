// build 1181: height fog + sun inscatter — the fog learns altitude and where the sun is.
//
// The rendering critic, verified: fog was a single global FogExp2 — one colour at every height, blind to
// the sun. Overriding three's OWN fog chunks patches every built-in material in one place: an exp height
// falloff (towers rise out of the fog, valleys pool) and a warm inscatter lobe when looking down-sun.
//
// THE PART THIS TEST EXISTS FOR: the uniform plumbing was a SILENT NO-OP as first written. The plan was
// "extend UniformsLib.fog with plain-object values; UniformsUtils.clone copies plain objects BY REFERENCE,
// so every material shares them" — true, but ShaderLib MERGED UniformsLib.fog at module load, so a late
// add to the lib reaches nothing: initMaterial clones ShaderLib[id].uniforms, seqWithValue silently drops
// any program uniform with no value, and both uniforms sit at GL zero forever — falloff 0 is plain exp2
// fog, inscatter 0 is none. Caught by driving the REAL three build before writing this test, not by eye
// (zero is a perfectly plausible-looking frame). Same run also caught the sprite vertex shader having no
// `transformed`, which would have silently vanished every fogged muzzle flash — build 1127's raw-shader trap.
import { gameSource, html, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

// ------------------------------------------------- the clone semantics, against the REAL three build
{
  const plain = { x: 1, y: 2, z: 3 };
  const c = THREE.UniformsUtils.clone({ a: { value: plain }, b: { value: new THREE.Vector3(1, 2, 3) } });
  assert(c.a.value === plain, 'UniformsUtils.clone copies a PLAIN OBJECT by reference — the whole system rides on this; if an upgrade deep-clones it, every material freezes at boot values');
  assert(c.b.value.isVector3 && c.b.value !== undefined && c.b.value !== null && !(c.b.value === undefined), 'sanity');
  assert(c.b.value !== c.b, 'shape sanity');
  assert(THREE.UniformsUtils.clone({ v: { value: new THREE.Vector3() } }).v.value instanceof THREE.Vector3, '...');
  const v = new THREE.Vector3(9, 9, 9);
  assert(THREE.UniformsUtils.clone({ v: { value: v } }).v.value !== v, 'a Vector3 IS deep-cloned — which is why the shared uniforms must NOT be Vector3s');
}

// ------------------------------------------------- why the ShaderLib walk exists, proven on the real build
{
  THREE.UniformsLib.fog._t1181 = { value: { x: 1 } };
  assert(THREE.ShaderLib.standard.uniforms._t1181 === undefined,
    'a LATE add to UniformsLib.fog does NOT reach ShaderLib — it merged at module load; without the walk the feature is a silent no-op');
  delete THREE.UniformsLib.fog._t1181;

  // replicate the engine's walk on the real build and prove the end-to-end share
  const shared = { x: 0.04, y: 0, z: 0.5 };
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u.fogColor) u._fogT = { value: shared }; }
  const perMat = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);   // what initMaterial does per material
  assert(perMat._fogT.value === shared, 'after the walk, a material\'s CLONED uniforms still reference the one shared object');
  shared.x = 0.11;
  eq(perMat._fogT.value.x, 0.11, '...so one CPU write per frame reaches every fogged material');
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u._fogT) delete u._fogT; }
}

// ------------------------------------------------- the sprite exception, proven on the real build
{
  assert(!THREE.ShaderLib.sprite.vertexShader.includes('begin_vertex'),
    'the sprite vertex shader has NO `transformed` — the shared fog_vertex would fail to compile there and every fogged sprite (muzzle flash) would vanish silently');
  for (const k of ['basic', 'lambert', 'phong', 'standard', 'toon', 'matcap', 'points', 'dashed', 'shadow', 'physical'])
    assert(THREE.ShaderLib[k].vertexShader.includes('begin_vertex'),
      k + ' has begin_vertex — the shared fog_vertex\'s `transformed` reference compiles everywhere except sprite');
  assert(/THREE\.ShaderLib\.sprite\.vertexShader = THREE\.ShaderLib\.sprite\.vertexShader\.replace\('#include <fog_vertex>'/.test(src),
    'the engine patches the sprite shader\'s fog include separately');
  assert(/vFogWorldPos = \( modelMatrix \* vec4\( 0\.0, 0\.0, 0\.0, 1\.0 \) \)\.xyz;/.test(src),
    '...a sprite fogs at its world ORIGIN — small object, right answer, no `transformed` needed');
}

// ------------------------------------------------- the maths, executed
{
  const fogH = (y, baseY, falloff) => Math.exp(-Math.max(0, y - baseY) * falloff);
  const fogFactor = (depth, density, h) => 1 - Math.exp(-density * density * depth * depth * h);
  { // altitude thins the fog; the ground does not change
    const ground = fogFactor(120, 0.018, fogH(0, 0, 0.04));
    const tower  = fogFactor(120, 0.018, fogH(60, 0, 0.04));
    assert(tower < ground * 0.4, 'at 60m a tower reads well under half the ground\'s fog mix');
    near(Math.log(1 - tower) / Math.log(1 - ground), fogH(60, 0, 0.04), 1e-9,
      '...and in OPTICAL DEPTH (the physical quantity — the mix saturates) it has shed exactly the height term: >90% at 60m');
    eq(fogH(0, 0, 0.04), 1, 'at the base the falloff is exactly 1 — the ground keeps classic exp2 fog');
    eq(fogH(-30, 0, 0.04), 1, '...and BELOW the base it clamps at 1 rather than super-thickening (max(0,·))');
    eq(fogH(60, 0, 0), 1, 'falloff 0 disables the height term entirely — the pre-1181 fog, exactly');
  }
  { // the inscatter lobe: forward only, tight, strength-scaled
    const sun = (cosA, strength) => Math.pow(Math.max(cosA, 0), 8) * strength;
    eq(sun(-0.5, 1), 0, 'looking AWAY from the sun scatters nothing (max(·,0) before the pow — a negative to an even power would glow backwards)');
    eq(sun(1, 0), 0, 'strength 0 is no inscatter — the old fog colour everywhere');
    assert(sun(0.966, 1) / sun(0.7, 1) > 7, 'pow 8 keeps the lobe tight — 15° off-sun holds most of it, 45° almost none');
  }
}

// ------------------------------------------------- the chunks, pinned
{
  const pv = src.match(/THREE\.ShaderChunk\.fog_pars_vertex = \[[\s\S]{0,400}?\]\.join/)[0];
  assert(/vFogDepth/.test(pv) && /vFogWorldPos/.test(pv) && /#ifdef USE_FOG/.test(pv), 'pars_vertex declares both varyings under USE_FOG');
  const fv = src.match(/THREE\.ShaderChunk\.fog_vertex = \[[\s\S]{0,600}?\]\.join/)[0];
  assert(/#ifdef USE_INSTANCING/.test(fv) && /_fwp = instanceMatrix \* _fwp;/.test(fv),
    'an instanced mesh applies instanceMatrix — project_vertex folded it into mvPosition, never into `transformed`, so without this every batched prop would fog at the batch origin');
  assert(/vFogWorldPos = \( modelMatrix \* _fwp \)\.xyz;/.test(fv), 'world position comes from modelMatrix (declared in every vertex prelude)');
  const ff = src.match(/THREE\.ShaderChunk\.fog_fragment = \[[\s\S]{0,900}?\]\.join/)[0];
  assert(/exp\( - max\( 0\.0, \( vFogWorldPos\.y - fogHeightP\.y \) \) \* fogHeightP\.x \);/.test(ff), 'the height term');
  assert(/#ifdef FOG_EXP2/.test(ff) && /\* _fogH \);/.test(ff) && /\* _fogH;/.test(ff),
    'BOTH fog models (exp2 and linear) are multiplied by the height term — a creator switching fog type keeps the altitude behaviour');
  assert(/pow\( max\( dot\( _fogV, fogSunDirW \), 0\.0 \), 8\.0 \) \* fogHeightP\.z;/.test(ff), 'the inscatter lobe');
  assert(/gl_FragColor\.rgb = mix\( gl_FragColor\.rgb, _fogCol, fogFactor \);/.test(ff), 'and the final mix is unchanged in shape from three\'s own');
}

// ------------------------------------------------- the wiring
{
  assert(/for\(const _slk in THREE\.ShaderLib\)\{ const _slu = THREE\.ShaderLib\[_slk\]\.uniforms; if\(_slu && _slu\.fogColor\)\{ _slu\.fogSunDirW = \{ value:_fogSunDirU \}; _slu\.fogHeightP = \{ value:_fogParamsU \}; \} \}/.test(src),
    'the ShaderLib walk adds both uniforms to every already-merged fogged entry — the fix for the silent no-op');
  assert(/_fogSunDirU\.x=-sd\.x; _fogSunDirU\.y=-sd\.y; _fogSunDirU\.z=-sd\.z;/.test(src),
    'renderScene feeds the sun each frame, NEGATED — _sunDir points sun→scene, inscatter wants TOWARD the sun');
  assert(/_fogParamsU\.x=\(worldCfg\.fogHeight!=null\?\+worldCfg\.fogHeight:0\.04\); _fogParamsU\.z=\(worldCfg\.fogSun!=null\?\+worldCfg\.fogSun:0\.5\);/.test(src),
    '...and the creator\'s two knobs, with defaults for a level saved before this build');
  assert(/fogHeight:0\.04, fogSun:0\.5,/.test(src), 'DEFAULT_WORLD ships both — worldCfg serialises whole, so they round-trip for free');
  assert(/slider\(b,'Fog height falloff','fogHeight',0,0\.2,0\.005\); slider\(b,'Fog sun glow','fogSun',0,1,0\.05\);/.test(src),
    'both sliders live beside the fog colour row');
}

done('build 1181: height fog + sun inscatter through three\'s own fog chunks — plain-object uniforms shared by reference into every fogged material via the ShaderLib walk (the late UniformsLib add alone reaches NOTHING — proven on the real build), sprite fogging at its origin instead of failing to compile, instanced meshes fogging where they stand, both fog models height-scaled, and two sliders where 0 is exactly the old fog');
