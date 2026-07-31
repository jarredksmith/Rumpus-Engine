// build 1148: an imported level's doorways are passable.
//
// `buildModelGridBoxes` turns an imported model into a ~1-unit COLUMN grid, and a column went solid for its
// whole width as soon as a triangle touched it. Measured consequence: a 0.45-thick wall collided 2.0 thick,
// and a wall with an ordinary 1.6 m doorway had a passable gap of ZERO — one merged box spanned the opening.
// That is the root cause behind the generator's GRID_PAD / BOT_LANE, and it made every OTHER creator's
// imported building un-walkable unless they had happened to pad it.
//
// Build 1123 tried footprints PER COLUMN and opened no doorway. The reason is worth keeping: a column holds
// several vertical RUNS, and a doorway column holds the floor slab (which fills the cell) and the wall's
// jamb face (a sliver) — their union is the whole cell. So the footprint has to be per (column, SLOT), and
// runs have to SEGMENT wherever it changes.
//
// Everything below runs the real function over real triangles. A source-pin cannot see a doorway.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- a three.js stand-in, and the real function
const V3 = class { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  fromBufferAttribute(a,i){ this.x=a.array[i*3]; this.y=a.array[i*3+1]; this.z=a.array[i*3+2]; return this; }
  applyMatrix4(){ return this; } };
const Box3 = class { constructor(min,max){ this.min=min; this.max=max; } };

// The constants come from the source, so a change to either is a change to this test's premises rather than
// a silent divergence between what ships and what is measured here.
const gridConsts = [/const MGRID_CELL = [^;]+;/, /const MGRID_BITS = [^;]+;/,
  /const MGRID_FOOT_BYTES = [^;]+;/, /const MGRID_MIN_THICK = [^;]+;/]
  .map(re=>{ const m=src.match(re); assert(m, 'the grid constant ' + re + ' is declared in one place'); return m[0]; }).join('\n');

// `bytes` overrides the footprint budget, which is how the OLD behaviour is reached: starving the budget
// takes footPer to 0, so the pre-1148 whole-cell collider is measured from the shipping code rather than
// from a stale copy of it kept alive in a test.
function mkGrid(bytes){
  const consts = bytes === undefined ? gridConsts
    : gridConsts.replace(/const MGRID_FOOT_BYTES = [^;]+;/, 'const MGRID_FOOT_BYTES = ' + bytes + ';');
  return new Function('THREE','_mgA','_mgB','_mgC','IS_COARSE',
    consts + '\n' + [extractFunction('_mgridGatherTris'), extractFunction('_mgridCore'), extractFunction('_mgridOpts'), extractFunction('_mgridWrap'), extractFunction('buildModelGridBoxes')].join('\n') + '\nreturn buildModelGridBoxes;'
  )({ Vector3:V3, Box3 }, new V3(), new V3(), new V3(), false);
}
const buildGrid = mkGrid();
const buildGridNoFoot = mkGrid(0);

