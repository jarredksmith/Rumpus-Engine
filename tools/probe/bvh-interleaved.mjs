// The decal ghost: is build 1097's BVH reading an INTERLEAVED position buffer with a stride of 3?
//
// Reported from play, with the file: "this prop is showing decals from bullets way far away from the
// prop itself on an invisible barrier". Every shot in this engine raycasts real triangles, so a decal
// lands wherever the ray says it hit — and for this prop the ray reports hits in empty space.
//
// The tell recorded last session was that the BVH held 13,104 vertices for a 3,276-vertex mesh. Read
// out of the GLB in Node, the POSITION accessor is FLOAT, count 3,276, byteStride 48 = TWELVE floats
// per vertex (position 3 + normal 3 + tangent 4 + uv 2). So `attributes.position.array` is the shared
// interleaved buffer of 3,276 x 12 floats, and 39,312 / 3 is exactly 13,104. Not a red herring, and
// not a mismatched mesh: it is the signature of interleaving.
//
// `_buildTriBVH` reads `posA[vertexIndex*3 + k]`, which for such a buffer walks normals, tangents and
// UVs as though they were coordinates. So the tree is built over triangles that are nowhere near the
// model, and it happily reports hits there.
//
// This measures it against the reported file, with the packed reading as the control in the SAME run
// against the SAME loaded mesh — so a difference cannot be the load, the scale or the pose.
import { withGame } from './driver.mjs';
import { ensureFixture } from './fixture-glb.mjs';

// The reported model is not in the tree, and a container rollback already took the copy that was —
// so the fixture is GENERATED: interleaved at stride 48, and thin. Those two properties are what
// make this measurable at all; fixture-glb.mjs records why each one matters.
console.log('  fixture'.padEnd(28) + JSON.stringify(ensureFixture()));

const say = (k, v) => console.log('  ' + String(k).padEnd(28) + JSON.stringify(v));

await withGame(async (P) => {
  const r = await P(`(async function(){
    paused = true; window.__p = null;
    spawnProp('http://127.0.0.1:8899/arch.glb', [40, 0, 40, 0,0,0, 8,8,8], (o)=>{ window.__p = o; });
    for(let i=0;i<400 && (!window.__p || _glbPending>0);i++) await new Promise(r=>setTimeout(r,50));
    if(!__p) return { FAILED:'no model' };
    __p.updateMatrixWorld(true);
    let m = null; __p.traverse(x=>{ if(x.isMesh && !m) m = x; });
    if(!m) return { FAILED:'no mesh' };

    const pa = m.geometry.attributes.position;
    const box = new THREE.Box3().setFromObject(m);
    const rnd = v => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];

    /* Fire a fan of rays THROUGH the arch's own footprint at heights from the ground to well over it,
       and record where each says it hit. A hit is only honest if it lies inside the mesh's own world
       bounding box (with a millimetre of slack) — that is what "on the prop" means, geometrically. */
    const rc = new THREE.Raycaster(); rc.far = 400;
    const dir = new THREE.Vector3(0,0,1);
    const shots = [];
    for(let y = 0.5; y <= 6.01; y += 0.5)
      for(let x = 36; x <= 44.01; x += 2) shots.push([x, y]);

    const sweep = () => {
      const out = { n:0, off:0, worst:null, worstD:0, sample:[] };
      for(const [x,y] of shots){
        rc.set(new THREE.Vector3(x, y, 20), dir);
        const h = rc.intersectObject(m, false);
        if(!h.length) continue;
        out.n++;
        const p = h[0].point;
        /* distance OUTSIDE the mesh's own bounding box */
        const d = Math.max(0, box.min.x-p.x, p.x-box.max.x,
                              box.min.y-p.y, p.y-box.max.y,
                              box.min.z-p.z, p.z-box.max.z);
        if(d > 0.001){ out.off++; if(d > out.worstD){ out.worstD = +d.toFixed(2); out.worst = rnd(p); } }
        if(out.sample.length < 3) out.sample.push(rnd(p));
      }
      return out;
    };

    const shipped = sweep();

    /* THE CONTROL, same mesh, same pose: rebuild the tree over a TIGHTLY PACKED copy of the positions,
       read through the attribute API the way three's own Mesh.raycast does. */
    const packed = (function(){
      const n = pa.count, o = new Float32Array(n*3);
      for(let i=0;i<n;i++){ o[i*3]=pa.getX(i); o[i*3+1]=pa.getY(i); o[i*3+2]=pa.getZ(i); }
      return o;
    })();
    const before = m.userData.__bvh;
    const rebuilt = _buildTriBVH(m.geometry);
    rebuilt.posA = packed;                       /* the one thing under test */
    m.userData.__bvh = rebuilt;
    /* the tree's own node bounds were built from the same bad reads, so re-derive them too */
    m.userData.__bvh = (function(){
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.BufferAttribute(packed, 3));
      g2.setIndex(m.geometry.index);
      return _buildTriBVH(g2);
    })();
    const fixed = sweep();

    /* THE REFERENCE: three's own brute-force Mesh.raycast, which reads through the attribute API and
       therefore cannot be fooled by interleaving. Whatever it says is the truth about this mesh. */
    const ownRay = m.raycast;
    delete m.raycast;
    const brute = sweep();
    m.raycast = ownRay;
    m.userData.__bvh = before;

    /* The SECOND symptom in the same report: "the editor shows a huge bounding box on the prop, and if I
       drag a gizmo handle it resizes to the correct size a second later." Same prop, so ask whether it is
       the same cause — three's Box3 reads through the attribute API and cannot be fooled by interleaving,
       so if the box is already right at load this is a different bug and belongs to a different build. */
    const bx = () => { const b = __p.userData.box; return b ? [rnd(b.min), rnd(b.max)] : null; };
    const boxAtLoad = bx();
    refreshPropCollider(__p);
    const boxAfterDrag = bx();

    return { ok:true,
      interleaved: pa.isInterleavedBufferAttribute === true,
      itemSize: pa.itemSize, count: pa.count,
      arrayLen: pa.array.length,
      arrayLenOverCount: +(pa.array.length / pa.count).toFixed(2),
      stridedFloats: pa.data ? pa.data.stride : null,
      bvhPosLen: before ? before.posA.length : null,
      bvhLooksLikeCount: before ? +(before.posA.length/3).toFixed(0) : null,
      meshBox: [rnd(box.min), rnd(box.max)],
      rays: shots.length,
      shipped, fixed, brute,
      matchesThree: (fixed.n === brute.n && JSON.stringify(fixed.sample) === JSON.stringify(brute.sample)),
      boxAtLoad, boxAfterDrag,
      boxChanged: JSON.stringify(boxAtLoad) !== JSON.stringify(boxAfterDrag) };
  })()`);
  for (const k of Object.keys(r)) say(k, r[k]);
}, { settleMs: 5000 });

console.log('');
