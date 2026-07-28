import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 642: rigged/skinned GLB props were frustum-culled by the MAIN camera (they vanished) while their shadow
// still rendered from the sun's wider frustum — "shadows on the ground but no props" when hosting. SkinnedMeshes
// compute their bounding sphere from the rest pose, so three.js culls them at angles where they're actually
// on-screen. Fix: disable frustum culling on skinned prop meshes (static props keep culling — their bounds are ok).

// --- wiring ---
const fp = extractFunction('finalizeProp');
// (build 1095 appended anisotropy/lightmap polish after the culling line — the pin anchors the decision itself)
assert(/if\(o\.isMesh\)\{ o\.castShadow = true; o\.receiveShadow = true; if\(o\.isSkinnedMesh\) o\.frustumCulled = false;/.test(fp),
  'finalizeProp disables frustum culling on skinned meshes (keeps shadow + receive)');

// --- executable: the per-mesh traverse decision (skinned -> no cull; static -> untouched) ---
function decorate(o){ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; if(o.isSkinnedMesh) o.frustumCulled = false; } return o; }
const skinned = decorate({ isMesh:true, isSkinnedMesh:true, frustumCulled:true });
eq(skinned.frustumCulled, false, 'a rigged/skinned prop mesh stops being frustum-culled (no more vanishing)');
eq(skinned.castShadow, true, 'it still casts a shadow');
const staticMesh = decorate({ isMesh:true, isSkinnedMesh:false, frustumCulled:true });
eq(staticMesh.frustumCulled, true, 'a static prop mesh keeps frustum culling (its bounds are correct -> perf)');
eq(staticMesh.receiveShadow, true, 'static props still receive shadows');
const group = decorate({ isMesh:false });
assert(group.frustumCulled === undefined, 'non-mesh nodes are left alone');

done('rigged props no longer vanish (frustum-culled) while their shadow shows (build 642)');
