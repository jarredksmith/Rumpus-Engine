import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1377 — editor audit #5, the cheap half: the editor had NO ORBIT. Fly-mode drag is a first-person
// look, so turning to inspect a prop swings it off screen; every competitor orbits (Alt+drag or MMB).
// Alt+LMB and MMB now orbit the fly camera about a pivot captured ONCE at drag start.
//
// THE INPUT RULE, chosen after verifying what each input already meant:
//   Alt+LMB over a PROP  -> the build-441 drag-duplicate, UNCHANGED (its branch runs FIRST in the handler)
//   Alt+LMB, empty space -> orbit
//   MMB in fly mode      -> orbit (verified free: the pan handler acts only in top view, the in-game grab
//                           returns while editorOpen, the vcam orbit requires gameOn without editorOpen)
//   top view / walk mode / plain drag-look / WASD / gizmo / marquee / two-finger touch (1312): untouched

// ---------------------------------------------------------------- the orbit maths, executed
const from = new Function(extractFunction('_edOrbitFrom', src) + '; return _edOrbitFrom;')();
const step = new Function(extractFunction('_edOrbitStep', src) + '; return _edOrbitStep;')();
// the engine look basis: forward = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch))
const fwd = (yaw, pitch) => { const cp = Math.cos(pitch); return [-Math.sin(yaw)*cp, Math.sin(pitch), -Math.cos(yaw)*cp]; };
const dist = (o, ob) => Math.hypot(o.x-ob.px, o.y-ob.py, o.z-ob.pz);
const facing = (ob, o, msg) => {   // pivot minus camera, normalized, must BE the forward of (yaw, pitch)
  const f = fwd(ob.yaw, ob.pitch), d = [ob.px-o.x, ob.py-o.y, ob.pz-o.z], L = Math.hypot(d[0], d[1], d[2]);
  near(d[0]/L, f[0], 1e-9, msg + ' (x)'); near(d[1]/L, f[1], 1e-9, msg + ' (y)'); near(d[2]/L, f[2], 1e-9, msg + ' (z)');
};

{ // capture round-trip: a zero step re-derives the captured camera position exactly
  const ob = from(2, 1, -3, 6, 4, 5);
  near(ob.r, Math.hypot(4, 3, 8), 1e-12, 'the captured radius is the true pivot-to-camera distance');
  const o = step(ob, 0, 0, { x:0, y:0, z:0 });
  near(o.x, 6, 1e-9, 'a zero step re-derives the camera x'); near(o.y, 4, 1e-9, '...y'); near(o.z, 5, 1e-9, '...z');
  facing(ob, o, 'and the derived yaw/pitch face the pivot from there');
  assert(ob.pitch < 0, 'a camera above the pivot captures NEGATIVE pitch (looking down) — the engine sign');
}
{ // radius preserved through 90 degrees, and through fifty arbitrary steps
  const ob = from(10, 2, -4, 16, 7, 4);
  const r0 = ob.r, o = { x:0, y:0, z:0 };
  step(ob, Math.PI/2, 0, o);
  near(dist(o, ob), r0, 1e-9, 'a quarter turn of yaw keeps the exact radius');
  facing(ob, o, 'and still faces the pivot');
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for(let i = 0; i < 50; i++) step(ob, rnd(), rnd() * 0.4, o);
  near(dist(o, ob), r0, 1e-9, 'fifty arbitrary steps later the radius has not drifted — the position is re-derived, never integrated');
  facing(ob, o, 'and the fiftieth step still faces the pivot');
}
{ // pitch clamps at the look drag clamp, and facing survives the clamp
  const ob = from(0, 0, 0, 8, 0, 0), o = { x:0, y:0, z:0 };
  for(let i = 0; i < 10; i++) step(ob, 0, -0.5, o);
  eq(ob.pitch, -1.5, 'pitch clamps at -1.5 — the look drag clamp');
  facing(ob, o, 'a clamped step still faces the pivot (the position is derived FROM the clamped pitch)');
  for(let i = 0; i < 20; i++) step(ob, 0, 0.5, o);
  eq(ob.pitch, 1.5, '...and at +1.5');
  near(dist(o, ob), ob.r, 1e-9, 'clamped steps keep the radius too');
}
{ // yaw wraps: a full turn returns the camera to its start, facing the pivot the whole way round
  const o0 = step(from(-3, 5, 7, 4, 9, -2), 0, 0, { x:0, y:0, z:0 });
  const ob = from(-3, 5, 7, 4, 9, -2), o = { x:0, y:0, z:0 };
  for(let i = 0; i < 8; i++){ step(ob, Math.PI/4, 0, o); facing(ob, o, 'facing holds at step ' + i); }
  near(o.x, o0.x, 1e-9, 'eight 45-degree steps (2 pi of yaw) return the camera to where it began (x)');
  near(o.y, o0.y, 1e-9, '...(y)'); near(o.z, o0.z, 1e-9, '...(z)');
}
{ // degenerate captures cannot produce a broken drag
  eq(from(0, 0, 0, 0.1, 0, 0).r, 0.75, 'a pivot at the camera floors the radius — it cannot refuse to orbit');
  const ob = from(0, 0, 0, 0, 5, 0);
  eq(ob.yaw, 0, 'directly above the pivot: yaw defaults to 0 rather than NaN');
  eq(ob.pitch, -1.5, '...and the vertical pitch clamps into the legal range');
}

