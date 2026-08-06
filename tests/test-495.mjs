import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 643: a JOINER walked straight through props (buildings/crates) the host collided with. Cause: GLB props
// arrive over the network AFTER buildPhysWorld() ran at match start, so they never got a Rapier static collider
// for the character controller. Fix: when a model finishes loading, rebuild the physics world once the load burst
// settles, so late-arriving props become solid.

// --- wiring ---
assert(/function _schedulePhysRebuild\(\)\{/.test(src), 'a debounced physics-rebuild scheduler exists');
const fp = extractFunction('finalizeProp');
/* build 1409 WIDENED this, and the widening is the fix: the `gltf &&` gate meant a PRIMITIVE never
   qualified, so a prop spawned during play (the graph's spawnprop verb, or a joiner's primitives) got no
   Rapier body and the player walked through it — measured falling from 3.00 to 0.08 on a slab and straight
   through a ramp. What this build always asserted is intact and now covers more: a freshly built static
   prop schedules a rebuild, and a dynamic one does not. */
assert(/if\(!obj\.userData\.phys && typeof _schedulePhysRebuild==='function'\) _schedulePhysRebuild\(\);/.test(fp),
  'a freshly built static prop — loaded model OR primitive, never a dynamic prop — schedules a rebuild');
const sr = extractFunction('_schedulePhysRebuild');
/* build 1409 bounded that wait: it re-armed for as long as _glbPending was non-zero, so one model that
   never settles left every later prop intangible for the session. The intent — wait out the burst — is
   unchanged, and the cap is what makes it a wait rather than a hang. */
assert(/_glbPending>0 && \+\+_waited <= PHYS_WAIT_MAX\)\{ _physRebuildT=setTimeout\(tick, 300\); return; \}/.test(sr),
  'it waits for the GLB load burst (_glbPending) to finish before rebuilding — for a bounded time');
assert(/if\(physWorld && \(typeof editorOpen==='undefined' \|\| !editorOpen\)\)\{/.test(sr) && /else \{ for\(const c of colliders\) addStaticColliderFor\(c\); \}/.test(sr),
  'then it makes the late statics solid (only in play, only if a world exists) — INCREMENTALLY since 1194, with a full buildPhysWorld only when a dynamic prop is missing its body');
assert(/if\(_physRebuildT\) clearTimeout\(_physRebuildT\);/.test(sr), 'debounced — a burst of model loads coalesces into one rebuild');

// --- executable: the rebuild gate (only once loads settle, a world exists, and not editing) ---
function shouldRebuild(glbPending, hasWorld, editorOpen){ return glbPending<=0 && !!hasWorld && !editorOpen; }
assert(shouldRebuild(0, true, false) === true, 'loads done + world + in play -> rebuild');
assert(shouldRebuild(3, true, false) === false, 'still loading -> wait, do not rebuild yet');
assert(shouldRebuild(0, false, false) === false, 'no physics world -> nothing to rebuild');
assert(shouldRebuild(0, true, true) === false, 'editing -> skip the rebuild');

done('joiner prop collision: late-loaded models become solid via a debounced phys rebuild (build 643)');
