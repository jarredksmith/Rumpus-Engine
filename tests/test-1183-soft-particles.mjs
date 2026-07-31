// build 1183: soft particles + scene-lit smoke.
//
// A flipbook quad slicing through world geometry drew a hard line across the intersection — the classic
// billboard artifact, and the rendering critic's remaining VFX gap. The AO G-buffer (1126) already holds
// the scene's view distance at half res, swept clean of everything that doesn't write depth (1152/1158) —
// including these very sprites — so it is exactly the "world behind the particle" a soft fade needs.
// The patch rides onBeforeCompile on SpriteMaterial (a patched BUILT-IN, never a raw ShaderMaterial —
// this file has twice lost a subsystem to a raw shader failing silently), shares its uniforms BY
// REFERENCE, and both of its string-replace anchors are verified against the REAL three build here,
// because a renamed chunk makes replace() a silent no-op and the whole feature evaporates.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

// ---------------------------------------------------------------- the anchors exist in the real build
{
  assert(THREE.ShaderLib.sprite.vertexShader.includes('gl_Position = projectionMatrix * mvPosition;'),
    'the vertex anchor is verbatim in three\'s sprite shader — if an upgrade renames it, the vSoftZ varying is silently never written');
  assert(THREE.ShaderLib.sprite.fragmentShader.includes('#include <output_fragment>'),
    'the fragment anchor is verbatim in three\'s sprite shader — if an upgrade renames it, the fade is silently never applied');
}

// ---------------------------------------------------------------- the patcher, executed on the REAL shader strings
{
  const GEO = { value: null }, P = { value: { x: 0, y: 0, z: 1, w: 1 } };
  const soft = new Function('_SOFT_GEO', '_SOFT_P', extractFunction('_softSprite') + '\nreturn _softSprite;')(GEO, P);

  const mat = { userData: {} };
  soft(mat, 3);
  eq(mat.userData.softBand, 3, 'the band rides the material');
  eq(soft({ userData: {} }, 0.01).userData.softBand, 0.05, '...floored, so a tiny sprite\'s band cannot collapse');
  eq(soft({ userData: {} }, 0).userData.softBand, 0.5, '...and a missing band takes the 0.5 default');
  eq(mat.customProgramCacheKey(), 'soft1', 'every soft sprite shares ONE program — without this three compiles a variant per material (1145\'s lesson)');

  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.sprite.vertexShader, fragmentShader: THREE.ShaderLib.sprite.fragmentShader };
  mat.onBeforeCompile(shader);
  assert(shader.uniforms.uSoftGeo === GEO && shader.uniforms.uSoftP === P,
    'the shared uniforms are wired BY REFERENCE — one CPU write per frame reaches every soft sprite');
  near(shader.uniforms.uSoftInv.value, 1 / 3, 1e-12, 'the inverse band is per-material (it scales with the sprite)');
  assert(shader.vertexShader.indexOf('vSoftZ = - mvPosition.z;') > -1 &&
    shader.vertexShader.indexOf('vSoftZ = - mvPosition.z;') < shader.vertexShader.indexOf('gl_Position = projectionMatrix * mvPosition;'),
    'the varying is written from the FINAL mvPosition, before projection');
  const fadeAt = shader.fragmentShader.indexOf('diffuseColor.a *= clamp(');
  assert(fadeAt > -1 && fadeAt < shader.fragmentShader.indexOf('#include <output_fragment>'),
    'the fade multiplies diffuseColor.a BEFORE output_fragment writes it out — additive and normal blending both scale by that alpha');
  assert(/\( _sg\.r \+ _sg\.g \+ _sg\.b \) < 0\.3 \? 1e6 : _sg\.a/.test(shader.fragmentShader),
    'a cleared texel (sky) reads as INFINITELY FAR — 1126\'s geometric test; without it every sprite fades out against the sky');
}

// ---------------------------------------------------------------- the fade maths, executed
{
  const fade = (sceneD, spriteD, inv) => Math.min(1, Math.max(0, (sceneD - spriteD) * inv));
  eq(fade(5, 10, 1 / 2), 0, 'a sprite pixel BEHIND geometry is gone entirely');
  eq(fade(30, 10, 1 / 2), 1, '...well in front, fully visible');
  near(fade(11, 10, 1 / 2), 0.5, 1e-12, '...half a band from the surface, half faded — the soft edge itself');
  eq(fade(1e6, 10, 1 / 2), 1, '...and against sky (1e6) always fully visible');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/_SOFT_P\.value\.x = _aoWant \? 1 : 0; _SOFT_P\.value\.z = w; _SOFT_P\.value\.w = h;/.test(src),
    'the feed rides the SAME _aoWant gate that keeps the G-buffer fresh — AO off means hard edges, never stale depth');
  assert(/if\(_aoGeoRT\) _SOFT_GEO\.value = _aoGeoRT\.texture;/.test(src), '...and the texture follows the RT across adaptive-res rebuilds');
  assert(/_SOFT_P\.value\.x = 0; {3}\/\* build 1183: no post chain = no fresh G-buffer = no soft fade \*\//.test(src),
    'the plain render path (post off) switches the fade OFF — otherwise sprites sample a frozen buffer');
  assert(/soft:true \},\n  smoke:[^\n]*soft:true, lit:true \},/.test(src), 'explosion and smoke opt in; smoke is also scene-lit');
  assert(/if\(cfg\.soft && !parent\) _softSprite\(mat, base\*0\.3\);/.test(src),
    'the band scales with the sprite (30% of its size), and viewmodel sprites are never softened');
  assert(!/muzzle:[^\n]*soft:true/.test(src),
    'muzzle is deliberately HARD — it lives centimetres from a gun, where a soft fade only dims the flash');
  assert(/if\(cfg\.lit\)\{ const _dl = 0\.30 \+ 0\.70\*\(\(typeof _dayActive!=='undefined' && _dayActive\) \? _dayF : 1\); mat\.color\.setScalar\(_dl\); \}/.test(src),
    'smoke luminance follows the day factor (an unlit white sheet glows at night), floored at 30%, and is exactly 1 with the cycle off');
  assert(/_softSprite\(_sm\.material, 1\); \}   \/\/ build 1183: the SOFT variant is its own program — warm it too/.test(src),
    'warmFlipbookShaders compiles the soft variant up front — the first explosion must not compile a new program mid-combat (622/1153)');
}

done('build 1183: soft particles — sprites fade across the band where they slice world geometry, reading the AO G-buffer (sky = infinitely far, band scales with the sprite, one shared program, warmed at load, gated on the buffer\'s own freshness) — and smoke is scene-lit by the day factor so night smoke stops glowing. Both replace() anchors pinned against the real three build.');
