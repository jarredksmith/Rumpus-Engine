// (build 174) Mobile render quality: antialiasing is on everywhere (was off on touch -> jagged edges) and the
// touch pixel-ratio cap is raised from 1.0x to 2.0x (was rendering far below a phone's native res -> low-res look).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
assert(/new THREE\.WebGLRenderer\(\{ antialias: true, powerPreference: 'high-performance' \}\)/.test(src), 'antialiasing enabled on all devices');
// build 1350: this quoted _applyPixelRatio's whole body, which gained the shadow-rung sync. The
// assertion — the touch cap, and that this function applies it — is unchanged.
{ const pb = /const _prBase = Math\.min\(devicePixelRatio, IS_COARSE \? 2\.0 : 1\.5\);/.test(src);
  const ap = extractFunction('_applyPixelRatio', src);
  assert(pb && /renderer\.setPixelRatio\(_prBase \* _prScale\)/.test(ap), 'touch pixel ratio raised to 2.0x'); }
done('mobile resolution + AA');
