// build 1368: "Frame the selection" frames the SELECTION, and the Transform fold edits it.
// (editor critic #2 + #3)
//
// #2 — _edFrameSelected resolved through selectedSceneObject(), the PRIMARY, never reading
// activeSel(): three props at x 0/60/120 all selected framed the camera a couple of metres from
// the first and ~120 m from the last. Three shipped flows advertise multi-frame — the asset
// browser's select-every-copy, Level Check -> click the issue, and the F key — and every one of
// them framed one member. The union of the members' boxes repairs all three at once.
// #3 — the Transform fold's field commit wrote tgt.state then tgt.apply(): the PRIMARY only,
// while the gizmo beside it is fully group-aware (applyGroupDrag) and build 1299 put banners on
// every other fold for exactly this defect. The fold now applies the gizmo's group semantics —
// position/rotation as a DELTA, scale as a RATIO — and states the rule with 1299's banner.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. union framing, executed
{
  const fn = extractFunction('_edFrameSelected');
  assert(/_frmBox\.union\(_frmOne\)/.test(fn), 'a multi-selection unions its members’ boxes');
  assert(/_frmBox\.makeEmpty\(\)/.test(fn), '...starting from an empty box, never a stale one');
  assert(/\(_m\.userData && _m\.userData\.marker\) \? _m\.userData\.marker : _m/.test(fn),
    'each member takes the light-marker substitution individually, so a row of lamps frames its markers');
  assert(/typeof selPickup!=='undefined' && selPickup>=0/.test(fn),
    'a selected pickup marker keeps the single-object path — selProps can sit stale beside it');
  assert(/_frmBox\.setFromObject\(t, true\)/.test(fn), 'the single-selection path is the pre-1368 code');

  class V3 { constructor(){ this.x=0; this.y=0; this.z=0; }
    set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
    length(){ return Math.hypot(this.x,this.y,this.z); } }
  class B3 { constructor(){ this.makeEmpty(); }
    makeEmpty(){ this.min={x:Infinity,y:Infinity,z:Infinity}; this.max={x:-Infinity,y:-Infinity,z:-Infinity}; return this; }
    isEmpty(){ return this.max.x < this.min.x; }
    setFromObject(o){ const b=o._box; this.min={x:b.min.x,y:b.min.y,z:b.min.z}; this.max={x:b.max.x,y:b.max.y,z:b.max.z}; return this; }
    union(b){ for(const a of ['x','y','z']){ this.min[a]=Math.min(this.min[a],b.min[a]); this.max[a]=Math.max(this.max[a],b.max[a]); } return this; }
    getCenter(v){ return v.set((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,(this.min.z+this.max.z)/2); }
    getSize(v){ return v.set(this.max.x-this.min.x,this.max.y-this.min.y,this.max.z-this.min.z); } }
  const prop = (x)=>({ userData:{}, _box:{ min:{x:x-1,y:0,z:-1}, max:{x:x+1,y:2,z:1} } });
  const props = [prop(0), prop(60), prop(120)];
  const camera = { near:0.1, fov:78 };
  const player = { yaw:0, pitch:0 };
  const flyPos = new V3();
  const run = (groupOn, pickup)=>{
    flyPos.set(0, 5, 200);
    const f = new Function('selectedSceneObject','isGroupSel','activeSel','selPickup',
      '_frmBox','_frmOne','_frmCtr','_frmSz','camera','flyPos','player','Math','isFinite',
      'editorTopView','editorFreeFly','flyInit','renderEditorFields',
      extractFunction('_edFrameSelected') + '; return _edFrameSelected;')(
      ()=>props[0], ()=>groupOn, ()=>props, pickup,
      new B3(), new B3(), new V3(), new V3(), camera, flyPos, player, Math, isFinite,
      false, false, false, ()=>{});
    return f();
  };

  // single selection: today's numbers exactly — the primary's own box, its own distance
  assert(run(false, -1) === true, 'single-selection framing succeeds');
  const r1 = Math.max(0.6, Math.hypot(2,2,2)*0.5);
  const d1 = Math.max(camera.near*4, r1/Math.tan(camera.fov*Math.PI/360)*1.6);
  near(Math.hypot(flyPos.x-0, flyPos.y-1, flyPos.z-0), d1, 1e-6,
    'one object frames at the pre-1368 distance from ITS centre (' + d1.toFixed(2) + ' m)');
  const farBefore = Math.hypot(flyPos.x-120, flyPos.y-1, flyPos.z-0);
  assert(farBefore > 100, 'which would leave the far member ' + farBefore.toFixed(0) + ' m away — the defect this build removes for groups');

  // all three selected: the camera aims at the UNION centre from a distance derived from the union radius
  assert(run(true, -1) === true, 'multi-selection framing succeeds');
  const cx=60, cy=1, cz=0;
  const fwd=[-Math.sin(player.yaw)*Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw)*Math.cos(player.pitch)];
  const to=[cx-flyPos.x, cy-flyPos.y, cz-flyPos.z]; const tl=Math.hypot(...to);
  for(let i=0;i<3;i++) near(fwd[i], to[i]/tl, 1e-6, 'the camera looks at the union centre (axis '+i+')');
  const rU = Math.hypot(122,2,2)*0.5;
  const dU = Math.max(camera.near*4, rU/Math.tan(camera.fov*Math.PI/360)*1.6);
  near(Math.hypot(flyPos.x-cx, flyPos.y-cy, flyPos.z-cz), dU, 1e-6,
    'the distance derives from the union radius (' + dU.toFixed(1) + ' m)');
  assert(dU > 61, 'so the pull-back covers the 120 m spread — larger than the half-spread');
  for(const p of props){
    const mx=(p._box.min.x+p._box.max.x)/2;
    const dm=Math.hypot(flyPos.x-mx, flyPos.y-1, flyPos.z-0);
    assert(dm < dU + 62, 'the member at x='+mx+' is inside the framed volume ('+dm.toFixed(1)+' m)');
  }

  // a selected pickup keeps the single path even while a group selection exists beside it
  run(true, 2);
  near(Math.hypot(flyPos.x-0, flyPos.y-1, flyPos.z-0), d1, 1e-6,
    'a pickup selection frames the pickup’s own object, never the stale prop union');

  // a null member and a member with a broken box are skipped, not fatal
  const held = props[1];
  props[1] = null;
  assert(run(true, -1) === true, 'a null hole in the selection is skipped');
  props[1] = { userData:{}, _box:{ min:{x:NaN,y:0,z:-1}, max:{x:NaN,y:2,z:1} } };
  assert(run(true, -1) === true, 'a non-finite member box is skipped, and the rest still frame');
  props[1] = held;
}

