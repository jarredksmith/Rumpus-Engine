// (build 877) LIVE BRUSH CURSOR — sculpt/paint/scatter operated blind: no on-screen indicator of where
// the radius lands or where the soft edge begins. Now a ring rides the floor under the pointer: outer =
// brush radius, inner = the paint hard core (full strength inside the soft edge) or the scatter dab
// spacing; colour follows the mode. Verified headless across modes, plus the off/play hide paths.
import { gameSource, extractFunction, evalDecl, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- executed against stubs: geometry + colour logic ----
const mkRing = () => ({ scale:{ x:0, set(a,b){ this.x=a; } }, material:{ color:{ hex:0, setHex(h){ this.hex=h; } } }, visible:true });
const grp = { visible:false, position:{ set(x,y,z){ this.x=x; this.y=y; this.z=z; } } };
const outer = mkRing(), inner = mkRing();
const deps = {
  editorOpen: true,
  terrainBrush: { on:true, mode:'paint', radius:14, soft:0.7 },
  terrainPointUnderPointer: () => ({ x:5, y:2, z:-8 }),
  _ensureBrushRing: () => grp,
  _brushRingGrp: grp, _brushRingOuter: outer, _brushRingInner: inner,
  _BRUSH_RING_COL: { raise:0x38f5b5, lower:0xff8a5c, smooth:0xd6c05a, paint:0x36c6ff, scatter:0x7ddb6a },
  Math,
};
const bind = () => evalDecl(extractFunction('_updateBrushRing', src), '_updateBrushRing', deps);   // deps are captured at creation — rebind after changing them
let update = bind();
update({});
assert(grp.visible, 'ring shows over the floor');
near(grp.position.y, 2.06, 1e-9, 'rides the sculpted surface height, slightly lifted');
eq(outer.scale.x, 14, 'outer ring = brush radius');
near(inner.scale.x, 14*0.3, 1e-9, 'paint: inner ring = the hard core, radius*(1-soft)');
eq(outer.material.color.hex, 0x36c6ff, 'paint is blue');
deps.terrainBrush.mode='scatter'; update({});
near(inner.scale.x, 14*0.55, 1e-9, 'scatter: inner ring = the dab spacing');
eq(outer.material.color.hex, 0x7ddb6a, 'scatter is green');
deps.terrainBrush.mode='raise'; update({});
assert(inner.visible===false, 'sculpt modes show only the radius');
eq(outer.material.color.hex, 0x38f5b5, 'sculpt uses the accent');
deps.terrainBrush.on=false; update({});
assert(grp.visible===false, 'brush off -> hidden');
deps.terrainBrush.on=true; deps.editorOpen=false; grp.visible=true; update=bind(); update({});
assert(grp.visible===false, 'outside the editor -> hidden');
deps.editorOpen=true; deps.terrainPointUnderPointer=()=>null; grp.visible=true; update=bind(); update({});
assert(grp.visible===false, 'pointer off the floor -> hidden');

// ---- wiring ----
assert(/if\(typeof _updateBrushRing==='function'\) _updateBrushRing\(e\);   \/\/ build 877/.test(src), 'follows every editor mousemove (before the stroke branch, so it tracks mid-drag)');
assert(/if\(_brushRingGrp && _brushRingGrp\.visible && \(!editorOpen \|\| !terrainBrush\.on\)\) _brushRingGrp\.visible=false;/.test(src), 'per-frame leak guard: the cursor never rides into play (the build-859 class)');
// the state is declared with the paint engine, far above the loop's first synchronous tick (boot TDZ)
const declAt = src.indexOf('let _brushRingGrp=null');
const loopAt = src.indexOf('function loop(){');
assert(declAt > -1 && loopAt > -1 && declAt < loopAt, 'ring state declared above the render loop (boot-TDZ guard)');
assert(/depthWrite:false, depthTest:false/.test(extractFunction('_ensureBrushRing', src)), 'reads on slopes and through props');

done('build 877: a live brush cursor — radius, soft-edge core and mode colour, gone the moment play starts');
