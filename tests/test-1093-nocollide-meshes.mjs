// build 1093: the "nocollide" naming convention — any mesh named nocollide* (or living under a
// group so named) is pure decoration: grass cards, foliage, light shafts. It is skipped by all
// three collider builders (the model grid rasteriser, the per-mesh box builder, the Rapier
// trimesh) and its raycast is neutralised so it never blocks movement probes, sight, or bullets.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
// The grid's own constants, taken from breach.html. Restating them here meant that adding one (build 1148's
// footprint budget) made this harness throw a ReferenceError from inside the function it was testing.
function gridConsts(){
  return [/const MGRID_CELL = [^;]+;/, /const MGRID_BITS = [^;]+;/, /const MGRID_FOOT_BYTES = [^;]+;/,
    /const MGRID_MIN_THICK = [^;]+;/]
    .map(re=>{ const m=src.match(re); assert(m, 'the grid constant ' + re + ' is declared in one place'); return m[0]; }).join('\n');
}

const src = gameSource();
const bg = extractFunction('buildModelGridBoxes');

// -------------------------------------------------- all three traverses carry the skip
assert(/for\(let p=o; p; p=p\.parent\)\{ if\(p\.name && \/\^nocollide\/i\.test\(p\.name\)\) return; \}/.test(bg),
  'the grid rasteriser skips nocollide meshes (walking up through parent groups)');
assert(/for\(let p=o; p; p=p\.parent\)\{ if\(p\.name && \/\^nocollide\/i\.test\(p\.name\)\)\{ o\.raycast = _ncNoRay; return; \} \}/.test(src),
  'the per-mesh box builder skips them AND stamps the raycast no-op');
assert(/for\(let p=m; p; p=p\.parent\)\{ if\(p\.name && \/\^nocollide\/i\.test\(p\.name\)\) return; \}/.test(src),
  'the Rapier trimesh builder skips them too');
assert(/const _ncNoRay = function\(\)\{\};/.test(src), 'the shared raycast no-op exists');

// -------------------------------------------------- executable: grass never enters the grid
// Two meshes under one root: a solid 4x4x2 block, and a field of vertical "grass" quads inside a
// group named nocollide-foliage. The grid must contain the block and nothing where the grass is.
{
  class V3 { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
    fromBufferAttribute(a,i){ this.x=a.array[i*3]; this.y=a.array[i*3+1]; this.z=a.array[i*3+2]; return this; }
    applyMatrix4(){ return this; } }
  class Box3 { constructor(min,max){ this.min=min; this.max=max; } }
  const meshOf = (tris, name, parent) => {
    const arr = new Float32Array(tris.flat());
    return { isMesh: true, visible: true, name: name||'', parent: parent||null,
      geometry: { index: null, attributes: { position: { count: arr.length/3, array: arr } } },
      updateWorldMatrix(){}, matrixWorld: {} };
  };
  // solid block occupying x 0..4, z 0..4, y 0..2 (12 triangles of a box, top+sides suffice)
  const blockTris = [
    [0,2,0, 4,2,0, 4,2,4],[0,2,0, 4,2,4, 0,2,4],           // top
    [0,0,0, 4,0,0, 4,2,0],[0,0,0, 4,2,0, 0,2,0],           // one side
  ];
  const block = meshOf(blockTris, 'wall');
  // grass: tall vertical quads far away at x 10..14 — would stamp 3-unit walls if not skipped
  const grassTris = [];
  for(let i=0;i<4;i++){ const x=10.5+i; grassTris.push([x,0,10, x+0.8,0,10.8, x+0.8,3,10.8],[x,0,10, x+0.8,3,10.8, x,3,10]); }
  const foliage = { name: 'nocollide-foliage', parent: null };
  const grass = meshOf(grassTris, '', foliage);
  const obj = { traverse(fn){ fn(block); fn(grass); } };
  const overall = { min: new V3(0,0,0), max: new V3(15, 3, 11) };
  const fn = new Function('THREE','_mgA','_mgB','_mgC','IS_COARSE',
    // build 1148: the collider constants are READ from the source rather than restated here, so a
    // change to the grid's budget or resolution reaches this harness instead of throwing inside it.
    `${gridConsts()}\n${bg}\nreturn buildModelGridBoxes;`
  )({ Vector3: V3, Box3 }, new V3(), new V3(), new V3(), false);
  const boxes = fn(obj, overall);
  assert(boxes && boxes.length, 'the builder still produces boxes for the real wall');
  // split at x=7: wall geometry lives entirely at x<=5, grass entirely at x>=10 — no box can straddle
  const inWall  = boxes.filter(b => b.min.x < 7);
  const inGrass = boxes.filter(b => b.max.x > 7);
  assert(inWall.length > 0, 'the solid block is collidable (' + inWall.length + ' boxes)');
  eq(inGrass.length, 0, 'the nocollide grass field produced ZERO collider boxes');
}

done('build 1093: nocollide decoration meshes are invisible to every collider');
