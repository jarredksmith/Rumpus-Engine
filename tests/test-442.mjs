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
// Instanced primitive batches also default to no glow. Build 1139 stopped rebuilding the batch material
// from scratch (which silently reset the authored roughness/metalness too) and clones a real member's
// instead — so the guarantee now rests on two things: the fallback material is black-emissive, and a
// prop that HAS an emitter is never batched in the first place.
const bi = extractFunction('buildInstancing');
assert(/const mat = src0 \? src0\.clone\(\) : new THREE\.MeshStandardMaterial\(\{ color:PRIM_DEFAULT_COLOR, roughness:PRIM_DEFAULT_ROUGH, metalness:PRIM_DEFAULT_METAL, envMapIntensity:_envInten\(PRIM_DEFAULT_METAL\) \}\);/.test(bi),
  'the batch material is a clone of a real prop, or a plain default with no emissive at all');
assert(!/emissive:0x[1-9a-f]/i.test(bi), 'and nothing in the batch path introduces an emissive colour');
assert(/!o\.userData\.emit/.test(extractFunction('instanceEligible')),
  'a prop with an emitter is excluded from batching, so a glow can never reach a batch by way of the clone');
done('primitive props no longer carry a default green emissive; emitter-off truly means no emission (build 587)');
