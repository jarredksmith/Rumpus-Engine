// (build 920) HEAVY-CHARACTER SAFETY NET — the user's new player model (p1_small.glb: 92.6k tris,
// meshopt+KTX2) started actually LOADING in build 918, and bots wear the player model, so a bot match
// went from N capsules to N x 92k skinned triangles: 60fps -> 9. A/B probes confirmed builds 918/919
// render frame-identically — the cost was the model, multiplied by bots.
// Fix: character/enemy models over CHAR_TRI_HEAVY are decimated toward CHAR_TRI_BUDGET with the meshopt
// simplifier (lazy CDN wasm). Index-only: vertices/skin weights/UVs untouched, so skinned animation is
// safe; spawned copies share the template geometry so one pass fixes every bot at once.
// Verified live with the real model: 92,602 -> 17,278 tris, second avatar shared the decimated
// geometry, bones still animate, bounds finite. Also hardened: a texture whose ONLY source is a
// skipped extension (KTX2 with no transcoder) now drops the map instead of crashing to a capsule.
import { gameSource, html, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// budget + lazy simplifier
assert(/let CHAR_TRI_HEAVY = 60000/.test(src) && /let CHAR_TRI_BUDGET = 40000/.test(src), 'triangle budget constants');
const ens = extractFunction('_ensureSimplifier', src);
assert(/meshopt_simplifier\.module\.js/.test(ens) && /jsdelivr/.test(ens) && /unpkg/.test(ens), 'simplifier from two CDNs');
assert(/if\(_simpPromise\) return _simpPromise/.test(ens), 'fetched at most once');

// the decimation pass: index-only, interleaved-safe, per-gltf idempotent, both budget gates
const auto = extractFunction('_autoSimplifyChar', src);
assert(/gltf\.userData\._simplified!=null\) return/.test(auto), 'idempotent per model (concurrent builds cannot double-run)');
assert(/tris <= CHAR_TRI_HEAVY/.test(auto) && /CHAR_TRI_BUDGET \/ tris/.test(auto), 'only heavy models pay, targeted at the budget');
assert(/pa\.getX\(i\)/.test(auto), 'positions copied via the attribute API (handles gltfpack-interleaved buffers)');
assert(/S\.simplify\(idx32, P, 3, target/.test(auto), 'meshopt index-only simplification (skin weights untouched)');
assert(/n<=65535 \? new Uint16Array\(out\) : new Uint32Array\(out\)/.test(auto), 'index width chosen by vertex count');
assert(/computeBoundingSphere/.test(auto), 'bounds recomputed after decimation');
assert(/Optimized heavy character model/.test(auto) && /is heavy \(/.test(auto), 'the author is told either way (optimized, or heavy with no simplifier)');

// both character build paths call it (player avatar + enemy models — the multiplied cases)
const calls = (src.match(/_autoSimplifyChar\(gltf, \(mc\.url\|\|''\)\.split\('\/'\)\.pop\(\)\)/g)||[]).length;
assert(calls===2, 'player avatar AND enemy builder both guard (got '+calls+')');

// the hardened texture fallback: skipped-extension-only textures drop the map instead of crashing
assert(/if \( sourceDef === undefined \) return Promise\.resolve\( null \);/.test(html),
  'a texture with no fallback source resolves null (assignTexture already tolerates it) instead of throwing to a capsule');

done('build 920: heavy character imports are decimated automatically — bots wear the player model, so one 92k import was costing N x 92k');
