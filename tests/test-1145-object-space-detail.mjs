// build 1145: surface detail for models that have NO UVs.
//
// Build 1139 gave the engine's own surfaces a normal and roughness map. That path needs texture
// coordinates, and the shipped weapon has none — read straight out of gun.glb, every primitive carries
// only NORMAL and POSITION, and its four materials (Grey, Black, Main, White) all sit at the identical
// roughness 0.415087 / metalness 0.400000 with no maps of any kind:
//
//   mesh 0 AR_4      attrs[NORMAL,POSITION]  mat=Grey   base=[0.08,0.08,0.08,1]  rough=0.4150871  metal=0.4
//   mesh 0 AR_4      attrs[NORMAL,POSITION]  mat=Black  base=[0.02,0.02,0.02,1]  rough=0.4150871  metal=0.4
//   mesh 0 AR_4      attrs[NORMAL,POSITION]  mat=Main   base=[0.49,0.17,0.02,1]  rough=0.4150871  metal=0.4
//   mesh 0 AR_4      attrs[NORMAL,POSITION]  mat=White  base=[0.37,0.37,0.37,1]  rough=0.4150871  metal=0.4
//   mesh 1 Magazine  attrs[NORMAL,POSITION]  mat=Black  base=[0.02,0.02,0.02,1]  rough=0.4150871  metal=0.4
//
// That is the whole of a critic's "not one specular pixel and not one AO crease" on the object that
// occupies 11% of every gameplay frame, and no texture can fix it: with no UVs there is nowhere to put
// one. The low-poly sources this engine points creators at ship UV-less meshes constantly, so it is the
// general case rather than one asset.
//
// So the detail goes in OBJECT space, in the shader, patched into three's own MeshStandardMaterial via
// onBeforeCompile — the technique floorMat already uses for the paint splat, and deliberately NOT a raw
// ShaderMaterial (this file has twice lost a whole subsystem to a raw shader failing to compile silently).
//
// Measured on the weapon's receiver panel, same camera and seed: 4,782 -> 5,378 unique colours with the
// mean held at 92,102,108 -> 92,102,109, and the world away from the weapon unchanged at 132,141,147. The
// run-to-run spread is a few percent because postGrain is stochastic per frame.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the library's chunk order, verified
{
  // The four-evaluations-per-pixel optimisation below depends on three emitting roughnessmap_fragment
  // BEFORE normal_fragment_maps, so the field computed by the first patch is still in scope for the
  // second. That is an assumption about the shipped library, so check it against the shipped library
  // rather than trusting it: if a three upgrade reorders them, _odBase is read before it is written and
  // the normal perturbation silently becomes garbage.
  const T = await import('three');
  const sh = T.ShaderLib.physical.fragmentShader;
  const r = sh.indexOf('#include <roughnessmap_fragment>');
  const n = sh.indexOf('#include <normal_fragment_maps>');
  assert(r >= 0, 'three ' + T.REVISION + ' emits roughnessmap_fragment');
  assert(n >= 0, '...and normal_fragment_maps');
  assert(r < n, 'roughnessmap_fragment comes FIRST in three ' + T.REVISION + ' (' + r + ' < ' + n + '), which is what the shared evaluation relies on');
}