// ---------------------------------------------------------------- 2. the group apply, executed
{
  const fnSrc = extractFunction('_xfGroupApply');
  assert(!/pushUndoSnapshot/.test(fnSrc),
    'no snapshot inside the group apply — the gesture handlers own the ONE snapshot per gesture (build 1163)');
  let collider=0, retile=0, home=0;
  const mkProp = (x)=>({ position:{x, y:0, z:0}, rotation:{x:0, y:0, z:0},
    scale:{ x:1, y:2, z:1, multiplyScalar(r){ this.x*=r; this.y*=r; this.z*=r; return this; } }, userData:{} });
  let a, b, c, selProps;
  const build = ()=>{ a=mkProp(0); b=mkProp(10); c=mkProp(25); b.scale.x=2; selProps=[a,b,c]; collider=retile=home=0; };
  const mk = (active, open)=> new Function('editorOpen','editorActive','selProps','editorTargets','RAD',
    'retileProcSurface','_propProcSpan','refreshPropCollider','_homeSync','Math','isFinite',
    fnSrc + '; return _xfGroupApply;')(
    open, active, selProps, { props:{ obj:()=>a } }, Math.PI/180,
    ()=>{ retile++; }, ()=>1, ()=>{ collider++; }, ()=>{ home++; }, Math, isFinite);

  // position: an additive delta — member OFFSETS are preserved (1299's group-rigidity property)
  build(); let f = mk('props', true);
  assert(f('px', 0, 4) === true, 'a position edit reaches the group');
  eq(b.position.x, 14, 'member moved by the delta, from its OWN position');
  eq(c.position.x, 29, 'so did the far one');
  eq(c.position.x - b.position.x, 15, 'the offset between members is untouched — the cluster stays rigid');
  eq(a.position.x, 0, 'the primary is left to tgt.apply() — no double move');
  eq(collider, 2, 'each moved member got the gizmo’s own collider refresh');
  eq(retile, 2, '...and the grain retile (build 1139)'); eq(home, 2, '...and _homeSync (build 713)');
  assert(f('px', 5, 5) === false, 'a zero delta refuses instead of doing per-member no-op work');

  // rotation: the fields are DEGREES, the scene is radians
  build(); f = mk('props', true);
  f('ry', 0, 90);
  near(b.rotation.y, Math.PI/2, 1e-9, 'a 90° field delta turns a member 90°');
  near(c.rotation.y, Math.PI/2, 1e-9, 'both members');
  eq(a.rotation.y, 0, 'primary untouched here too');

  // scale: a RATIO, so mixed member sizes stay proportional
  build(); f = mk('props', true);
  f('sx', 1, 2);
  eq(b.scale.x, 4, 'a member at scale 2 doubles to 4 — ratio, never the primary’s absolute');
  eq(c.scale.x, 2, 'a member at scale 1 doubles to 2');
  eq(b.scale.y, 2, 'the axes not being edited stay put');

  // the divide-by-~0 guard
  build(); f = mk('props', true);
  assert(f('sx', 0, 5) === false, 'a ratio against 0 refuses');
  assert(f('sx', 1e-9, 5) === false, 'a ratio against ~0 refuses');
  assert(f('sx', 1, -2) === false, 'a non-positive ratio refuses');
  eq(b.scale.x, 2, 'and nothing moved');

  // proportional ON: the ratio spreads to every member axis, like the gizmo's uniform handle
  build(); f = mk('props', true);
  f('sy', 2, 4, true);
  eq(b.scale.x, 4, 'uniform: x doubled'); eq(b.scale.y, 4, 'y doubled'); eq(b.scale.z, 2, 'z doubled');

  // scoped to props: lights and zones keep their single-target transform fields
  build(); f = mk('lights', true);
  assert(f('px', 0, 4) === false, 'editorActive lights: refused');
  eq(b.position.x, 10, 'and nothing moved');
  build(); selProps=[a]; f = mk('props', true);
  assert(f('px', 0, 4) === false, 'a single selection is not a group');
  build(); f = mk('props', false);
  assert(f('px', 0, 4) === false, 'editor closed: refused');
}

