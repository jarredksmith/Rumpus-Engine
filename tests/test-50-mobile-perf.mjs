// (build 71) Mobile performance guards: a single IS_COARSE flag turns off the expensive paths on touch
// devices (MSAA, full-DPI supersampling, big soft shadows, and the DoF post-process).
import { gameSource, extractConst, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
assert(/const IS_COARSE = !!\(window\.matchMedia && matchMedia\('\(pointer: coarse\)'\)\.matches\)/.test(src), 'coarse-pointer flag exists');
assert(/new THREE\.WebGLRenderer\(\{ antialias: true, powerPreference: 'high-performance' \}\)/.test(src), 'antialiasing on (smooth edges on touch too)');
// build 1350: this quoted _applyPixelRatio's whole body, which gained the shadow-rung sync. The
// assertion — the touch cap, and that this function applies it — is unchanged.
{ const pb = /const _prBase = Math\.min\(devicePixelRatio, IS_COARSE \? 2\.0 : 1\.5\);/.test(src);
  const ap = extractFunction('_applyPixelRatio', src);
  assert(pb && /renderer\.setPixelRatio\(_prBase \* _prScale\)/.test(ap), 'touch pixel ratio capped at 2x (near-native, not 1x)'); }
assert(/shadowMap\.type = IS_COARSE \? THREE\.PCFShadowMap : THREE\.PCFSoftShadowMap/.test(src), 'cheaper shadow filter on touch');
// build 1346: this quoted the literal pair. Desktop went to 4096 (half the texel halves the corner leak,
// measured), and phones are deliberately untouched at 1024 — so the assertion's intent, that touch gets a
// materially smaller shadow map, is stronger than before. It asserts the RELATION now.
{ const c = extractConst('SUN_SHADOW_PX');
  const m = c.match(/IS_COARSE\s*\?\s*(\d+)\s*:\s*(\d+)/);
  assert(m, 'the sun shadow map size is chosen by device class');
  assert(+m[1] === 1024, 'touch keeps the 1024 map it was tuned with');
  assert(+m[1] <= +m[2] / 2, 'half-size shadow map on touch (or smaller)');
  assert(/moon\.shadow\.mapSize\.set\(SUN_SHADOW_PX, SUN_SHADOW_PX\)/.test(src), '...and it is applied'); }
assert(/dofEnabled  = \(worldCfg\.dof === true\) && !IS_COARSE/.test(src), 'depth-of-field forced off on touch');
done('mobile performance guards');
