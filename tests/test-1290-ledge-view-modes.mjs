import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1290: the ledge grab probed along `forward` — the MOVEMENT BASIS. Build 874 makes that basis
// SCREEN-relative in the fixed-camera views, and side-scroll sets it to the literal ZERO VECTOR (the lane
// lives in `right`), so `wish.dot(forward) > 0.5` was `0 > 0.5` on every frame and a 2.5D platformer could
// not ledge-grab AT ALL. With build 1103's cursor aim the basis is the FROZEN camera yaw while the body
// runs wherever the stick points, so the probe went where the camera looked instead of where the character
// was going.
//
// Measured live, side view, same box and same approach:
//   before — the player runs straight past it, NO GRAB on any frame
//   after  — hang at hy 1.75, grab direction +X, _ledge.yaw -1.57 (facing +X, the wall it grabbed)
// First and third person re-measured after the change: 1.75 in both, unchanged.

// ---------------------------------------------------------------- the gate, executed
const V3 = (x, y, z) => ({
  x, y, z,
  lengthSq() { return x * x + y * y + z * z; },
  dot(o) { return x * o.x + y * o.y + z * o.z; },
});
const GATE = (() => {
  const m = src.match(/const _gPush = ([^;]+);/);
  assert(m, 'the push test is one named expression');
  return new Function('_gScreen', 'wish', 'forward', 'return ' + m[1] + ';');
})();
const FWD = 'const _gScreen = (_vm874!==\'fps\') || (typeof chaseCursorOn===\'function\' && chaseCursorOn());';
{
  const F = V3(0, 0, -1);           // first-person forward
  // FIRST PERSON IS UNTOUCHED — it is the view where the grab must also mean "toward where you are LOOKING"
  eq(GATE(false, V3(0, 0, -1), F), true, 'fps: pushing forward grabs');
  eq(GATE(false, V3(1, 0, -1), F), true, 'fps: forward+strafe still counts');
  eq(GATE(false, V3(1, 0, 0), F), false, 'fps: pure strafe does NOT grab — a ledge grab there is deliberate');
  eq(GATE(false, V3(0, 0, 1), F), false, 'fps: backing away never grabs');
  eq(GATE(false, V3(0, 0, 0), F), false, 'fps: standing still never grabs');

  // THE BUG: side-scroll's basis is the zero vector, so the old test could not pass for any input
  const ZERO = V3(0, 0, 0);
  eq(V3(1, 0, 0).dot(ZERO) > 0.5, false, 'the premise: dot against a zero basis is 0 for EVERY input');
  eq(GATE(true, V3(1, 0, 0), ZERO), true, 'side: running along the lane into a wall now grabs');
  eq(GATE(true, V3(-1, 0, 0), ZERO), true, '...in either direction');
  eq(GATE(true, V3(0, 0, 0), ZERO), false, '...but standing still still does not');
  eq(GATE(true, V3(0.4, 0, 0), ZERO), false, 'a barely-touched analog stick does not grab (0.25 of full push)');
  eq(GATE(true, V3(0.6, 0, 0), ZERO), true, '...a real push does');
}
{ // the direction: screen-relative views probe where the push GOES, fps keeps its basis
  const m = src.match(/const _gFwd = ([^;]+);/);
  assert(m, 'the grab direction is one named expression');
  const mk = () => { let v = { x: 0, y: 0, z: 0 }; return {
    copy(o) { v = { x: o.x, y: o.y, z: o.z }; return this; },
    setY(y) { v.y = y; return this; },
    normalize() { const l = Math.hypot(v.x, v.y, v.z) || 1; v.x /= l; v.y /= l; v.z /= l; return this; },
    get x() { return v.x; }, get z() { return v.z; } }; };
  const DIR = new Function('_gScreen', 'wish', 'forward', '_mvGrab', 'return ' + m[1] + ';');
  const F = V3(0, 0, -1);
  eq(DIR(false, V3(1, 0, -1), F, mk()), F, 'fps: the basis itself, object-identical — that path is untouched');
  const side = DIR(true, V3(3, 0, 0), V3(0, 0, 0), mk());
  near(side.x, 1, 1e-9, 'side: the lane direction, normalised');
  near(side.z, 0, 1e-9);
  const diag = DIR(true, V3(0, 0, -5), V3(9, 9, 9), mk());
  near(diag.z, -1, 1e-9, 'top-down: wherever the stick points, not wherever the camera basis does');
  eq(DIR(true, V3(0, 0, 0), F, mk()), F, 'no push at all falls back to the basis rather than a zero probe');
  // it must be MODULE SCRATCH — build 1168 removed exactly this class of per-frame allocation
  assert(/const _mvFwd=new THREE\.Vector3\(\).*_mvGrab=new THREE\.Vector3\(\)/.test(src),
    'the grab vector is module scratch beside the other movement vectors (build 1168)');
  assert(!/_gFwd\s*=\s*new THREE\.Vector3/.test(src), '...never allocated per frame');
}

