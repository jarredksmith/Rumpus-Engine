import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1089, user-reported: a 5 MB skyscraper GLB used as a whole level. "Enemies seem to get stuck in
// invisible meshes." The player walked it perfectly. Three separate causes, all measured against the real
// asset (331 x 148 x 366 units, 1,763 meshes, 265,151 triangles).

// ---------------------------------------------------------------- 1. the grid gave up on big models
// The old guard bailed at 200k triangles and fell back to ONE AXIS-ALIGNED BOX PER MESH. On architecture
// each mesh is a whole building, so its box is a solid block spanning the interior, the doorways and the
// full height — 1,763 invisible solid blocks. A level model is exactly the case that needs the grid most.
const bg = extractFunction('buildModelGridBoxes');
assert(!/if\(\+\+tris>200000\)/.test(bg), 'the 200k triangle cap is gone');
assert(/if\(\+\+tris>2000000 \|\| work>40000000\)\{ bail=true; return; \}/.test(bg),
  'the budget is now on SLOTS WRITTEN, which is what actually costs time — one huge floor triangle can touch the whole grid');
// build 1092: work is now accumulated per column (the clip pass and the slots the clipped
// fragment actually writes), not as one bulk product of the whole triangle's AABB.
assert(/work \+= 4;/.test(bg) && /work \+= cs1-cs0\+2;/.test(bg), '...and that work is actually counted');

// ---------------------------------------------------------------- 2. the resolution was fixed, not fitted
// 64 x 64 columns and 48 slots regardless of size. On the reported model that is 5.18 x 5.72 unit columns
// and 3.09 unit slots — so each storey's FLOOR and its CEILING landed in the same slot and fused into one
// solid slab. The whole interior became solid.
assert(/const MGRID_CELL = 1\.0, MGRID_SLOT = 0\.35;/.test(src), 'resolution is now a target cell size');
assert(/Math\.ceil\(sx\/MGRID_CELL\)/.test(bg) && /Math\.round\(sy\/MGRID_SLOT\)/.test(bg),
  '...derived from the model\'s real extent');
assert(/const f=Math\.cbrt\(budget\/total\);/.test(bg),
  '...and scaled down proportionally when it will not fit, so it cannot go fine on one axis and useless on another');
