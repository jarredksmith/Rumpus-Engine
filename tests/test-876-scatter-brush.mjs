// (build 876) LANDSCAPE SCATTER BRUSH — "a landscape tool that places random tree models or bushes".
// The terrain brush gains a Scatter mode: up to three palette slots (free-model search, auto-credited,
// or a clone of the selected prop), each dab drops Density props at random disc positions with random
// yaw + size jitter, re-grounded on the terrain by bounding box. Scattered props are ORDINARY props —
// they select, move, delete, undo and serialize like anything placed by hand (verified headless: 4/dab,
// drag throttling, disc containment, yaw/scale variety, grounding, full serialization).
import { gameSource, extractFunction, evalDecl, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- the dab, executed: disc containment, throttle, density, jitter bounds ----
const placed = [];
const deps = {
  scatterBrush: { slots: [ { src:'cone', label:'tree', sx:1.5, sy:3, sz:1.5, fit:false, size:2 }, null, null ], slot: 0, density: 4, jitter: 0.35 },   // build 881: size ×2 — the jitter window doubles with it
  terrainBrush: { radius: 10 },
  ARENA: 70,
  Math,
  spawnProp: (s, t, cb) => {
    const obj = { userData:{ src:s }, position:{ x:t[0], y:t[1], z:t[2] }, rotation:{ y:t[4] },
      scale:{ x:1, y:1, z:1, set(a,b,c){ this.x=a; this.y=b; this.z=c; }, multiplyScalar(k){ this.x*=k; this.y*=k; this.z*=k; } },
      updateMatrixWorld(){} };
    cb(obj); placed.push(obj);
  },
  THREE: { Box3: class { setFromObject(o){ this._y=o.position.y; return this; } isEmpty(){ return false; } get min(){ return { y:this._y }; } } },
  terrainHeightAt: (x, z) => 2.5,   // pretend a hill: everything must re-ground to it
  _propFootR: () => 1, refreshPropCollider: () => {},
};
// _scatterDab closes over module-level `_scatLast`; bind it via a var in the sandbox
const _scatterDab = evalDecl('let _scatLast=null;\n' + extractFunction('_scatterDab', src), '_scatterDab', deps);
_scatterDab(20, -30);
eq(placed.length, 4, 'one dab = Density props');
assert(placed.every(o => Math.hypot(o.position.x - 20, o.position.z + 30) <= 10.001), 'all inside the brush disc');
assert(placed.every(o => o.scale.y >= 6 * 0.65 - 1e-9 && o.scale.y <= 6 * 1.35 + 1e-9), 'size jitter stays within ±35% of the slot scale × the Size dial (build 881)');
assert(new Set(placed.map(o => o.rotation.y.toFixed(3))).size > 1, 'random yaw varies');
assert(placed.every(o => Math.abs(o.position.y - 2.5) < 1e-9), 're-grounded onto the terrain height');
_scatterDab(21, -30);
eq(placed.length, 4, 'a dab 1m along the drag is throttled (spacing = radius*0.55)');
_scatterDab(-25, 15);
eq(placed.length, 8, 'moving on plants again');
placed.length = 0;
deps.scatterBrush.slots[0] = null;
_scatterDab(0, 0);
eq(placed.length, 0, 'empty palette places nothing');

// ---- wiring ----
assert(/if\(terrainBrush\.mode==='scatter'\)\{\s+\/\/ build 876[\s\S]{0,150}_scatterDab\(hitS\.x, hitS\.z\); return true;/.test(src), 'the brush routes scatter dabs');
assert(/if\(typeof _scatLast!=='undefined'\) _scatLast=null;/.test(src), 'mouse-up resets the drag spacing (next stroke starts fresh)');
assert(/\[\['raise','Raise'\],\['lower','Lower'\],\['smooth','Smooth'\],\['paint','Paint'\],\['scatter','Scatter'\]\]/.test(src), 'Scatter joins the brush-mode row');
assert(/const ang=Math\.random\(\)\*Math\.PI\*2, rr=Math\.sqrt\(Math\.random\(\)\)\*terrainBrush\.radius;/.test(src), 'sqrt-radius sampling: uniform over the disc, not centre-clumped');
assert(/if\(Math\.abs\(px\)>ARENA-1 \|\| Math\.abs\(pz\)>ARENA-1\) continue;/.test(src), 'never plants outside the arena');
// palette sources
assert(/scatterBrush\.slots\[si\]=\{ src:o\.userData\.src, label:nm, sx:o\.scale\.x, sy:o\.scale\.y, sz:o\.scale\.z, fit:false, size:1 \};/.test(src), '"Use selected prop" clones src + exact scale (Size × defaults to 1)');
assert(/scatterBrush\.slots\[si\]=\{ src:m\.glb, label:\(m\.title\|\|'model'\)\.slice\(0,14\), fit:true, size:7 \};/.test(src), 'model search fills a slot (fit to 7m by default — build 881: the 2m fit made tiny trees)');
assert(/renderModelSearch\(mh,\(m,st\)=>\{ if\(!m\|\|!m\.glb\) return; scatterBrush\.slots\[si\][\s\S]{0,120}creditAsset\(m\.attribution\);/.test(src), 'searched models are credited (licensing)');
assert(/if\(slot\.fit\)\{ if\(typeof _fitPropToSize==='function'\) _fitPropToSize\(obj, Math\.max\(0\.5, \+slot\.size\|\|7\)\); \}/.test(src), 'searched models fit to the slot\u2019s Size in metres');
assert(/mkBSlider\('Density', scatterBrush\.density, 1, 6, 1/.test(src) && /mkBSlider\('Size jitter', scatterBrush\.jitter, 0, 0\.6, 0\.05/.test(src), 'Density + Size jitter sliders');
assert(/mkBSlider\('Size \(m\)', S\.size!=null\?S\.size:7, 1, 25, 0\.5/.test(src) && /mkBSlider\('Size \\u00d7', S\.size!=null\?S\.size:1, 0\.2, 5, 0\.1/.test(src), 'per-slot Size dial: metres for searched models, a multiplier for clones (build 881)');
assert(/hundreds will cost frames \(scattered primitives are basically free\)/.test(src), 'the hint carries the draw-call budget warning');

done('build 876: landscape scatter brush — randomized trees/bushes/props, planted as ordinary props');