// ---------------------------------------------------------------- the build-1123 repro: a wall with a door
const quadInto = (tris,a,b,c,d) => { tris.push([...a,...b,...c]); tris.push([...a,...c,...d]); };
function boxInto(tris,x0,y0,z0,x1,y1,z1){
  const q=(a,b,c,d)=>quadInto(tris,a,b,c,d);
  q([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]);  q([x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[x1,y0,z1]);
  q([x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]);  q([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]);
  q([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]);  q([x0,y0,z0],[x0,y0,z1],[x1,y0,z1],[x1,y0,z0]);
}
const WX = 12;                                          // the wall runs x -6..6, on the plane z=0
function doorwayBoxes(fn, wallT, open){
  const tris = [];
  boxInto(tris, -WX/2, 0, -WX/2, WX/2, 0.2, WX/2);                  // floor slab
  boxInto(tris, -WX/2, 0.2, -wallT/2, -open/2, 3.2, wallT/2);        // wall, left of the opening
  boxInto(tris,  open/2, 0.2, -wallT/2,  WX/2, 3.2, wallT/2);        // wall, right of the opening
  let mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity];
  for(const t of tris) for(let k=0;k<3;k++) for(let q=0;q<3;q++){ mn[q]=Math.min(mn[q],t[k*3+q]); mx[q]=Math.max(mx[q],t[k*3+q]); }
  const arr = new Float32Array(tris.flat());
  return fn({ traverse(f){ f({ isMesh:true, visible:true,
    geometry:{ index:null, attributes:{ position:{ count:arr.length/3, array:arr } } },
    updateWorldMatrix(){}, matrixWorld:{} }); } }, { min:new V3(...mn), max:new V3(...mx) }) || [];
}
// chest height: above the floor slab, below the lintel — where a body actually walks
const Y = 1.2;
function gapAt(boxes){
  const solid=(x)=> boxes.some(b=> x>=b.min.x && x<=b.max.x && Y>=b.min.y && Y<=b.max.y && 0>=b.min.z && 0<=b.max.z);
  let run=0, best=0;
  for(let x=-WX/2; x<=WX/2; x+=0.01){ if(solid(x)) run=0; else { run+=0.01; if(run>best) best=run; } }
  return best;
}
function thicknessAt(boxes, x){
  const solid=(z)=> boxes.some(b=> x>=b.min.x && x<=b.max.x && Y>=b.min.y && Y<=b.max.y && z>=b.min.z && z<=b.max.z);
  let t0=null, t1=null;
  for(let z=-3; z<=3; z+=0.005){ if(solid(z)){ if(t0===null) t0=z; t1=z; } }
  return t0===null ? 0 : t1-t0;
}

{
  // This is the assertion the whole build exists for.
  const before = doorwayBoxes(buildGridNoFoot, 0.2, 1.6);
  eq(+gapAt(before).toFixed(2), 0, 'without footprints a 1.6 m doorway is SHUT — the build-1123 measurement, reproduced');
  const after = doorwayBoxes(buildGrid, 0.2, 1.6);
  assert(gapAt(after) >= 1.4, 'with them it is open, to within a footprint quantum: ' + gapAt(after).toFixed(2) + ' m of 1.6');
}
{
  // ...at every width a creator plausibly models, including the generator's own BOT_LANE of 3.8.
  for(const [open, min] of [[1.6, 1.4], [2.56, 2.3], [3.8, 3.3]]){
    const g = gapAt(doorwayBoxes(buildGrid, 0.45, open));
    assert(g >= min, 'a ' + open + ' m doorway in a 0.45 wall passes ' + g.toFixed(2) + ' m (needs ' + min + ')');
    assert(g <= open + 0.51, '...and never MORE than the opening plus a cell of slack: ' + g.toFixed(2));
  }
}
{
  // The other half: the wall itself must collide near its modelled thickness, and must stay SOLID. Two
  // widening rules were measured wrong before this one — centring the widening left a 0.45 wall as two
  // 0.25 slabs with a walk-through gap at z=0, and "grow to the nearer edge" hollowed out a 1.4 wall by
  // sending its two faces outward. Both are caught by the second assertion here.
  for(const wallT of [0.1, 0.2, 0.45, 0.9, 1.4]){
    const boxes = doorwayBoxes(buildGrid, wallT, 1.6);
    const t = thicknessAt(boxes, -4);
    assert(t >= Math.max(0.25, wallT * 0.9) - 0.02,
      'a ' + wallT + ' wall is at least as thick as it was modelled (or the 0.25 floor): ' + t.toFixed(3));
    assert(t <= Math.max(0.5, wallT) + 0.13, 'a ' + wallT + ' wall collides ' + t.toFixed(3) + ' thick, not a whole 2.0 cell');
    // no interior gap: sample every 5 mm through the middle of the wall and require an unbroken solid
    const solid=(z)=> boxes.some(b=> -4>=b.min.x && -4<=b.max.x && Y>=b.min.y && Y<=b.max.y && z>=b.min.z && z<=b.max.z);
    let holes=0, seen=false, ended=false;
    for(let z=-2; z<=2; z+=0.005){ if(solid(z)){ if(ended) holes++; seen=true; } else if(seen) ended=true; }
    eq(holes, 0, 'and it is ONE solid slab — no walk-through gap inside a ' + wallT + ' wall');
  }
  const wide = doorwayBoxes(buildGridNoFoot, 0.45, 1.6);
  near(thicknessAt(wide, -4), 2.0, 0.05, 'where without footprints that same 0.45 wall collided 2.0 thick');
}
{
  // A floor slab must stay a floor: full-cell both ways, so it still merges into a few big boxes rather
  // than one per column. This is the cost check — every consumer walks the box list per query.
  const tris = [];
  boxInto(tris, -20, 0, -20, 20, 0.3, 20);
  const arr = new Float32Array(tris.flat());
  const boxes = buildGrid({ traverse(f){ f({ isMesh:true, visible:true,
    geometry:{ index:null, attributes:{ position:{ count:arr.length/3, array:arr } } },
    updateWorldMatrix(){}, matrixWorld:{} }); } }, { min:new V3(-20,0,-20), max:new V3(20,0.3,20) }) || [];
  // Measured: 6 boxes before this build, 18 after — the slab's four side faces are slivers, so their edge
  // columns no longer merge into the interior and become their own strips. Still a handful, not 1,600.
  assert(boxes.length <= 24, 'a 40x40 slab is still a handful of merged boxes, not 1,600: ' + boxes.length);
  // and it is walkable at its own top rather than floating a cell above it
  const top = Math.max(...boxes.map(b=>b.max.y));
  near(top, 0.3, 0.2, 'the slab surface is where it was modelled');
}