assert(/new Uint32Array\(\(\(N\*K\)\+31\)>>5\)/.test(bg), 'occupancy is a bitset, which buys 8x the resolution for the same memory');
assert(/IS_COARSE/.test(bg), '...on a halved budget for phones');
{
  // the reported model, through the real sizing maths
  const size = (sx, sy, sz, budget = 48 << 20) => {
    let nx = Math.max(1, Math.ceil(sx / 1.0)), nz = Math.max(1, Math.ceil(sz / 1.0)), K = Math.max(8, Math.round(sy / 0.35));
    const total = nx * nz * K;
    if (total > budget) { const f = Math.cbrt(budget / total); nx = Math.max(1, Math.floor(nx * f)); nz = Math.max(1, Math.floor(nz * f)); K = Math.max(8, Math.floor(K * f)); }
    return { cw: sx / nx, cd: sz / nz, sh: sy / K, mb: (nx * nz * K / 8) / 1048576 };
  };
  const sky = size(331.4, 148.1, 365.8);
  assert(sky.sh < 1.0, 'the reported skyscraper gets slots under a metre (' + sky.sh.toFixed(2) + '), not the 3.09 that fused floor into ceiling');
  assert(sky.cw < 1.5 && sky.cd < 1.5, '...and columns near a metre (' + sky.cw.toFixed(2) + '), not 5.2');
  assert(sky.mb <= 6.1, '...inside the memory budget (' + sky.mb.toFixed(1) + ' MB)');
  const prop = size(4, 3, 4);
  assert(prop.cw <= 1.0 && prop.sh <= 0.35, 'a small prop still gets fine cells (' + prop.cw.toFixed(2) + ' / ' + prop.sh.toFixed(2) + ')');
}
// a per-column emit at this resolution would be tens of thousands of boxes, and every consumer walks the
// list per query — so identical columns are merged into rectangles first
assert(/Greedy-merge identical columns into rectangles/.test(bg), 'the boxes are greedy-merged');
assert(/let z1=gz; while\(z1\+1<nz && !used\[gx\*nz\+z1\+1\] && key\[gx\*nz\+z1\+1\]===k\) z1\+\+;/.test(bg), '...along Z');
assert(/outer: while\(x1\+1<nx\)\{/.test(bg), '...then widened along X');

// ---------------------------------------------------------------- run the real builder on a two-storey box
// This is the geometry that was fusing: a floor slab, a ceiling slab 3 units above it, and four walls.
{
  class V3 { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
    fromBufferAttribute(a,i){ this.x=a.array[i*3]; this.y=a.array[i*3+1]; this.z=a.array[i*3+2]; return this; }
    applyMatrix4(){ return this; } }
  class Box3 { constructor(min,max){ this.min=min; this.max=max; } }
  const THREE = { Vector3: V3, Box3 };
  // two axis-aligned slabs + two walls, as raw triangles
  const tris = [];
  const slab = (y0,y1) => { for(const [ax,az,bx,bz,cx,cz] of [[-5,-5,5,-5,5,5],[-5,-5,5,5,-5,5]])
    for(const y of [y0,y1]) tris.push([ax,y,az, bx,y,bz, cx,y,cz]); };
  slab(0, 0.2);        // floor 0..0.2
  slab(3.0, 3.2);      // ceiling 3.0..3.2
  for(const x of [-5, 5]) tris.push([x,0,-5, x,3.2,-5, x,3.2,5], [x,0,-5, x,3.2,5, x,0,5]);   // two walls
  const arr = new Float32Array(tris.flat());
  const mesh = { isMesh: true, visible: true,
    geometry: { index: null, attributes: { position: { count: arr.length/3, array: arr } } },
    updateWorldMatrix(){}, matrixWorld: {} };
  const obj = { traverse(fn){ fn(mesh); } };
  const overall = { min: new V3(-5, 0, -5), max: new V3(5, 3.2, 5) };
  const fn = new Function('THREE','_mgA','_mgB','_mgC','IS_COARSE',
    `const MGRID_CELL = 1.0, MGRID_SLOT = 0.35;\nconst MGRID_BITS = 48 << 20;\n${bg}\nreturn buildModelGridBoxes;`
  )(THREE, new V3(), new V3(), new V3(), false);
  const boxes = fn(obj, overall);
  assert(boxes && boxes.length, 'the builder produces boxes for a two-storey room (' + (boxes ? boxes.length : 0) + ')');
  // THE test: the room's interior, between floor top and ceiling bottom, must be EMPTY
  const atCentre = boxes.filter(b => b.min.x <= 0 && b.max.x >= 0 && b.min.z <= 0 && b.max.z >= 0);
  const bodyLo = 0.2 + 0.6, bodyHi = 0.2 + 1.95;   // an enemy's band: feet + STEP up to head
  const blocking = atCentre.filter(b => b.min.y < bodyHi && b.max.y > bodyLo);
  eq(blocking.length, 0, 'nothing blocks the body band in the middle of the room — floor and ceiling no longer fuse');
  assert(atCentre.some(b => b.max.y <= 0.6), '...the floor slab is still there, below the band');
  assert(atCentre.some(b => b.min.y >= bodyHi), '...and so is the ceiling, clear above the band (the two used to be one slab)');
  // the walls are still solid
  const atWall = boxes.filter(b => b.min.x <= -4.6 && b.max.x >= -4.6 && b.min.z <= 0 && b.max.z >= 0);
  assert(atWall.some(b => b.min.y < bodyHi && b.max.y > bodyLo), 'a wall still blocks the band — this is not just "delete the collider"');
  // greedy merging actually did something: a 10x10 room is 100+ columns but far fewer boxes
  assert(boxes.length < 60, 'greedy merging collapsed the slabs (' + boxes.length + ' boxes for a 10x10 room)');
}

// ---------------------------------------------------------------- 3. enemies were held to a rule the player is not
// clearAt gives the PLAYER a step allowance: bandLo = standY + STEP. The enemy resolve started its band at
// the feet exactly, so the floor slab it was standing on counted as an obstacle — the grid quantises a run's
// top UP to the next slot boundary, so the slab's box top sits a fraction above the real surface. That
// pushed every enemy, in every column, every frame. It is why they stuck where the player walked freely.
assert(/const bandLo = standY \+ STEP,/.test(extractFunction('clearAt')), 'the player skips a STEP above the floor');
assert(/const eFeetY = en\.mesh\.position\.y - 1\.4 \+ STEP, eHeadY = en\.mesh\.position\.y \+ 0\.55;/.test(src),
  '...and now so does the enemy');
assert(/const STEP = 0\.6;/.test(src), 'sanity: STEP is the shared step height');
{
  // the exact failure: a floor whose collider top is quantised 0.3 above the real surface
  const band = (feetY, step) => ({ lo: feetY + step, hi: feetY + 1.95 });
  const floorBox = { min: -1, max: 0.3 };            // real surface 0, box top quantised to 0.3
  const hits = (b, f, step) => { const bd = band(f, step); return b.max > bd.lo && b.min < bd.hi; };
  eq(hits(floorBox, 0, 0), true, 'without a step allowance the floor slab itself blocks the enemy');
  eq(hits(floorBox, 0, 0.6), false, '...and with one it does not');
  const wall = { min: -1, max: 4 };
  eq(hits(wall, 0, 0.6), true, 'a real wall still blocks');
  const kerb = { min: 0, max: 0.45 };
  eq(hits(kerb, 0, 0.6), false, 'and a kerb under the step height is walked over, exactly as the player walks it');
}

done('build 1089: an imported level model collides the way it looks — enemies stop sticking in nothing');