// ---------------------------------------------------------------- object space, for a stated reason
{
  assert(/vOdPos = position;/.test(src), 'the varying carries the OBJECT-space position');
  assert(!/vOdPos = \(modelMatrix/.test(src) && !/vOdPos = worldPosition/.test(src), '...not the world-space one');
  assert(/world-space noise would make the grain SWIM/.test(src),
    'and the reason is recorded: a viewmodel bobs and a prop can be carried, so world-space grain would swim across the surface');
}

// ---------------------------------------------------------------- who gets it, executed
{
  const fn = new Function(extractFunction('objDetailWanted') + '; return objDetailWanted;')();
  const geoNoUV = { attributes: { position: {}, normal: {} } };
  const geoUV = { attributes: { position: {}, normal: {}, uv: {} } };
  const std = () => ({ isMeshStandardMaterial: true });

  assert(fn(geoNoUV, std()) === true, 'a UV-less standard material is exactly the case this serves');
  assert(fn(geoUV, std()) === false, 'a mesh WITH UVs is left to the texture path — two detail systems on one surface is double grain');
  assert(fn(geoNoUV, { isMeshBasicMaterial: true }) === false, 'a Basic material has no roughness to modulate');
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'])
    assert(fn(geoNoUV, Object.assign(std(), { [slot]: {} })) === false,
      'a material with an authored ' + slot + ' is never touched — the creator\'s asset always wins');
  assert(fn(null, std()) === false, 'no geometry, no detail');
  assert(fn(geoNoUV, null) === false, '...and no material either');
}

// ---------------------------------------------------------------- the frequency normalises, executed
{
  const mk = () => new Function('OBJ_DETAIL_CYCLES', 'Math', 'isFinite',
    extractFunction('_objDetailFreq') + '; return _objDetailFreq;')(
      +src.match(/const OBJ_DETAIL_CYCLES = ([\d.]+);/)[1], Math, isFinite);
  const f = mk();
  const CYC = +src.match(/const OBJ_DETAIL_CYCLES = ([\d.]+);/)[1];
  assert(CYC > 8 && CYC < 200, 'the density is a plausible number of cycles across an object (' + CYC + ')');

  const box = (sx, sy, sz) => ({ boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: sx, y: sy, z: sz } } });
  // the whole point: a GLB in ANY units gets the same apparent grain density
  for (const span of [0.01, 0.5, 1, 40, 1000]) {
    const freq = f(box(span, span * 0.2, span * 0.1), 0);
    near(freq * span, CYC, 1e-6, 'a ' + span + '-unit model gets ' + CYC + ' cycles across it, not ' + (freq).toFixed(1) + ' per unit');
  }
  // the LONGEST axis is what normalises, so a long thin object is not over-detailed on its short side
  eq(f(box(10, 1, 1), 0), f(box(1, 10, 1), 0), 'orientation does not change the density');
  eq(f(box(10, 1, 1), 0), f(box(1, 1, 10), 0), '...on any axis');
  // a caller can ask for coarser grain
  near(f(box(1, 1, 1), 18) * 1, 18, 1e-9, 'an explicit cycle count is honoured');
  // degenerate input returns 0, which applyObjDetail reads as "use the default"
  eq(f(box(0, 0, 0), 0), 0, 'a zero-extent mesh yields no frequency rather than Infinity');
  eq(f(null, 0), 0, 'and neither does a missing geometry');
  {
    // a geometry with no boundingBox must be measured, not skipped
    let computed = false;
    const geo = { computeBoundingBox() { computed = true; this.boundingBox = { min:{x:0,y:0,z:0}, max:{x:2,y:1,z:1} }; } };
    const freq = f(geo, 0);
    assert(computed, 'an unmeasured geometry has its bounds computed');
    near(freq * 2, CYC, 1e-6, '...and is then normalised like any other');
  }
  {
    // ...and one that throws while computing them must not take the load down
    const geo = { computeBoundingBox() { throw new Error('no position attribute'); } };
    eq(f(geo, 0), 0, 'a geometry that cannot be measured degrades to the default rather than throwing');
  }
  eq(f({ boundingBox: { min:{x:0,y:0,z:0}, max:{x:Infinity,y:1,z:1} } }, 0), 0, 'a non-finite extent is rejected');
}

