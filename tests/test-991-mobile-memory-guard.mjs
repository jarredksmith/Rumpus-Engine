// (build 991) MOBILE MEMORY GUARD — the engine-side half of the phone-crash fix (build 990's audit
// is the creator-facing half). Phones die on a transient spike: every model's textures decode at
// FULL size before the 1024 cap shrinks them, and the loader ran THREE models concurrently — three
// heavy models' 4K textures decoded at once is a several-hundred-MB spike a mobile tab can't take.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// (1) one model in flight on phones (editor already did this; phones now too)
assert(/const cap=\(typeof editorOpen!=='undefined' && editorOpen\) \? 1 : \(\(typeof IS_COARSE!=='undefined' && IS_COARSE\) \? 1 : GLB_MAX_CONCURRENT\);/.test(src),
  'GLB loads run one at a time on coarse-pointer devices (decode spikes are serialized)');
assert(/const _glbQueue = \[\]; let _glbActive = 0; const GLB_MAX_CONCURRENT = 3;/.test(src),
  'desktop keeps the 3-wide pipeline');

// (2) warm-cache budget halved on phones
assert(/matchMedia\('\(pointer: coarse\)'\)\.matches\) \? 96 : 640;/.test(src),
  'zero-ref master budget is 96 MB on phones (was 192), 640 on desktop');

// (3) level switches purge the previous level's zero-ref masters on phones — BOTH load sites
{
  const purge = "if(typeof IS_COARSE!=='undefined' && IS_COARSE && typeof freeUnusedModels==='function'){ try{ freeUnusedModels(); }catch(e){} }";
  eq(src.split(purge).length - 1, 2, 'the purge runs at both level-load sites (restoreLevel + loadLevelFromNet)');
  // and it sits right after the old props are removed, before anything new loads
  const after = "propModels.length = 0;";
  let i = -1, ok = 0;
  while ((i = src.indexOf(after, i + 1)) >= 0) { if (src.slice(i, i + 500).indexOf(purge) >= 0) ok++; }
  eq(ok, 2, 'both purges run after the old props release their refs, before the new level loads');
}

// the mechanism it leans on still holds: refs guard live models, eviction disposes GPU resources
assert(/function freeUnusedModels\(\)\{ let n=0, b=0; for\(const u of Object\.keys\(gltfCache\)\)\{ if\(\(_modelRefs\[u\]\|\|0\)<=0\)\{/.test(src),
  'freeUnusedModels only ever touches zero-ref masters (live scene models are safe)');
assert(/function _evictModel\(u\)\{ try\{ _disposeGLTF\(gltfCache\[u\]\); \}catch\(e\)\{\}/.test(src),
  'eviction disposes geometry/materials/textures (frees GPU memory, not just JS refs)');

done('build 991: mobile memory guard — serialized decode, halved warm budget, level-switch purge');
