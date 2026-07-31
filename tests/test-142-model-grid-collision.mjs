import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
assert(/function buildModelGridBoxes\(obj, overall\)/.test(src), 'grid-box builder exists');
assert(/function isModelSrc\(src\)/.test(src) && /sketchfab:/.test(src), 'isModelSrc classifies imported models');
assert(/if\(isModelSrc\(obj\.userData\.src\)\)\{/.test(extractFunction('refreshPropCollider')) && /_mgridCore\(g\.tri, g\.n, bmin, bmax, opts\)/.test(src), 'refreshPropCollider derives grid boxes for imported models (split into gather+core, workered for big models, in 1203)');
// vertical run-splitting: a column emits one box per contiguous solid run (archway opening stays open between threshold + crown)
// build 1089: occupancy is a BITSET (8x the resolution for the same memory) and the resolution is chosen
// from the model's real size rather than capped at 64x64x48. The run-splitting is unchanged in meaning.
assert(/const occ=new Uint32Array\(\(\(N\*K\)\+31\)>>5\)/.test(src), 'per-column vertical occupancy slots');
// build 1148: a run also ends where its FOOTPRINT changes, not only where the occupancy does — a wall
// column's base slot holds the floor slab as well as the wall, and a footprint unioned over the whole run
// inherits the slab's full cell, which is why build 1123's per-column attempt opened no doorway.
assert(/let run=sl\+1;\s*\n\s*while\(run<K && getSlot\(base\+run\)\)\{/.test(src),
  'emits one box per contiguous vertical run');
assert(/if\(fn\[0\]!==f0\[0\] \|\| fn\[1\]!==f0\[1\] \|\| fn\[2\]!==f0\[2\] \|\| fn\[3\]!==f0\[3\]\) break;/.test(src),
  '...and splits it again wherever the footprint changes');
done('model-grid-collision');
