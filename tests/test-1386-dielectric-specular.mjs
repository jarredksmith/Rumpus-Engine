// build 1386: the ground and the walls get their Fresnel back.
//
// A cold critic's #1 was that the frame is "less flat-COLOURED than before and exactly as flat-LIT — no
// highlight, no fresnel edge... nothing tells the eye this is lit, only that it is coloured." Builds
// 1378-1385 all attacked albedo variation; none of them touched lighting response. The cause was one
// assignment, made twice:
//
//     floorMat.specularIntensity = floorMat.metalness;   // metal 0 => no dielectric sun-sheen
//     wallMat.specularIntensity  = wallMat.metalness;
//
// which is build 1144's mistake exactly — a metalness slider driving a term that is not about metal —
// one property over, and this one had no floor under it.
//
// This test pins the PREMISE against the real vendored three, not against my reading of it: if an upgrade
// moves those lines, the whole rationale is void and this fails loudly rather than the engine silently
// going back to matte.
import { gameSource, assert, near, eq, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');

// ------------------------------------------- the premise, in three's own words ----
let CHUNK, FRAG;
{
  CHUNK = T.ShaderChunk.lights_physical_fragment;
  FRAG = T.ShaderLib.physical.fragmentShader;
  assert(typeof CHUNK === 'string' && CHUNK.length > 200, 'three ' + T.REVISION + ' still has lights_physical_fragment');

  // 1. specularIntensity scales BOTH dielectric terms. Not one of them — both.
  assert(/material\.specularF90 = mix\( specularIntensityFactor, 1\.0, metalnessFactor \);/.test(CHUNK),
    'F90 — the grazing-angle Fresnel ceiling — is mix(specularIntensity, 1.0, metalness)');
  assert(/material\.specularColor = mix\( min\( pow2\( \( material\.ior - 1\.0 \) \/ \( material\.ior \+ 1\.0 \) \) \* specularColorFactor, vec3\( 1\.0 \) \) \* specularIntensityFactor, diffuseColor\.rgb, metalnessFactor \);/.test(CHUNK),
    '...and F0 is the dielectric term TIMES specularIntensity, before the metal mix');
  assert(/float specularIntensityFactor = specularIntensity;/.test(CHUNK), 'the factor is the material property itself');

  // 2. The branch is reached by MeshPhysicalMaterial and by nothing else, so this was never a
  //    scene-wide look — it was two surfaces disagreeing with every other material in the game.
  assert(/#define STANDARD\s*\n#ifdef PHYSICAL\s*\n\t#define IOR\s*\n\t#define SPECULAR\s*\n#endif/.test(FRAG),
    'IOR and SPECULAR are defined exactly when PHYSICAL is — so only a MeshPhysicalMaterial takes it');
  assert(/#else\s*\n\tmaterial\.specularColor = mix\( vec3\( 0\.04 \), diffuseColor\.rgb, metalnessFactor \);\s*\n\tmaterial\.specularF90 = 1\.0;/.test(CHUNK),
    '...and every MeshStandardMaterial takes the #else: F0 0.04, F90 1.0, i.e. already physical');
  eq(new T.MeshPhysicalMaterial().specularIntensity, 1, 'three\'s own default for the property is 1');
  eq(new T.MeshStandardMaterial().specularIntensity, undefined,
    'and a standard material does not have it at all — writing one is a silent no-op');
  eq(new T.MeshPhysicalMaterial().ior, 1.5, 'the default IOR is 1.5, so the dielectric F0 is 0.04');
}

// ------------------------------------------------------ the arithmetic, executed ----
// Straight out of the two chunk lines above, at the shipped metalness values. This is what the frame was
// being handed, and it is not close.
{
  const F0 = (ior) => Math.pow((ior - 1) / (ior + 1), 2);
  const mix = (a, b, t) => a * (1 - t) + b * t;
  const dielF0 = (specInt, ior) => Math.min(F0(ior), 1) * specInt;
  const f90 = (specInt, metal) => mix(specInt, 1.0, metal);

  near(F0(1.5), 0.04, 1e-9, 'the dielectric F0 at IOR 1.5 is 0.04 — what every non-metal reflects head on');

  for(const [what, metal] of [['floor', 0.1], ['wall', 0.2]]){
    const wasF0 = dielF0(metal, 1.5), nowF0 = dielF0(1, 1.5);
    const wasF90 = f90(metal, metal), nowF90 = f90(1, metal);
    near(nowF0, 0.04, 1e-9, what + ': F0 is now the physical 0.04');
    near(nowF90, 1.0, 1e-9, what + ': F90 is now 1.0 — at grazing incidence everything is a mirror');
    assert(nowF0 / wasF0 >= 4.9, what + ': F0 was ' + (nowF0 / wasF0).toFixed(1) + 'x too low (' + wasF0 + ')');
    assert(nowF90 / wasF90 >= 2.7, what + ': F90 was ' + (nowF90 / wasF90).toFixed(2) + 'x too low (' + wasF90.toFixed(2) + ')');
  }
  // and the shape of the defect: it bit HARDEST at grazing angles, which is why the measured gain grows
  // with distance across a ground plane rather than being a flat lift.
  assert((1 / f90(0.1, 0.1)) > (0.04 / dielF0(0.1, 1.5)) * 0.5,
    'the F90 suppression is of the same order as the F0 one, so the loss was not confined to head-on');
}

// ------------------------------------------------------- the coupling is gone ----
{
  // NB: the check is against the real ASSIGNMENT STATEMENTS, not a bare grep — the build's own comment
  // quotes the line it removes, and the first draft of this assertion was matching that prose.
  const sites = src.match(/^\s*\w+(\.\w+)*\.specularIntensity = [^;]+;/gm) || [];
  eq(sites.length, 2, 'exactly two writes in the engine (' + sites.length + ')');
  assert(!sites.some(s => /metalness/.test(s)),
    'and neither derives its specular intensity from its metalness any more');
  eq((src.match(/const DIELECTRIC_SPEC = ([\d.]+);/g) || []).length, 1,
    'the value is named ONCE, because two sites must agree (build 1143)');
  eq(parseFloat(src.match(/const DIELECTRIC_SPEC = ([\d.]+);/)[1]), 1,
    '...at the physical value, which is also three\'s default: metalness already does the metal/dielectric ' +
    'blend inside specularColor, so there is no second parameter here');
  eq((src.match(/\.specularIntensity = DIELECTRIC_SPEC;/g) || []).length, 2, 'and both sites read it');
  assert(/floorMat\.specularIntensity = DIELECTRIC_SPEC;/.test(src) &&
         /wallMat\.specularIntensity = DIELECTRIC_SPEC;/.test(src), 'namely the floor and the wall');

  // the "only two" claim the whole rationale rests on
  eq((src.match(/new THREE\.MeshPhysicalMaterial\(/g) || []).length, 2,
    'and the engine still constructs exactly two MeshPhysicalMaterials — if a third appears it inherits ' +
    'this decision and should be checked, because every other material in the file is Standard');
}

// ------------------------------------------------------------ no TDZ, and no collateral ----
{
  const decl = src.indexOf('const DIELECTRIC_SPEC = ');
  const use = src.indexOf('floorMat.specularIntensity = DIELECTRIC_SPEC;');
  const boot = src.indexOf('const DEFAULT_WORLD = ');
  assert(decl > 0 && use > decl, 'declared above its use');
  assert(decl < boot, '...and above DEFAULT_WORLD, so the module-level applyWorldCfg cannot hit a temporal ' +
    'dead zone — `typeof` does not guard one (builds 1127, 1331, 1350, 1383)');

  // build 1144's own value was measured twice (1144, then re-derived in 1150 against a sweep) and is NOT
  // swept up in this. Different property, different derivation, untouched.
  assert(/const SKY_ENV_FLOOR = 0\.12;/.test(src), 'SKY_ENV_FLOOR is untouched at its re-derived 0.12');
  assert(/const _envInten = \(metal, bright\) => Math\.max\(SKY_ENV_FLOOR, \+metal \|\| 0\) \* \(\(bright == null\) \? 1 : bright\);/.test(src),
    '...and so is _envInten — the environment ambient is a separate, separately measured decision');
  assert(/floorMat\.envMapIntensity = _envInten\(floorMat\.metalness, worldCfg\.skyBright\);/.test(src),
    'the floor still takes its environment intensity from that derivation');

  // roughness is what makes a surface matte, and it is still authored and still applied
  assert(/floorRough:0\.95/.test(src), 'the floor is still rough 0.95 by default — THAT is what reads as concrete');
  assert(/if\(worldCfg\.floorRough!=null\) floorMat\.roughness = Math\.max\(0, Math\.min\(1, \+worldCfg\.floorRough\)\);/.test(src),
    '...and a creator still owns it');
}

done('build 1386: the two engine surfaces stop being the only non-physical materials in the game');
