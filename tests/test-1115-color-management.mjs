// build 1115: colour-managed output. The tone mapper shipped in build 1095; the sRGB ENCODE never did.
//
// three r149 defaults `outputEncoding` to LinearEncoding and `ColorManagement.legacyMode` to true, so
// the finished frame went to the canvas with no OETF — every pixel ~2.2 gamma too dark — while
// sRGB-tagged TEXTURES were hardware-decoded and hex material colours were not, leaving the two in
// different colour spaces. Measured on a generated arena at the same seed, the fix moves crushed
// shadows (<25% luminance) from 59% of the frame to 25% and midtones from 34% to 63%.
//
// The subtlety this file exists to protect: the post chain is raw ShaderMaterials writing
// gl_FragColor, which three's <encodings_fragment> never touches. So the encode must be applied by
// hand, by whichever pass writes the CANVAS, and by NO other pass — encode an intermediate target and
// the next pass blurs and grades gamma-encoded values.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the two renderer assignments
assert(/THREE\.ColorManagement\.legacyMode = false;/.test(src),
  'colour management is on, so hex colours convert sRGB -> linear on the way in');
assert(/renderer\.outputEncoding = THREE\.sRGBEncoding;/.test(src),
  'and the renderer encodes its output — built-in materials rendering straight to the canvas are covered by this alone');

// ---------------------------------------------------------------- the manual encode, exactly once per frame
// One shared snippet, so there is one definition of the transfer function in the file...
const oetf = src.match(/const _OETF_GLSL = \[([\s\S]*?)\]\.join\('\\n'\);/);
assert(oetf, 'the sRGB OETF is defined once, as a shared GLSL snippet');
assert(/uniform float uEncode;/.test(oetf[1]), '...gated by a uniform');
assert(/vec3 _out\(vec3 c\)\{ return mix\(c, _oetf\(c\), uEncode\); \}/.test(oetf[1]),
  '...so a pass that is not final passes its colour through untouched');
// ...used by the two passes that can be the last LINEAR stage, and by nothing else. Build 1117
// moved the encode earlier: the composite always encodes (so the grade after it runs in display
// space), which leaves the afterimage copy a plain blit.
const users = [...src.matchAll(/_OETF_GLSL,/g)].length;
eq(users, 2, 'exactly two passes encode: the DoF present, and the composite');
assert(/cu\.uEncode\.value=1;\n(?:\s*\/\/[^\n]*\n)*\s*const _fx = [^\n]*\n\s*if\(!_mbOn\)\{/.test(src),
  'the composite encodes unconditionally — motion blur no longer changes where the encode happens');
assert(/_dofMatV\.uniforms\.uEncode\.value = \(out === null\) \? 1 : 0;/.test(src),
  'the DoF present pass encodes only when it is the frame\'s last pass, not when it feeds the post chain');
// _matCopy blits display-referred pixels: encoding again would double-apply the transfer function
assert(!/_matCopy=new THREE\.ShaderMaterial\(\{[^]*?_out\(/.test(src),
  'the afterimage present pass does NOT encode — its input is already display-referred');

// A pass that writes an intermediate must not encode: the bright-pass reads _postRT and writes
// _bloomRT, and never touches the canvas.
const bright = src.slice(src.indexOf('_matBright=new THREE.ShaderMaterial'), src.indexOf('_matComp=new THREE.ShaderMaterial'));
assert(!/_out\(|_oetf\(/.test(bright), 'the bloom bright-pass does not encode — it feeds another pass');

// ---------------------------------------------------------------- run the transfer function for real
{
  // the exact GLSL, transliterated: mix(c*12.92, 1.055*pow(c,1/2.4)-0.055, step(0.0031308, c))
  const oetf1 = (c) => c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  assert(Math.abs(oetf1(0) - 0) < 1e-9, 'black stays black');
  assert(Math.abs(oetf1(1) - 1) < 1e-6, 'white stays white (' + oetf1(1).toFixed(6) + ')');
  // the whole point: linear mid-grey must LIFT to sRGB mid-grey, which is what filled the midtones
  assert(oetf1(0.2158) > 0.49 && oetf1(0.2158) < 0.51,
    'linear 0.216 encodes to sRGB ~0.5 — the ~2.2 gamma the frame used to be missing (' + oetf1(0.2158).toFixed(3) + ')');
  assert(oetf1(0.5) > 0.73, 'and linear 0.5 lands near 0.74, not 0.5 (' + oetf1(0.5).toFixed(3) + ')');
  // continuity across the piecewise join, or a gradient would show a seam
  const eps = 1e-6, j = 0.0031308;
  assert(Math.abs(oetf1(j - eps) - oetf1(j + eps)) < 1e-4, 'the piecewise join is continuous');
}

// ---------------------------------------------------------------- the lightmap is NOT double-scaled
// The audit that motivated this build claimed lightMapIntensity needed a x PI to match how
// WebGLLights scales real lights. It does not: r149 applies that factor itself on upload
// (`lightMapIntensity.value = material.lightMapIntensity * (physicallyCorrectLights !== true ? PI : 1)`).
// Multiplying here as well blew the bake out by 3.14x — visible as washed-out white sandstone, and
// caught only because the frame was captured and measured rather than reasoned about.
assert(/m\.lightMapIntensity = \+m\.userData\.rumpusLightmap \|\| 1;/.test(src),
  'the levelgen bake intensity is passed through unscaled');
assert(/r149 already does it on upload/.test(src), '...with the reason recorded, so it is not "fixed" again');

// ---------------------------------------------------------------- legacy levels keep their look
assert(/const DEFAULT_WORLD = \{ colorV:2,/.test(src), 'new levels are stamped with the corrected pipeline');
{
  const wf = extractFunction('_worldFrom');
  assert(wf, '_worldFrom exists');
  const fn = new Function('DEFAULT_WORLD', wf + '; return _worldFrom;')({ colorV: 2, sun: 1.1 });
  eq(fn(null).colorV, 2, 'a fresh level (no world block at all) is authored in the corrected pipeline');
  eq(fn({ sun: 2 }).colorV, 1, 'a saved level with no colorV is LEGACY — it must not inherit the default 2');
  eq(fn({ sun: 2, colorV: 2 }).colorV, 2, '...and one that carries colorV keeps it');
  eq(fn({ sun: 2 }).sun, 2, 'the rest of the world still merges over the defaults');
  eq(fn({}).sun, 1.1, 'and missing keys still fall back to the default');
}
assert(/renderer\.toneMappingExposure = worldCfg\.exposure \* \(\(\(worldCfg\.colorV\|0\) >= 2\) \? 1 : LEGACY_EXPOSURE\);/.test(src),
  'a legacy level is exposure-compensated, since it is now rendered brighter than its author ever saw');
{
  const m = src.match(/const LEGACY_EXPOSURE = ([0-9.]+);/);
  assert(m && +m[1] > 0.5 && +m[1] < 1, 'the compat knob darkens rather than brightens (' + (m && m[1]) + ')');
}

done('build 1115: the frame is finally sRGB-encoded — one transfer function, applied once, at the end');