// ---------------------------------------------------------------- every probe in the block follows it
{
  const mv = src.slice(src.indexOf('// build 1290: `forward` is the movement BASIS'));
  const grab = mv.slice(0, mv.indexOf('// build 1160'));
  assert(/mantleLedge\(player\.pos\.x \+ _gFwd\.x\*_sd, player\.pos\.z \+ _gFwd\.z\*_sd, _fy\)/.test(grab),
    'the reach scan probes along the grab direction');
  assert(/const _fx = player\.pos\.x \+ _gFwd\.x\*_pd, _fz = player\.pos\.z \+ _gFwd\.z\*_pd;/.test(grab),
    '...and so does the contact point it settles on');
  assert(/surfaceTopAt\(player\.pos\.x\+_gFwd\.x\*_d, player\.pos\.z\+_gFwd\.z\*_d/.test(grab),
    '...and the wall-face walk (build 966)');
  assert(/_hx=player\.pos\.x\+_gFwd\.x\*\(_fd-_gap\), _hz=player\.pos\.z\+_gFwd\.z\*\(_fd-_gap\)/.test(grab),
    '...and the chest anchor off that face');
  assert(/tx:_fx \+ _gFwd\.x\*0\.35, tz:_fz \+ _gFwd\.z\*0\.35/.test(grab), '...and the pull-up landing spot');
  // NOTHING may still read the raw basis, or one probe lands somewhere else than the other four
  const probes = grab.slice(grab.indexOf('let _lt = null'));
  assert(!/forward\.[xz]/.test(probes), 'no probe in the grab still reads the raw movement basis');
}
{ // the hang faces the WALL, not the cursor — in the twin-stick views player.yaw points at the crosshair
  const mv = src.slice(src.indexOf('// build 1290: `forward` is the movement BASIS'));
  const grab = mv.slice(0, mv.indexOf('// build 1160'));
  assert(/yaw:Math\.atan2\(-_gFwd\.x, -_gFwd\.z\)/.test(grab),
    'the hang yaw is derived from the grab direction, not from player.yaw');
  // the engine's forward is (-sin yaw, -cos yaw), so this is the inverse of that and nothing else
  const yawOf = new Function('gx', 'gz', 'return Math.atan2(-gx, -gz);');
  for (const [gx, gz] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.6, -0.8]]) {
    const y = yawOf(gx, gz);
    near(-Math.sin(y), gx, 1e-9, 'the yaw round-trips to the grab direction (x)');
    near(-Math.cos(y), gz, 1e-9, '...and (z)');
  }
  near(yawOf(1, 0), -Math.PI / 2, 1e-9, 'measured live in side view: grabbing toward +X gives yaw -1.57');
}
{ // the DROP steps back off the wall that was grabbed, not off this frame's basis
  const dropLine = src.slice(src.indexOf("if(_ledge.t >= LEDGE_DROP_DUR)"));
  assert(/player\.pos\.x -= \(_ledge\.gx!=null\?_ledge\.gx:forward\.x\)\*0\.25/.test(dropLine),
    'the drop backs off the grabbed wall');
  assert(/gx:_gFwd\.x, gz:_gFwd\.z/.test(src), '...which is why the record carries the direction');
  // executed: the fallback is the basis, so a record from before this build still drops sanely
  const step = new Function('_ledge', 'forward', 'return (_ledge.gx!=null?_ledge.gx:forward.x)*0.25;');
  eq(step({ gx: 1 }, { x: 0 }), 0.25, 'the remembered direction wins');
  eq(step({}, { x: -1 }), -0.25, '...and an older record falls back to the basis rather than NaN');
  eq(step({ gx: 0 }, { x: 1 }), 0, 'a zero component is a value, not a missing one');
}

// ---------------------------------------------------------------- the reasoning is recorded
{
  assert(/side-scroll sets it to the ZERO VECTOR/.test(src), 'the mechanism is written down');
  assert(/could never pass and a 2.5D platformer could not ledge-grab at\n  \/\/ all/.test(src),
    '...along with what it cost');
  assert(/The first-person test is untouched/.test(src),
    '...and that the view which already worked was deliberately left alone');
}

done('build 1290: the ledge grab probes where the character is GOING — `forward` is the movement basis, which build 874 makes screen-relative in the fixed-camera views and sets to the literal ZERO VECTOR in side-scroll, so the gate was `0 > 0.5` on every frame and a 2.5D platformer could never ledge-grab (measured: the player runs straight past the box; after, it hangs at 1.75 facing the wall). Cursor-aim probed where the camera looked rather than where the body ran. The first-person test is byte-identical, all five probes and the hang yaw and the drop now follow one direction, and it is module scratch so build 1168 does not come back');