// ---------------------------------------------------------------- the storage budget, and its fallbacks
{
  const fn = extractFunction('_mgridCore');   // build 1203: the internals live in the pure core now
  assert(/if\(4\*N\*K <= cap\)\{ want\(N\*K\); footPer=2; \}/.test(fn),
    'per-SLOT footprints when the budget affords them — four bytes per slot, one per edge');
  assert(/else if\(4\*N <= cap\)\{ want\(N\); footPer=1; \}/.test(fn),
    '...falling back to per-COLUMN, which still tightens a thin wall even though it opens no doorway');
  assert(/let fx0=null, fx1=null, fz0=null, fz1=null, footPer=0;/.test(fn),
    '...and to nothing at all, which is exactly the pre-1148 whole-cell behaviour rather than a broken grid');
  assert(/coarse\?\(MGRID_FOOT_BYTES>>1\):MGRID_FOOT_BYTES/.test(extractFunction('_mgridOpts')),
    'a phone gets half the budget, like MGRID_BITS beside it (derived once in _mgridOpts since 1203)');
  // 24 MB is the figure the 331x148x366 skyscraper needs; the cap exists so it degrades instead of dying
  const cap = src.match(/const MGRID_FOOT_BYTES = ([^;]+);/)[1];
  assert(/24 << 20/.test(cap), 'the cap is stated in bytes, not in cells: ' + cap.trim());
  assert(/new Uint8Array\(n\)\.fill\(255\); fz0=new Uint8Array\(n\)\.fill\(255\)/.test(fn),
    'the min edges start at 255 and the max at 0, so an unstamped slot reads as "no fragment" rather than as a full cell');
  assert(/if\(fx1\[i\] < fx0\[i\]\) return \[0,255,0,255\];/.test(fn),
    '...and a slot that is solid with no recorded fragment falls back to the whole cell — fail SOLID, never open');
}
{
  // Per-column storage must still produce a correct, if looser, collider — a phone with a big level lands here.
  const boxes = doorwayBoxes(mkGrid(40000), 0.45, 1.6);
  assert(boxes.length > 0, 'a per-column budget still builds a collider');
  const solid=(z)=> boxes.some(b=> -4>=b.min.x && -4<=b.max.x && Y>=b.min.y && Y<=b.max.y && z>=b.min.z && z<=b.max.z);
  let any=false; for(let z=-1;z<=1;z+=0.01) if(solid(z)) any=true;
  assert(any, '...and the wall is still solid there — degrading the budget never opens a hole');
}

