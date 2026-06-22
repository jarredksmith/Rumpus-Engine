import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 591: attachments can use a custom GLB model (per attachment id) instead of the procedural mesh,
// loaded via the same cache as guns, auto-normalized, and placed with the per-weapon mount transform.

// the pure transform now also carries rotation (degrees)
const xf = new Function('return ('+extractFunction('_attMountTransform')+')')();
const t = xf({x:0,y:0,z:-1}, { x:0, y:0.1, z:0.3, rx:90, ry:0, rz:45, s:1.2 });
near(t.z, -0.7, 1e-9, 'position still sums muzzle + offset');
eq(t.rx, 90, 'rotation x passes through'); eq(t.rz, 45, 'rotation z passes through'); eq(t.s, 1.2, 'scale passes through');
eq(xf({x:0,y:0,z:0},{}).rx, 0, 'missing rotation defaults to 0');

// _applyMountTo applies position + rotation(deg->rad) + multiplies scale (so a normalized GLB keeps its fit)
const ap = extractFunction('_applyMountTo');
assert(/obj\.position\.set\(t\.x, t\.y, t\.z\)/.test(ap) && /obj\.rotation\.set\(\(t\.rx\|\|0\)\*RAD/.test(ap) && /obj\.scale\.multiplyScalar\(t\.s\|\|1\)/.test(ap), 'applies pos, rotation in radians, and multiplies scale');

// rebuild: custom url -> cached GLB load, normalized, token-guarded, with a procedural fallback
const rb = extractFunction('rebuildAttMounts');
assert(/const url=\(attModels && attModels\[id\]\) \? attModels\[id\] : ''/.test(rb), 'looks up a custom model url per attachment');
assert(/if\(url && typeof loadGLTFCached==='function'\)\{/.test(rb) && /loadGLTFCached\(url,/.test(rb), 'loads the GLB through the shared cache');
assert(/if\(myToken!==_attMountToken\) return/.test(rb), 'a newer rebuild discards stale async arrivals (no duplicate meshes)');
assert(/m\.scale\.setScalar\(0\.18\/maxd\)/.test(rb), 'arbitrary model units are normalized to a sane base size');
assert(/const pm=_buildAttMesh\(id\); if\(pm\)\{ _applyMountTo\(pm,t\); _attMountGroup\.add\(pm\); \}/.test(rb), 'load failure falls back to the procedural mesh');
assert(/const mesh=_buildAttMesh\(id\); if\(!mesh\) continue; _applyMountTo\(mesh, t\)/.test(rb), 'no url -> procedural mesh as before');

// state + persistence + UI
assert(/let attModels = \{\}/.test(src) && /savedLevel\.attModels/.test(src), 'attModels restored on load');
assert(/attModels:/.test(extractFunction('serializeLevel')), 'attModels saved with the level');
const ra = extractFunction('renderAttachAuthoring');
assert(/setb\.onclick=\(\)=>\{ const u=inp\.value\.trim\(\); if\(u\) attModels\[id\]=u; else delete attModels\[id\]/.test(ra), 'editor Weapons tab has the model URL field (Set stores / clears)');


done('custom attachment GLB models: per-id url, cached + normalized load, rotation-aware mount, procedural fallback (build 591)');