// ---------------------------------------------------------------- 3. the wiring
{
  assert(src.includes('const _xfOld = tgt.state[fld.k];'),
    'the commit captures the primary’s OLD value before any mutation — the delta needs it');
  assert(src.includes('tgt.apply(); if(tgt===editorTargets.props) _xfGroupApply(fld.k, _xfOld, tgt.state[fld.k], isScale && scaleProportional); updateGizmo(); updateEditorOut();'),
    'the group apply runs AFTER the primary’s own apply, gated to the props target, before the gizmo/readout refresh');
  // one snapshot per gesture, unchanged (build 1163) — the members ride the same snapshot
  assert(/rng\.addEventListener\('mousedown', \(\)=>pushUndoSnapshot\(\)\);/.test(src), 'the slider’s gesture snapshot is intact');
  assert(/num\.addEventListener\('focus', \(\)=>pushUndoSnapshot\(\)\);/.test(src), 'the number field’s gesture snapshot is intact');
  // the banner states the rule (build 1299), in the applies-to-all colour, props only
  assert(src.includes("if(editorActive==='props' && typeof _selBanner==='function') _selBanner(host, _selTargets().length, true);"),
    'the Transform fold announces group-wide — for props, where the fields now follow the selection');
// build 1438: the Signals fold joined them, with TWO banners — Tag/Needs are group-wide while the signal
// list stays per-object, so each rule is stated above the rows it governs.
  eq((src.match(/_selBanner\(/g) || []).length, 8,
    'the banner call-site count grew by exactly one — the Transform fold joined the announced folds');
}

done('build 1368: framing covers the whole selection, and the Transform fold edits all of it');
