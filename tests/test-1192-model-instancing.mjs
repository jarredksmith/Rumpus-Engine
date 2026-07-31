// build 1192: imported models instance — fifty trees stop being fifty draw hierarchies.
//
// Primitives have batched since long before 1139; every imported GLB copy still walked its whole subtree
// per frame. Eligible model props (decoration-grade ONLY — nothing the game must touch individually at
// runtime) now collapse into one InstancedMesh per (geometry, material) part of the group's first member.
// The matrix algebra this rides on — instanceWorld = memberWorld x (templateWorld^-1 x partWorld) — is
// executed here against the REAL three build, because a transposed multiply order produces plausible
// frames that are subtly wrong only for rotated members.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

// ---------------------------------------------------------------- the matrix algebra, real three
{
  const tpl = new THREE.Group(); tpl.position.set(3, 1, -2); tpl.rotation.y = 0.7; tpl.scale.setScalar(2);
  const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  part.position.set(0.5, 1.2, 0); part.rotation.z = 0.3; tpl.add(part);
  tpl.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
  const rel = new THREE.Matrix4().copy(inv).multiply(part.matrixWorld);          // the engine's exact rel
  // a second member somewhere else, rotated and scaled differently
  const member = new THREE.Group(); member.position.set(-8, 0, 14); member.rotation.y = -1.1; member.scale.setScalar(0.6);
  const mPart = new THREE.Mesh(part.geometry, part.material);
  mPart.position.copy(part.position); mPart.rotation.copy(part.rotation); member.add(mPart);
  member.updateMatrixWorld(true);
  const got = new THREE.Matrix4().copy(member.matrixWorld).multiply(rel);        // the engine's exact instance matrix
  const want = mPart.matrixWorld;
  for (let i = 0; i < 16; i++) near(got.elements[i], want.elements[i], 1e-10,
    'instanceWorld element ' + i + ' equals the real part world matrix — per-member position/rotation/scale all ride the root');
}
{ // the culling fact the design relies on
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2);
  eq(im.frustumCulled, false, 'r149 InstancedMesh ships frustumCulled=false — a batch spread across the map is never wrongly culled, with no engine code needed');
}

// ---------------------------------------------------------------- eligibility, executed
{
  const el = new Function('isModelSrc', extractFunction('modelInstanceEligible') + '\nreturn modelInstanceEligible;')(
    (s) => typeof s === 'string' && s.indexOf(':') > 0);
  const mk = (u) => ({ userData: Object.assign({ src: 'https://x/tree.glb'.replace('https', 'h') + '' }, u) });
  const base = () => ({ userData: { src: 'sketchfab:abc' } });
  eq(el(base()), true, 'a plain decoration model is eligible');
  for (const [k, v, why] of [
    ['phys', { body: {} }, 'physics props move'], ['vehicle', {}, 'vehicles move'],
    ['xa', { on: true }, 'a running animation moves'], ['tag', 'door', 'the prop verbs address tags'],
    ['interact', true, 'interact needs a raycastable mesh'], ['dialogue', ['hi'], 'dialogue too'],
    ['npcName', 'Bob', 'NPCs too'], ['signals', [{ when: 'shot' }], 'signals need hits to land'],
    ['lockId', 'k1', 'locked props are interactables'], ['modelLights', [{}], 'an adopted lamp must keep its light'],
  ]) { const o = base(); o.userData[k] = v; eq(el(o), false, k + ' disqualifies — ' + why); }
  eq(el({ userData: { src: 'box' } }), false, 'primitives go through their own (older) path');
}

// ---------------------------------------------------------------- the wiring
{
  const bi = extractFunction('buildInstancing');
  assert(/if\(list\.length < 3\) continue;/.test(bi), 'a model batch needs three copies (one draw PER PART, unlike a primitive\'s one)');
  assert(/if\(n\.isSkinnedMesh \|\| n\.isLight\)\{ bad = true; return; \}/.test(bi),
    'a skinned or lit subtree disqualifies the whole group at batch time');
  assert(/parts\.length > 24\) continue;/.test(bi), 'a many-part model is not a batching win and stays individual');
  assert(/new THREE\.Matrix4\(\)\.copy\(inv\)\.multiply\(n\.matrixWorld\)/.test(bi) &&
    /_m\.copy\(o\.matrixWorld\)\.multiply\(part\.rel\)/.test(bi),
    'the multiply order matches the algebra executed above');
  assert(/im\.userData\._sharedMat = true;/.test(bi), 'model batches are flagged as sharing the template\'s live materials...');
  assert(/if\(!im\.userData\._sharedMat && im\.geometry && im\.material && im\.material\.dispose\) im\.material\.dispose\(\);/.test(src),
    '...so teardown does NOT dispose them — the template goes back to the editor with its materials alive');
  assert(/for\(const o of list\)\{ scene\.remove\(o\); instancedProps\.push\(o\); \}/.test(bi),
    'members leave the scene through the SAME list the primitive path uses — one teardown restores both');
  assert(/im\.castShadow = part\.cast; im\.receiveShadow = part\.recv;/.test(bi),
    'per-part shadow flags survive (nocollide grass stopped receiving shadows in 1096 — the batch must not undo that)');
}

done('build 1192: imported models instance — decoration-grade groups collapse to one InstancedMesh per part with matrices proven against real three for rotated/scaled members, skinned/lit/many-part models excluded at batch time, ten runtime-touchable conditions excluded by predicate (each executed), shared-material teardown safe, and r149\'s frustumCulled=false fact pinned');