// ---------------------------------------------------------------- pivot resolution, executed in order
function pivot(sel, pick, player, flyPos){
  const rig = [
    'const activeSel = () => sel;',
    'const selCentroid = () => { const c = { x:0, y:0, z:0 }; for(const m of sel){ c.x += m.position.x; c.y += m.position.y; c.z += m.position.z; } const n = Math.max(1, sel.length); c.x /= n; c.y /= n; c.z /= n; return c; };',
    'const groundPointUnderPointer = () => pick;',
    extractFunction('_edOrbitPivotV', src),
    'return _edOrbitPivotV({ clientX:0, clientY:0 }, { x:NaN, y:NaN, z:NaN });'
  ].join('\n');
  return new Function('sel', 'pick', 'player', 'flyPos', rig)(sel, pick, player, flyPos);
}
{
  const PLR = { yaw: Math.PI/2, pitch: 0 };
  const FLY = { x: 10, y: 5, z: 20 };
  const p = pivot([{ position:{ x:2, y:0, z:0 } }, { position:{ x:4, y:2, z:6 } }], { x:99, y:99, z:99 }, PLR, FLY);
  eq(p.x, 3, 'a live selection outranks a cursor hit: the pivot is the union centre'); eq(p.y, 1); eq(p.z, 3);
  const p1 = pivot([{ position:{ x:7, y:3, z:-1 } }], { x:99, y:99, z:99 }, PLR, FLY);
  eq(p1.x, 7, 'a SINGLE selected member is a selection too'); eq(p1.y, 3); eq(p1.z, -1);
  const p2 = pivot([], { x:7, y:1, z:-2 }, PLR, FLY);
  eq(p2.x, 7, 'no selection: the surface under the cursor'); eq(p2.y, 1); eq(p2.z, -2);
  const p3 = pivot([], null, PLR, FLY);
  near(p3.x, 0, 1e-9, 'no selection, no surface: ~10 u ahead along the look (yaw pi/2 faces -x)');
  near(p3.y, 5, 1e-9, '...same height at pitch 0'); near(p3.z, 20, 1e-9, '...no z travel at yaw pi/2');
  // the order is pinned in the source too: selection, then the pick ray, then the 10 u fallback
  const pv = extractFunction('_edOrbitPivotV', src);
  const iSel = pv.indexOf('activeSel'), iPick = pv.indexOf('groundPointUnderPointer'), iAhead = pv.indexOf('*10');
  assert(iSel >= 0 && iPick > iSel && iAhead > iPick, 'pivot resolution order: selection -> cursor pick -> 10 u ahead');
}

