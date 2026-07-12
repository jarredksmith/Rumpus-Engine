// (build 946) MODEL MEMORY ACTUALLY FREES. Deleted props' models stayed warm in gltfCache by design
// (instant re-add), but eviction only fired past a COUNT of 24 — size-blind, so a few Sketchfab
// monsters could pin hundreds of MB of GPU memory while unused. Now every cached model carries a
// byte estimate (geometry buffers + RGBA texture area incl. mips); deleting the LAST instance of a
// model bigger than 24 MB frees it after a 3s grace (small ones stay warm; undo/re-add inside the
// grace is instant); the cache enforces a total BYTE budget (192 MB mobile / 640 MB desktop) beside
// the count cap; and the "Model texture cap" control shows a live readout with a Free-unused button.
// Freed models re-download on next use — Sketchfab archives come back from the on-disk IndexedDB
// cache, direct URLs from the HTTP cache.
// Verified live: a spawned model prop cached with a real byte estimate and counted "used"; deleting
// it flipped it to "unused" and freeUnusedModels() removed it from the cache; re-loading it, faking
// 200 MB and releasing the last ref auto-evicted it after the grace; the readout + button rendered.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the stats + free helpers — run them against stub state
const glue = extractFunction('_modelMemStats', src) + '\n' + extractFunction('freeUnusedModels', src) + '\n' + extractFunction('_evictModel', src);
const run = new Function('gltfCache','_modelRefs','_modelBytes','_modelUsedAt','_disposeGLTF',
  glue + "\nconst st=_modelMemStats(); const r=freeUnusedModels(); return { st, r, left:Object.keys(gltfCache) };");
const disposed=[];
const out = run(
  { a:{}, b:{}, c:{} },            // three cached models
  { a:2, b:0, c:0 },               // a in use, b+c unused
  { a:10, b:20, c:30 },
  { a:1, b:2, c:3 },
  (g)=>disposed.push(g)
);
assert(out.st.n===3 && out.st.used===1 && out.st.free===2 && out.st.freeBytes===50, 'stats split used vs unused with byte totals');
assert(out.r.n===2 && out.r.bytes===50, 'freeUnusedModels frees exactly the zero-ref entries');
assert(out.left.length===1 && out.left[0]==='a', 'in-use models survive');
assert(disposed.length===2, 'evicted masters are disposed (GPU memory released)');

// eager big-model eviction on last release
const rel = extractFunction('_modelRelease', src);
assert(/if\(_modelRefs\[url\]===0 && \(_modelBytes\[url\]\|\|0\) > _EVICT_NOW_MB\*1048576\)/.test(rel),
  'deleting the last instance of a BIG model schedules an eviction');
assert(/setTimeout\(\(\)=>\{ if\(gltfCache\[url\] && \(_modelRefs\[url\]\|\|0\)===0\) _evictModel\(url\); \}, 3000\);/.test(rel),
  'after a 3s grace, and only if still unused (undo/re-add stays instant)');

// the cap is bytes-aware
const cap = extractFunction('_enforceModelCacheCap', src);
assert(/overBytes=total-_MODEL_BUDGET_MB\*1048576/.test(cap) && /overBytes-=\(_modelBytes\[u\]\|\|0\); overCount--; _evictModel\(u\);/.test(cap),
  'eviction now honors a total byte budget alongside the count cap');
assert(/const _MODEL_BUDGET_MB = \(typeof matchMedia==='function' && matchMedia\('\(pointer: coarse\)'\)\.matches\) \? 192 : 640;/.test(src),
  'budget: 192 MB on touch devices, 640 MB on desktop');

// estimate recorded at cache time; UI present
assert(/_modelBytes\[url\]=_estimateGLTFBytes\(g\);/.test(src), 'every cached model records its estimate');
assert(/Models in memory: /.test(src) && /mb\.textContent='Free unused';/.test(src),
  'the texture-cap control shows the readout and the Free-unused button');

done('build 946: deleted models leave memory — size-aware eviction, byte budget, and a Free-unused button');
