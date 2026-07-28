// build 1092: enemies can climb ramps in imported level models.
//
// Two halves, both found by generating a clean-geometry arena and probing it in the real engine:
//
// 1. The grid rasteriser stamped each triangle's FULL vertical extent into every column its XZ
//    bounding box covers. Fine for small triangles; but a ramp top authored as two big triangles
//    filled every column under the slope from base to summit, and the ramp's triangular SIDE face
//    stamped a summit-height wall along the ramp's entire length. The greedy merge fused those
//    into wall-shaped boxes: the player (who walks real triangles) climbed fine, enemies (who
//    resolve against the boxes) were shoved off. Now a multi-column triangle is clipped to each
//    cell in 3D and stamps only the fragment's true height range.
//
// 2. Even a perfectly rasterised slope steps ~slope+slot per cell, which can top the enemy's
//    STEP allowance — the ramp an enemy climbed read as an obstacle. The resolve now exempts a
//    contacted box whose top matches the real walkable surface over that box: it is the ground
//    one step ahead, not a wall.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const bg = extractFunction('buildModelGridBoxes');

// ---------------------------------------------------------------- the clipping rasteriser
assert(/Sutherland/.test(bg), 'the rasteriser documents the per-cell clip');
assert(/if\(!poly\.length\) continue;/.test(bg), 'cells the triangle never enters stay empty');
assert(/const multi = \(gx1>gx0 \|\| gz1>gz0\);/.test(bg), 'single-cell triangles keep the cheap exact path');

// run the real builder on the exact failing shape: a 12-long ramp rising 0 -> 4.5, with its two
// big top triangles and two vertical side triangles
{
  class V3 { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
    fromBufferAttribute(a,i){ this.x=a.array[i*3]; this.y=a.array[i*3+1]; this.z=a.array[i*3+2]; return this; }
    applyMatrix4(){ return this; } }
  class Box3 { constructor(min,max){ this.min=min; this.max=max; } }
  const tris = [];
  // sloping top: (0,0) end at y=0, (12,*) end at y=4.5
  tris.push([0,0,0, 12,4.5,0, 12,4.5,4], [0,0,0, 12,4.5,4, 0,0,4]);
  // vertical triangular sides — the faces that used to stamp a full-length summit-height wall
  for (const z of [0, 4]) tris.push([0,0,z, 12,0,z, 12,4.5,z]);
  // underside
  tris.push([0,0,0, 12,0,0, 12,0,4], [0,0,0, 12,0,4, 0,0,4]);
  const arr = new Float32Array(tris.flat());
  const mesh = { isMesh: true, visible: true,
    geometry: { index: null, attributes: { position: { count: arr.length/3, array: arr } } },
    updateWorldMatrix(){}, matrixWorld: {} };
  const obj = { traverse(fn){ fn(mesh); } };
  const overall = { min: new V3(0, 0, 0), max: new V3(12, 4.5, 4) };
  const fn = new Function('THREE','_mgA','_mgB','_mgC','IS_COARSE',
    `const MGRID_CELL = 1.0, MGRID_SLOT = 0.35;\nconst MGRID_BITS = 48 << 20;\n${bg}\nreturn buildModelGridBoxes;`
  )({ Vector3: V3, Box3 }, new V3(), new V3(), new V3(), false);
  const boxes = fn(obj, overall);
  assert(boxes && boxes.length, 'the builder produces boxes for a ramp (' + (boxes ? boxes.length : 0) + ')');

  // THE regression: no box may be both long and summit-height — that shape is the old "ramp
  // becomes a wall" failure, from the top face's AABB or from the side faces' AABBs alike
  const walls = boxes.filter(b => (b.max.x - b.min.x) > 6 && (b.max.y - b.min.y) > 3);
  eq(walls.length, 0, 'no long summit-height wall anywhere in the ramp collider');

  // column tops must follow the slope: sample the centreline cell by cell
  const colTop = (x) => Math.max(...boxes.filter(b => b.min.x <= x && b.max.x >= x && b.min.z <= 2 && b.max.z >= 2).map(b => b.max.y));
  const tops = []; for (let ix = 0; ix < 12; ix++) tops.push(colTop(ix + 0.5));
  assert(tops[0] < 1.2, 'the low end is low (' + tops[0].toFixed(2) + '), not summit-height');
  assert(tops[11] > 3.9, 'the high end is high (' + tops[11].toFixed(2) + ')');
  let maxStep = 0;
  for (let i = 1; i < 12; i++) maxStep = Math.max(maxStep, tops[i] - tops[i-1]);
  // slope 0.375/cell + one 0.35 slot of quantisation, with rounding slack
  assert(maxStep <= 0.8, 'adjacent columns step by at most slope+slot (' + maxStep.toFixed(2) + ')');
}

// ---------------------------------------------------------------- the floor-not-obstacle exemption
// It lives inside the Phase 3 contact branch: only on actual overlap, only for near-step boxes,
// and it asks the real surface — so a crate still pushes, but the ramp underfoot does not.
const m = src.match(/if\(d < eR && d > 1e-4\)\{\n([\s\S]{0,2000}?)\n          \}/);
assert(m, 'the enemy resolve contact branch is found');
assert(/b\.max\.y - \(en\.mesh\.position\.y-1\.4\) < STEP \+ 0\.5/.test(m[1]),
  'the exemption gates on a near-step box top — a crate or parapet never qualifies');
assert(/typeof surfaceTopUnder==='function'/.test(m[1]), '...guarded, since surfaceTopUnder lives far below');
// build 1094: the surface is sampled just inside the box at the CONTACT point (box-centre
// sampling failed when the greedy merge fused a ramp mouth into a long wall box)
assert(/surfaceTopUnder\(cx - dx\/d\*0\.1, cz - dz\/d\*0\.1, b\.max\.y\+0\.05, b\.max\.y\+2\)/.test(m[1]),
  '...and asks for the real walkable surface at the contact point on the box');
assert(/if\(st > -Infinity && b\.max\.y - st < 0\.85\) continue;/.test(m[1]),
  'a box whose top matches the surface is ground one step ahead — skipped, not shoved');
assert(/const push=eR-d; en\.mesh\.position\.x \+= dx\/d\*push; en\.mesh\.position\.z \+= dz\/d\*push;/.test(m[1]),
  'everything else still pushes exactly as before');

done('build 1092: sloped geometry rasterises as a slope, and enemies may climb it');
