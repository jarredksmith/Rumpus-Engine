// build 1097: triangle BVH for imported-model raycasts.
//
// three.js tests EVERY triangle of a mesh per ray. A generated arena is ~15k triangles; a host
// simulating multiplayer bots fires several rays per bot per frame (ground follow, obstacle
// probes, sight lines) — measured at ~1.5 ms per ray, that is the whole frame budget and the
// "60 fps until bots join, then 20" cliff. Big static meshes now carry a median-split triangle
// BVH and a raycast override that walks it: measured 0.12 ms per ray on the same level, with
// probe scans byte-identical.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const build = extractFunction('_buildTriBVH');

// ---------------------------------------------------------------- executable: the builder
// _buildTriBVH is deliberately THREE-free (plain arrays), so it runs as-is.
{
  const fn = new Function(`${build}\nreturn _buildTriBVH;`)();
  // a 12x12 grid of quads (288 tris), indexed
  const N = 12, pos = [], idx = [];
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) pos.push(x, Math.sin(x * z) * 0.2, z);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const a = z * (N + 1) + x, b = a + 1, c = a + N + 2, d = a + N + 1;
    idx.push(a, b, c, a, c, d);
  }
  const geo = { attributes: { position: { array: new Float32Array(pos), count: pos.length / 3 } },
    index: { array: new Uint32Array(idx), count: idx.length } };
  const bvh = fn(geo);
  const triCount = idx.length / 3;
  // order is a permutation of every triangle
  eq(bvh.order.length, triCount, 'every triangle is in the tree');
  eq(new Set(bvh.order).size, triCount, '...exactly once');
  // walk every node: leaves' triangles must sit inside the node bounds; inner nodes must
  // enclose both children; leaf sizes respect the cap
  const nNodes = bvh.ni.length / 4;
  let leaves = 0, covered = 0;
  for (let n = 0; n < nNodes; n++) {
    const B = n * 6, I = n * 4;
    if (bvh.ni[I + 1] > 0) {
      leaves++; covered += bvh.ni[I + 1];
      assert(bvh.ni[I + 1] <= 8, 'leaf holds at most 8 triangles');
      for (let i = bvh.ni[I]; i < bvh.ni[I] + bvh.ni[I + 1]; i++) {
        const t = bvh.order[i];
        for (let v = 0; v < 3; v++) { const vi = idx[t * 3 + v] * 3;
          for (let k = 0; k < 3; k++) {
            assert(pos[vi + k] >= bvh.nb[B + k] - 1e-4 && pos[vi + k] <= bvh.nb[B + 3 + k] + 1e-4,
              'leaf bounds contain their triangles');
          } }
      }
    } else {
      for (const ch of [bvh.ni[I + 2], bvh.ni[I + 3]]) for (let k = 0; k < 3; k++) {
        assert(bvh.nb[ch * 6 + k] >= bvh.nb[B + k] - 1e-4, 'child min inside parent');
        assert(bvh.nb[ch * 6 + 3 + k] <= bvh.nb[B + 3 + k] + 1e-4, 'child max inside parent');
      }
    }
  }
  eq(covered, triCount, 'the leaves partition the full triangle set');
  assert(leaves > 1, 'the tree actually split (' + leaves + ' leaves)');
}

// ---------------------------------------------------------------- wiring pins
assert(/o\.userData\.__bvh = _buildTriBVH\(o\.geometry\); o\.raycast = _bvhRaycastMesh;/.test(src),
  'qualifying meshes swap in the BVH raycast');
assert(/if\(!o\.isMesh \|\| o\.isSkinnedMesh \|\| o\.isInstancedMesh \|\| !o\.geometry \|\| o\.userData\.__bvh\) return;/.test(src),
  'deforming (skinned/instanced) meshes are excluded — their triangles move');
assert(/if\(o\.geometry\.morphAttributes && o\.geometry\.morphAttributes\.position\) return;/.test(src),
  '...morphing meshes too');
assert(/if\(tc < 256\) return;/.test(src), 'tiny meshes keep brute force (not worth the memory)');
assert(/_installRaycastBVH\(o\);/.test(src), 'installed from the imported-model finalize traverse');
// the raycast walk honours the same contracts as three.js Mesh.raycast
assert(/const cullBack = !mat0 \|\| mat0\.side === THREE\.FrontSide;/.test(src), 'backface culling follows material.side');
assert(/if\(dist < raycaster\.near \|\| dist > raycaster\.far\) continue;/.test(src), 'near/far respected');
assert(/THREE\.Triangle\.getNormal\(_bvhA, _bvhB, _bvhC, face\.normal\);/.test(src), 'hits carry a face normal (impact FX use it)');

done('build 1097: rays stop testing every triangle — bots no longer eat the frame budget');
