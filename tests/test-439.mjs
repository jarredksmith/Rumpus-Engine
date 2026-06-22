import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 584: the hemisphere "sky" fill light had a hardcoded teal color (0x4a6c7a, green-dominant) that tinted
// everything and could only be dimmed, not recolored. Its color is now an adjustable worldCfg value.
assert(/skyColor:0x4a6c7a/.test(src), 'DEFAULT_WORLD keeps the original sky color (no look change for existing levels)');
const aw = extractFunction('applyWorldCfg');
assert(/skyLight\.color\.setHex/.test(aw) && /worldCfg\.skyColor==null\?DEFAULT_WORLD\.skyColor:worldCfg\.skyColor/.test(aw), 'applyWorldCfg drives the sky-light color from worldCfg (default-safe)');
assert(/skyLight\.intensity = worldCfg\.sky/.test(aw), 'intensity still driven too');
assert(/colorRow\(b,'Sky light color','skyColor'\)/.test(src), 'editor lighting section exposes the sky-light color');
done('sky-light color is adjustable — removes the hardcoded green/teal cast (build 584)');
