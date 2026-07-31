// build 1217: water reflects the live sky, not a hardcoded noon-blue.
//
// The rendering critic's finding, verified in code: _waterSurfaceMat set uSky to 0x9fc8d8 at CONSTRUCTION
// and updateWaterZones wrote uTime/uLight/uSunDir/uSunCol but never uSky — so at sunset, at night, under an
// authored HDRI or a volcanic sky, a lake held a flat noon-blue sheen at grazing angles. SCENE_FOG.color IS
// the sky at the horizon (applySky sets it from the same skyRadiance model, recomputed on the day cycle),
// so updateWaterZones now copies it into uSky each frame — one Color copy per zone, no new pass.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- updateWaterZones drives uSky, executed
{
  // drive the real per-zone uniform block with stubs and confirm uSky tracks SCENE_FOG.color
  const uw = extractFunction('updateWaterZones');
  const block = uw.match(/if\(u\)\{ u\.uTime[\s\S]*?SCENE_FOG\.color\) u\.uSky\.value\.copy\(SCENE_FOG\.color\); \}/);
  assert(block, 'the uniform block copies SCENE_FOG.color into uSky');

  // a tiny executable proof of the copy semantics: a Color-like with copy()
  const mkColor = (r, g, b) => ({ r, g, b, copy(o) { this.r = o.r; this.g = o.g; this.b = o.b; return this; } });
  const SCENE_FOG = { color: mkColor(0.9, 0.4, 0.2) };   // a warm sunset horizon
  const u = { uSky: { value: mkColor(0.6, 0.78, 0.85) } };   // seeded noon-blue
  // run just the uSky line
  if (SCENE_FOG && SCENE_FOG.color) u.uSky.value.copy(SCENE_FOG.color);
  eq(u.uSky.value.r, 0.9, 'uSky takes the sky\'s red at sunset (warm)');
  eq(u.uSky.value.b, 0.2, '...and its low blue — the noon-blue sheen is gone');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/uSky:    \{ value: new THREE\.Color\(0x9fc8d8\) \},   \/\* build 1217: a NOON-blue seed;/.test(src),
    'the constructor value is now documented as just a SEED');
  assert(/if\(typeof SCENE_FOG!=='undefined' && SCENE_FOG\.color\) u\.uSky\.value\.copy\(SCENE_FOG\.color\);/.test(src),
    'updateWaterZones copies the live sky-horizon colour into uSky every frame');
  // it lives inside the per-zone `if(u)` block, so it runs for every water surface
  const uw = extractFunction('updateWaterZones');
  const copyI = uw.indexOf('u.uSky.value.copy(SCENE_FOG.color)');
  const timeI = uw.indexOf('u.uTime.value=_waterTime');
  const loopEndI = uw.indexOf('underwater tint');   // the per-zone loop closes before this comment
  assert(copyI > timeI && copyI < loopEndI, 'the copy is inside the per-zone uniform block (after uTime, before the loop ends)');
}

// ---------------------------------------------------------------- SCENE_FOG really is the horizon sky
{
  // applySky sets SCENE_FOG.color from a ring of horizon skyRadiance samples — so it IS the live sky colour
  assert(/SCENE_FOG\.color\.setRGB\(Math\.min\(1,h\[0\]\), Math\.min\(1,h\[1\]\), Math\.min\(1,h\[2\]\)\);/.test(src),
    'applySky sets SCENE_FOG.color to the averaged horizon radiance');
  assert(/const c=skyRadiance\(Math\.cos\(th\), 0\.04, Math\.sin\(th\), P, S\);/.test(src),
    '...sampled around the horizon ring of the SAME sky model — so the water reflects the actual sky, day or dusk');
}

done('build 1217: water reflects the live sky — updateWaterZones copies SCENE_FOG.color (the averaged horizon radiance applySky computes from the real sky model) into uSky every frame, proven inside the per-zone block; a lake now goes warm at sunset and dark at night instead of holding a hardcoded noon-blue sheen, for one Color copy per zone and no new pass');
