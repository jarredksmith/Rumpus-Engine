// build 1203: the collider grid derives OFF-THREAD — the other half of the perf critic's #5.
//
// buildModelGridBoxes measured 110-137 ms on the main thread for a level-sized GLB (build 1148's own
// numbers): a guaranteed hitch on every big import, including MID-SESSION ones (co-op level sync, the
// local: drop path). The derivation is now split: _mgridGatherTris walks the scene (the only part that
// needs it), _mgridCore is a PURE function of a flat triangle array, and the worker runs _mgridCore's own
// toString() from a Blob — one implementation, so the algorithm tests (1092/1113/1148/1159) keep guarding
// the exact code the worker executes. Triangles go over by TRANSFER, boxes come back by transfer, and
// while the answer is in flight the prop keeps per-mesh AABBs — the pre-grid, fail-SOLID behaviour.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- THE worker premise: the core is PURE
// The worker gets nothing but _mgridCore's source. If the function references any engine global — THREE,
// MGRID_*, IS_COARSE, a scratch vector — it works on the main thread and silently produces garbage (or
// throws) in the worker. Executing it in a bare scope is the direct proof.
const coreSrc = extractFunction('_mgridCore');
const bare = new Function('"use strict";' + coreSrc + '\nreturn _mgridCore;')();
const OPTS = { cell: 1.0, slot: 0.35, bits: 48 << 20, footBytes: 24 << 20, minThick: 0.25 };
const wallTris = (() => {
  // a 6x3 wall, 0.45 thick, with a 1.6m doorway from x=2.2 to x=3.8 (lintel above 2.2) — 1148's repro shape
  const t = [];
  const quad = (x0, y0, x1, y1, z) => { t.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z); };
  for (const z of [0, 0.45]) {
    quad(0, 0, 2.2, 3, z);            // left of the door
    quad(3.8, 0, 6, 3, z);            // right of the door
    quad(2.2, 2.2, 3.8, 3, z);        // the lintel
  }
  return new Float32Array(t);
})();
const N_TRIS = wallTris.length / 9;
const r = bare(wallTris, N_TRIS, [0, 0, 0], [6, 3, 0.45], OPTS);
assert(r && r.n > 0, 'the core runs in an EMPTY scope — no engine global leaks into the worker source');
assert(r.boxes instanceof Float32Array && r.boxes.length === r.n * 6, '...returning a flat transferable array, 6 floats per box');
{
  // the doorway is open and the wall is solid — the 1148 semantics survive the split, in the bare scope
  const solidAt = (x, y) => { for (let i = 0; i < r.n; i++) { const o = i * 6;
    if (x >= r.boxes[o] && x <= r.boxes[o + 3] && y >= r.boxes[o + 1] && y <= r.boxes[o + 4]) return true; } return false; };
  assert(solidAt(1.0, 1.0), 'the wall left of the door is solid');
  assert(solidAt(5.0, 1.0), '...and right of it');
  assert(!solidAt(3.0, 1.0), 'the DOORWAY is open at body height');
  assert(solidAt(3.0, 2.7), '...and the lintel above it is solid');
}
{
  // determinism: same input, same scope-free function, byte-identical output — the property that makes
  // "worker or main thread" an implementation detail rather than a behaviour
  const r2 = bare(wallTris.slice(), N_TRIS, [0, 0, 0], [6, 3, 0.45], OPTS);
  eq(r2.n, r.n, 'same box count');
  let same = true; for (let i = 0; i < r.boxes.length; i++) if (r.boxes[i] !== r2.boxes[i]) { same = false; break; }
  assert(same, 'byte-identical boxes');
}

// ---------------------------------------------------------------- the composition and the async path
{
  assert(/const g=_mgridGatherTris\(obj\);\n  if\(g\.over \|\| !g\.n\) return null;/.test(src),
    'buildModelGridBoxes composes gather -> core with the exact pre-1203 fallbacks (over-cap and empty both return null)');
  assert(/if\(total>2000000\) return \{ tri:null, n:0, over:true \};/.test(src),
    'the 2M triangle cap survives in the gather');
  const rp = extractFunction('refreshPropCollider');
  assert(/const tok=\(obj\.userData\._mgridTok=\(obj\.userData\._mgridTok\|0\)\+1\);/.test(rp),
    'every re-derivation bumps a token — an in-flight answer for the OLD transform can never land');
  assert(/obj\.userData\._mgridTok!==tok\) return;/.test(rp), '...checked at delivery');
  assert(/const w=\(g\.n>MGRID_SYNC_TRIS\) \? _mgridEnsureWorker\(\) : null;/.test(rp),
    'small models stay synchronous — their derivation is cheaper than the round trip');
  assert(/w\.postMessage\(\{ id, tri:g\.tri, n:g\.n, bmin, bmax, opts \}, \[g\.tri\.buffer\]\)/.test(rp),
    'the triangles go over by TRANSFER, not copy');
  assert(/postMessage\(\{id:d\.id,boxes:r\.boxes,n:r\.n\},\[r\.boxes\.buffer\]\)/.test(src),
    '...and the boxes come back by transfer');
  assert(/'"use strict";const _mgridCore='\+_mgridCore\.toString\(\)\+/.test(src),
    'the worker source IS the main-thread function — one implementation, no drift for the algorithm tests to miss');
  assert(/_cgDirty\(\)/.test(rp) && /_navDirtyProp\(obj\)/.test(rp),
    'a landed grid re-teaches the spatial grid (1188) and the nav grid (1200)');
  assert(/_mgridWorkerDead=true;[\s\S]{0,200}for\(const id in jobs\)\{ try\{ jobs\[id\]\(null\); \}catch\(e\)\{\} \}/.test(src),
    'a dead worker fails every pending job to null (per-mesh boxes STAND — fail solid) and future derivations go synchronous');
  const g2 = /catch\(e\)\{ delete _mgridJobs\[id\]; const g2=_mgridGatherTris\(obj\);/.test(src);
  assert(g2, 'a failed postMessage re-gathers before the sync fallback — the transfer may already have consumed the buffer');
}

done('build 1203: the collider grid derives off-thread — the pure core executed in an EMPTY scope on 1148\'s doorway repro (door open, wall solid, lintel solid, deterministic, flat transferable output), the worker shipping the core\'s own toString() so one implementation serves both threads, transfer both ways, token-guarded delivery, per-mesh fail-solid interim, and dead-worker degradation to the synchronous path');