// ---------------------------------------------------------------- start + move, the shipped functions executed
function mkRig(opts){
  const o = Object.assign({ top:false, fly:true, init:true, sel:[], pick:null, fx:12, fy:6, fz:30 }, opts || {});
  const rig = [
    'let editorTopView = ' + o.top + ', editorFreeFly = ' + o.fly + ', flyInit = ' + o.init + ', editorDragMoved = false;',
    'let _edOrbit = null;',
    'const player = { yaw: 0.4, pitch: -0.1, pos: { x:1, y:2, z:3 } };',
    'const flyPos = { x: ' + o.fx + ', y: ' + o.fy + ', z: ' + o.fz + ', copy(p){ this.x = p.x; this.y = p.y; this.z = p.z; } };',
    'const sel = ' + JSON.stringify(o.sel) + ', pick = ' + JSON.stringify(o.pick) + ';',
    'const activeSel = () => sel;',
    'const selCentroid = () => { const c = { x:0, y:0, z:0 }; for(const m of sel){ c.x += m.position.x; c.y += m.position.y; c.z += m.position.z; } const n = Math.max(1, sel.length); c.x /= n; c.y /= n; c.z /= n; return c; };',
    'const groundPointUnderPointer = () => pick;',
    'const _mouseSensNow = () => 0.002;',
    'const _edOrbitP = ' + extractConst('_edOrbitP', src) + ';',
    extractFunction('_edOrbitPivotV', src),
    extractFunction('_edOrbitFrom', src),
    extractFunction('_edOrbitStep', src),
    extractFunction('_edOrbitStart', src),
    extractFunction('_edOrbitMove', src),
    'return { start: (e) => _edOrbitStart(e || {}), move: (mx, my) => _edOrbitMove({ movementX: mx, movementY: my }),',
    '         st: () => ({ orbit: _edOrbit, x: flyPos.x, y: flyPos.y, z: flyPos.z, yaw: player.yaw, pitch: player.pitch, moved: editorDragMoved, init: flyInit }) };'
  ].join('\n');
  return new Function(rig)();
}
{ // refusals: the orbit is fly-camera only (it writes flyPos)
  const top = mkRig({ top:true });
  eq(top.start(), false, 'top view refuses to start an orbit'); eq(top.st().orbit, null, '...and captures nothing');
  const walk = mkRig({ fly:false });
  eq(walk.start(), false, 'walk mode refuses too'); eq(walk.st().orbit, null);
}
{ // a real drag about a cursor pivot: fly (12,6,30), pivot (12,1,18) -> offset (0,5,12), r = 13
  const r = mkRig({ pick: { x:12, y:1, z:18 } });
  eq(r.start(), true, 'fly mode starts the orbit');
  const yaw0 = r.st().orbit.yaw;
  near(r.st().orbit.r, 13, 1e-9, 'the captured radius is the pivot-to-camera distance');
  r.move(120, 0);
  const s = r.st();
  near(Math.hypot(s.x-12, s.y-1, s.z-18), 13, 1e-9, 'after a real move the camera still sits exactly r from the pivot');
  near(s.orbit.yaw, yaw0 - 120*0.002, 1e-12, 'drag right turns the same angular direction as the look drag (yaw -= dx*sens)');
  eq(s.yaw, s.orbit.yaw, 'player.yaw is set to the orbit yaw'); eq(s.pitch, s.orbit.pitch, '...and player.pitch to the orbit pitch');
  facing(s.orbit, s, 'so the view faces the pivot');
  eq(s.moved, true, 'a 120 px move marks the drag as moved — release cannot register as a select-click');
}
{ // a negligible jiggle is still a click (the look drag threshold, > 2 px)
  const r = mkRig({ pick: { x:12, y:1, z:18 } });
  r.start(); r.move(1, 1);
  eq(r.st().moved, false, 'a 2 px jiggle does not eat the click');
}
{ // an unseeded fly camera seeds from the player first, exactly as the frame loop does
  const r = mkRig({ init:false });
  r.start();
  const s = r.st();
  eq(s.init, true, 'starting with an unseeded fly camera seeds it');
  eq(s.x, 1, '...from the player position'); eq(s.y, 2); eq(s.z, 3);
}

