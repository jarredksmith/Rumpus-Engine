// refreshPropCollider: per-mesh boxes are built from each mesh's OWN vertices (no setFromObject
// fusion), invisible meshes skipped, climbable=true, overall box covers everything.
import * as THREE from 'three';
import { extractFunction, evalDecl, done, assert, eq } from './harness.mjs';
const src = extractFunction('refreshPropCollider');
/* build 1324: the scope gained `_ncNoRay`. It was always referenced, but only inside the `nocollide`-named
   branch this fixture never takes; the new "give a de-flagged mesh its raycast back" line runs for EVERY
   mesh, so an incomplete scope now throws instead of quietly passing. */
const refresh = evalDecl('const _pcV=new THREE.Vector3(); const _ncNoRay=function(){}; function isModelSrc(x){return typeof x==="string"&&/^(https?:|blob:|data:|sketchfab:)/i.test(x);} function buildModelGridBoxes(){return null;} ' + src, 'refreshPropCollider', { THREE });

// A group with two well-separated child meshes + one invisible mesh.
const g = new THREE.Group();
const a = new THREE.Mesh(new THREE.BoxGeometry(1,1,1)); a.position.set(0,0.5,0);
const b = new THREE.Mesh(new THREE.BoxGeometry(1,1,1)); b.position.set(10,0.5,0);
const hidden = new THREE.Mesh(new THREE.BoxGeometry(1,1,1)); hidden.position.set(100,0.5,0); hidden.visible=false;
g.add(a, b, hidden);
refresh(g);

const boxes = g.userData.boxes;
eq(boxes.length, 2, 'two boxes (invisible mesh skipped)');
assert(g.userData.climbable === true, 'climbable flag set');
// CRITICAL regression: neither per-mesh box may span the gap between a and b.
for (const box of boxes) {
  const w = box.max.x - box.min.x;
  assert(w < 2, `per-mesh box stays tight (width ${w.toFixed(2)}, not fused across the 10u gap)`);
}
// overall box must cover both visible meshes (a at x~0, b at x~10)
assert(g.userData.box.min.x < 0.6 && g.userData.box.max.x > 9.4, 'overall box spans both meshes');
done('prop collider per-mesh boxing (no fusion)');

// build 1324: the no-collision flag, executed through the real function rather than pinned in the source.
{
  const d = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(2,2,2)); m.position.set(0,1,0);
  d.add(m);
  d.userData.noCol = true;
  refresh(d);
  eq(d.userData.boxes.length, 0, 'a noCol prop emits NO collider boxes...');
  assert(m.raycast !== THREE.Mesh.prototype.raycast, '...and its meshes stop taking raycast hits');
  assert(!!d.userData.box, '...while keeping an overall box, which selection and framing still need');
  // and it is REVERSIBLE — an own property deleted to expose the prototype again
  delete d.userData.noCol;
  refresh(d);
  eq(d.userData.boxes.length, 1, 'unchecking it brings the collider back...');
  assert(m.raycast === THREE.Mesh.prototype.raycast, '...and the raycast with it, or the checkbox is one-way');
}
