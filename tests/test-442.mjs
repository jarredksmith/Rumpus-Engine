import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 587: primitive props shipped with a hardcoded green-teal emissive (0x09231d @ .5) even with their emitter
// "off" — a faint green glow on everything. The emitter is off by default, so the off/default state must not emit.
assert(!/0x09231d/.test(src), 'the green emissive default is gone everywhere (regression guard)');
const pm = extractFunction('primitiveMat');
assert(/emissive:0x000000, emissiveIntensity:0/.test(pm), 'primitiveMat has no glow by default (emitter off = no emission)');
const cpe = extractFunction('clearPropEmissive') || '';
// the emitter-off cleanup clears BOTH textured and untextured props to black (previously untextured restored green)
assert(/if\(obj\.userData\.tex\)\{ o\.material\.emissive\.setHex\(0x000000\); o\.material\.emissiveIntensity = 0; \} else \{ o\.material\.emissive\.setHex\(0x000000\); o\.material\.emissiveIntensity = 0; \}/.test(src.replace(/\s+/g,' ')), 'turning the emitter off leaves no glow on either textured or untextured props');
// flash reset restores the real emissive (emitter color if set, else black) instead of the green default
const uf = extractFunction('updateFragments');
assert(/const _em=o\.userData\.emit/.test(uf) && /_em\.c/.test(uf) && /m\.material\.emissive\.setHex\(0x000000\)/.test(uf), 'post-hit flash decays back to the real emissive, not green');
// instanced primitive batches also default to no glow
assert(/color:parseInt\(colStr,10\), roughness:\.65, metalness:\.35, emissive:0x000000, emissiveIntensity:0/.test(src), 'instanced primitive batches have no green glow either');
done('primitive props no longer carry a default green emissive; emitter-off truly means no emission (build 587)');