// ---------------------------------------------------------------- the reasoning that cost three attempts
{
  const fn = extractFunction('_mgridCore');
  assert(/const PLANE_B = 2;/.test(fn),
    'a footprint no thicker than ~8 mm is a single SURFACE, not a thin measurement — the two cases widen differently');
  assert(/if\(hi - lo >= minB\) return \[lo, hi\];/.test(fn),
    'geometry that measured its own thickness keeps it');
  assert(/if\(nbLo && nbHi\) return \[0, 255\];/.test(fn),
    'a cell with solid on both sides is INTERIOR and fills — a thick wall does not become a shell with a hollow middle');
  assert(/const nb=\(dx,dz\)=>\{[\s\S]*getSlot\(\(\(x2\*nz\+z2\)\*K\)\+sl\)/.test(fn),
    'and which edge to grow toward comes from the OCCUPANCY GRID, not from guessing at the plane\'s position — that guess was measured wrong twice');
  assert(/const c = \(lo \+ hi\) >> 1, h = minB >> 1;/.test(fn),
    'only an ISOLATED thin plate widens about its own centre, or a 0.2 wall in mid-cell would be dragged to a cell edge');
  // segmentation — the actual fix for the doorway, and the thing build 1123 lacked
  assert(/if\(fn\[0\]!==f0\[0\] \|\| fn\[1\]!==f0\[1\] \|\| fn\[2\]!==f0\[2\] \|\| fn\[3\]!==f0\[3\]\) break;/.test(fn),
    'a run SPLITS where its footprint changes: a wall column\'s base slot holds the floor slab too, and a union over the whole run inherits the slab\'s full cell');
  assert(/const FOOT_Q = 16, FQ = Math\.ceil\(255\/FOOT_Q\);/.test(fn),
    '...but footprints are compared quantised, or a few millimetres of difference between slots shatters a wall into K boxes');
  // merge gating
  assert(/const fullX=\(ci\)=> foot\[ci\]\.every\(f=> f\[0\]===0 && f\[1\]===255\);/.test(fn) &&
         /const fullZ=\(ci\)=> foot\[ci\]\.every\(f=> f\[2\]===0 && f\[3\]===255\);/.test(fn),
    'merging along an axis is only lossless while the footprint spans the whole cell on it');
  assert(/const canZ = !footPer \|\| fullZ\(ci\), canX = !footPer \|\| fullX\(ci\);/.test(fn),
    '...so two thin walls one cell apart are never bridged by one merged box — solid where the model is open is the fault this build removes');
  assert(/const bx0=cx0\+\(f\[0\]\/255\)\*spanX-ey/.test(fn),
    'and the emitted box is scaled from the footprint, which is exact on a merged rectangle because it is full on the merged axis by construction');
  // the poly-scoping bug, which only an executable test caught
  assert(/let fax0=miX, fax1=maX, faz0=miZ, faz1=maZ;/.test(fn),
    'the fragment extent is declared beside lo/hi — the clipped polygon lives inside the `multi` branch and reading it outside threw');
}

// ---------------------------------------------------------------- more boxes means the consumers need a reject
{
  // Tightening the collider costs boxes (measured: 795 -> 2291 on a 3-storey generated block), and every
  // per-frame consumer walks obj.userData.boxes for every prop. The enemy resolve already rejected on the
  // prop's overall box; the rest did not.
  for(const [name, needle] of [['_surfCull', null], ['clearAt', null], ['insideSolid', null], ['ceilingAt', null]]){
    const fn = extractFunction(name) || '';
    assert(fn, name + ' is still a function this test can read');
    assert(/userData\.box;[\s\S]{0,240}?continue;/.test(fn),
      name + ' rejects a prop on its overall box before walking its box list (' + (needle||'coarse reject') + ')');
  }
  assert(/const b0=c\.userData\.box; if\(b0 && \(x<b0\.min\.x-M/.test(src),
    'and the reject is a bbox test with the same margin the loop below it uses, not a different one');
}

done('build 1148: an imported level\'s doorways are passable — per-(column,slot) collider footprints, 1.6 m opening 0.00 -> 1.49 m, a 0.45 wall 2.000 -> 0.500 thick');
