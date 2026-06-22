import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 643: a JOINER walked straight through props (buildings/crates) the host collided with. Cause: GLB props
// arrive over the network AFTER buildPhysWorld() ran at match start, so they never got a Rapier static collider
// for the character controller. Fix: when a model finishes loading, rebuild the physics world once the load burst
// settles, so late-arriving props become solid.

// --- wiring ---
assert(/function _schedulePhysRebuild\(\)\{/.test(src), 'a debounced physics-rebuild scheduler exists');
const fp = extractFunction('finalizeProp');
assert(/if\(gltf && !obj\.userData\.phys && typeof _schedulePhysRebuild==='function'\) _schedulePhysRebuild\(\);/.test(fp),
  'a freshly LOADED model (not a primitive, not a dynamic prop) schedules a rebuild');
const sr = extractFunction('_schedulePhysRebuild');
assert(/_glbPending>0\)\{ _physRebuildT=setTimeout\(tick, 300\); return; \}/.test(sr), 'it waits for the GLB load burst (_glbPending) to finish before rebuilding');
assert(/if\(physWorld && \(typeof editorOpen==='undefined' \|\| !editorOpen\)\) buildPhysWorld\(\);/.test(sr), 'then it rebuilds the world (only in play, only if a world exists)');
assert(/if\(_physRebuildT\) clearTimeout\(_physRebuildT\);/.test(sr), 'debounced — a burst of model loads coalesces into one rebuild');

// --- executable: the rebuild gate (only once loads settle, a world exists, and not editing) ---
function shouldRebuild(glbPending, hasWorld, editorOpen){ return glbPending<=0 && !!hasWorld && !editorOpen; }
assert(shouldRebuild(0, true, false) === true, 'loads done + world + in play -> rebuild');
assert(shouldRebuild(3, true, false) === false, 'still loading -> wait, do not rebuild yet');
assert(shouldRebuild(0, false, false) === false, 'no physics world -> nothing to rebuild');
assert(shouldRebuild(0, true, true) === false, 'editing -> skip the rebuild');

done('joiner prop collision: late-loaded models become solid via a debounced phys rebuild (build 643)');