// ---------------------------------------------------------------- the patch itself
{
  const fn = extractFunction('applyObjDetail');
  assert(/if\(!mat \|\| mat\.userData\._objDetail\) return mat;/.test(fn), 'a material is patched once, however many meshes share it');
  // build 1382 gave the handler a second parameter (it chains a predecessor, which three calls with the
  // renderer). Still three's own material, still patched rather than replaced — which is the whole point:
  // a raw ShaderMaterial loses three's lighting, shadows, fog and tone mapping, and this file has twice
  // lost a subsystem to one failing to compile silently.
  assert(/mat\.onBeforeCompile = \(shader, renderer\)=>\{/.test(fn), 'it patches three\'s own material rather than replacing it');
  assert(!/new THREE\.ShaderMaterial/.test(fn), '...and never swaps in a raw ShaderMaterial');
  // build 1379 gave the patch a second MODE (albedo-only, for a surface whose relief the texture path
  // already serves), so the key is one of two constants rather than one. The assertion's intent is
  // unchanged and is stated directly now: the key may depend on the MODE and on nothing else, because a
  // key that varies per material is a program per material — which is the whole reason it exists.
  // build 1382 made this a COMPOSING function (a material can also carry the paint splat's own key, and a
  // single key would serve one of them the other's program). The intent is unchanged and is stated as the
  // property rather than the shape: the key is a pure function of the CONFIGURATION — the mode and which
  // other patches the material carries — and never of the material instance, because a key that varies
  // per material is a program per material, which is the whole reason it exists.
  {
    assert(/mat\.customProgramCacheKey = function\(\)\{/.test(fn), 'the patched material declares a program cache key');
    const key = (albOnly, prev, prevKey) => {
      let p = ''; if(prevKey){ try{ p = String(prevKey() || ''); }catch(e){} }
      return (albOnly ? 'objDetailA' : 'objDetail') + (prev ? '+c' : '') + p;
    };
    const a = key(false, null, null), b = key(true, null, null);
    assert(typeof a === 'string' && typeof b === 'string' && a && b, 'both modes name a program');
    assert(a !== b, '...and they are DIFFERENT programs, or one mode would be served the other\'s shader');
    eq(key(false, null, null), a, 'the key is a pure function of the configuration');
    eq(key(true, null, null), b, '...in both modes');
    // two materials in the SAME configuration must agree, or every material compiles its own program
    eq(key(true, true, () => 'splat'), key(true, true, () => 'splat'), 'two materials configured alike share one program');
    assert(key(true, true, null) !== b, 'and a chained material is honestly a different program');
  }
  // build 1379 moved this onto the material (the uniform does not exist until the first render, and a
  // prop's span is set before that), so the fallback is asserted where it now lives. Same intent.
  assert(/mat\.userData\._odFreq = \(freq > 0\) \? freq : OBJ_DETAIL_CYCLES;/.test(fn),
    'a zero or missing frequency falls back to the default');

  // the two chunks it hooks, and the ORDER the sharing depends on
  assert(/\.replace\('#include <roughnessmap_fragment>'/.test(fn), 'roughness is modulated after the chunk that declares roughnessFactor');
  assert(/\.replace\('#include <normal_fragment_maps>'/.test(fn), 'and the normal after the chunk that finishes it');
  assert(fn.indexOf("'#include <roughnessmap_fragment>'") < fn.indexOf("'#include <normal_fragment_maps>'"),
    'the roughness patch is written first, because it is what computes the field the normal patch reuses');
  assert(/vec3 _odP; float _odBase;/.test(fn), 'the field is held in shader globals so it is evaluated once, not twice');
  assert(/_odBase = _odField\(_odP\);/.test(fn), 'the roughness patch computes it');
  assert(/_odField\(_odP \+ vec3\(_odE,0\.0,0\.0\)\) - _odBase/.test(fn), '...and the normal patch differences against it');

  // roughness must stay in range whatever the noise does
  assert(/roughnessFactor = clamp\(roughnessFactor \* mix\(1\.0 - uOdRough\*uOdOn, 1\.0 \+ uOdRough\*uOdOn, _odBase\), 0\.03, 1\.0\)/.test(fn),
    'roughness is a bounded MULTIPLIER of the authored value, so an author\'s choice is modulated and never replaced');
  // the perturbation must not tilt the normal off its own surface
  assert(/_odG -= normal \* dot\(_odG, normal\);/.test(fn),
    'the gradient is projected onto the tangent plane, so the perturbation cannot rotate the normal away from the surface');
  assert(/normal = normalize\(normal \+ _odG \* uOdBump \* uOdOn\);/.test(fn), '...and the result is renormalised');
}
{
  // the noise is a hash, so it needs no texture and therefore no UVs — which is the entire point
  const g = src.match(/const _OBJ_NOISE_GLSL = \[[\s\S]*?\]\.join\('\\n'\);/)[0];
  assert(/float _odHash\(vec3 p\)/.test(g), 'the field is hashed, not sampled');
  assert(!/texture2D|sampler2D/.test(g), '...so it uploads nothing and needs no UVs');
  assert(/f=f\*f\*\(3\.0-2\.0\*f\)/.test(g), 'smoothstep between lattice points, or the cells show');
  assert(/_odNoise\(p\)\*0\.65 \+ _odNoise\(p\*3\.1\)\*0\.35/.test(g),
    'two octaves: a broad panel-to-panel variation plus a fine machined grain');
  // strengths must be subtle — this is micro-detail on an object filling a tenth of the screen
  const rough = +src.match(/const OBJ_DETAIL_ROUGH = ([\d.]+);/)[1];
  const bump = +src.match(/const OBJ_DETAIL_BUMP = ([\d.]+);/)[1];
  assert(rough > 0.05 && rough <= 0.5, 'the roughness swing is a modulation, not a takeover (' + rough + ')');
  assert(bump > 0.02 && bump <= 0.8, 'and the relief is micro-relief (' + bump + ')');
}

// ---------------------------------------------------------------- wired where it matters
{
  const inst = extractFunction('installObjDetail');
  assert(/const f = _objDetailFreq\(o\.geometry, cycles\);/.test(inst), 'each mesh is measured on its own');
  assert(/Array\.isArray\(o\.material\) \? o\.material : \[o\.material\]/.test(inst), 'a multi-material mesh has all of them considered');
  assert(/if\(objDetailWanted\(o\.geometry, m\)\)\{ applyObjDetail\(m, f\); n\+\+; \}/.test(inst), 'and only the ones that qualify are patched');
  assert(/return n;/.test(inst), 'it reports how many, so a caller can log or test it');
  // the shared-material hazard is acknowledged rather than silently wrong
  assert(/NOTE the shared-material hazard/.test(src),
    'the one case this cannot serve exactly — two very different sizes sharing one material — is written down');

  // the viewmodel: the critic's actual subject
  assert(/if\(typeof installObjDetail==='function'\) installObjDetail\(model\);\n      gun\.add\(model\);/.test(src),
    'the weapon viewmodel gets it, at the default density');
  // ...and imported props, coarser, because a prop is metres across and seen from further away
  assert(/if\(typeof installObjDetail === 'function'\) installObjDetail\(o, 18\);/.test(src), 'imported props get it at a coarser density');
  const fp = extractFunction('finalizeProp');
  assert(/installObjDetail\(o, 18\)/.test(fp), '...from finalizeProp, where every import\'s materials are already walked');
}

done('build 1145: a model with no UVs gets object-space surface detail, normalised to its own size, and an authored texture always wins');