// ---------------------------------------------------------------- the input claim + ownership, pinned
{ // the LMB handler: Alt-duplicate FIRST (build 441 unchanged), then the empty-space orbit, then plain look
  assert(/if\(e\.altKey\)\{ const o=_pickPropAt\(e\); if\(o\)\{ e\.preventDefault\(\); pushUndoSnapshot\(\); _dupPropForDrag\(o\); _altDupActive = true; editorDragMoved = true; return 'altdup'; \} \}/.test(src),
    'the Alt-over-a-prop duplicate branch is byte-identical — this build did not touch it');
  /* build 1444 SPLIT this line: the marquee moved into the shared press chain (_edPressDown) and the orbit
     claim stayed here, so that a finger runs the same priority order a mouse does. The ordering this
     asserts is unchanged and is now structural — the duplicate branch is INSIDE the chain, which the
     mousedown handler runs before it considers an orbit at all. */
  const iAlt = src.indexOf('if(e.altKey){ const o=_pickPropAt(e);');
  const iChain = src.indexOf('if(_edPressDown(e)) return;');
  const iClaim = src.indexOf('if(!(e.altKey && editorFreeFly && _edOrbitStart(e))) editorDragLook = true;');
  assert(iAlt >= 0 && iChain >= 0 && iClaim > iChain,
    'the duplicate branch runs BEFORE the orbit claim: Alt over a prop duplicates, Alt on empty space orbits');
  assert(/function _edPressDown\(e\)\{[\s\S]*?if\(e\.altKey\)\{ const o=_pickPropAt\(e\);/.test(src),
    '...because the duplicate lives in the chain the mousedown handler consults first');
}
{ // MMB: claimed in the fly branch of the pan handler, which still pans top view exactly as before
  assert(/e\.button!==1 && e\.button!==2\)\) return; if\(editorTopView\)\{ editorDragPan=true; editorDragMoved=false; e\.preventDefault\(\); \} else if\(e\.button===1 && editorFreeFly && _edOrbitStart\(e\)\)\{ editorDragMoved=false; e\.preventDefault\(\); \}/.test(src),
    'MMB in fly mode starts the orbit; top view keeps its middle/right pan; RMB is not claimed');
}
{ // mousemove ownership: while an orbit is live it owns the drag — the look branch never runs
  const iOrb = src.indexOf('if(_edOrbit && !editorTopView){ _edOrbitMove(e); return; }');
  const iLook = src.indexOf('if(editorDragLook && !editorTopView){');
  assert(iOrb >= 0 && iLook > iOrb, 'the orbit branch sits before editorDragLook in the editor mousemove, and returns');
}
{ // both releases end it, the guard holds, and the sensitivity is shared
  assert(/editorDragLook = false; editorDragPan = false; _edOrbit = null;/.test(src), 'LMB release clears the orbit with the other editor drag states');
  assert(/if\(e\.button===1\) _edOrbit = null;/.test(src), 'MMB release clears it too');
  assert(/let _edOrbit = null;/.test(src), 'the live-drag state is declared with the other editor mouse states');
  assert(/if\(editorTopView \|\| !editorFreeFly\) return false;/.test(extractFunction('_edOrbitStart', src)),
    'the start refuses top view and walk mode — the orbit writes flyPos, so it is fly-camera only');
  assert(/_mouseSensNow\(false\)/.test(extractFunction('_edOrbitMove', src)),
    'orbit reads the look drag sensitivity derivation, so the two cannot drift apart');
}
{ // discoverable (build 1310: a shortcut nobody can find is not a feature)
  assert(/Alt\/MMB-drag<\/b> orbit/.test(src), 'the editor hint documents the orbit');
}

done('build 1377: editor orbit — Alt+LMB (empty space) / MMB rotate the fly camera about a captured pivot; radius and facing exact, duplicate and marquee untouched');
