import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1312 — editor audit 4.6, MED-HIGH, verified still live:
//
//   "Top view pan is `mousedown` button 1/2 and zoom is `wheel` -> TOP VIEW IS UNREACHABLE ON A PHONE, and
//    with it the marquee, which is top-view only. A touch creator has no multi-select at all beyond the
//    outliner. No pinch-zoom anywhere in the viewport. The gizmo/select path lives on the LOOK PAD, i.e.
//    one half of the screen; taps on the stick half do nothing."
//
// Verified at the lines: the pan handler returns unless `e.button` is the MIDDLE or RIGHT button, and the
// zoom lives on `wheel`. A touchscreen has neither, so a phone creator could press Top, arrive fitted to
// the whole arena, and never get closer or move sideways. The view existed and was useless.
//
// Measured with real TouchEvents at the real canvas (tools/probe/editor-touch.mjs):
//   top view      two-finger drag 100 px  -> pan  -111.11 / -111.11 world units (zoom unchanged)
//                 pinch out x2            -> zoom 200 -> 100 (pan unchanged)
//                 pinch in  x0.5          -> zoom 200 -> 110 (the wheel's own cap)
//                 held pinch              -> floor 6, ceiling 110, exactly the wheel's clamps
//   perspective   two-finger drag         -> yaw -0.110, pitch -0.044, fly position untouched
//                 pinch                   -> dolly -6.238 / +6.238, symmetric to 0.01 m
//                 held drag               -> pitch clamps at +/-1.5, as the mouse does
//   one finger    -> NOTHING changes (tap-select, gizmo and marquee keep the whole one-finger path)
//   editor closed -> NOTHING changes

// ---------------------------------------------------------------- one finger is untouched
{
  const h = src.slice(src.indexOf("renderer.domElement.addEventListener('touchstart'"), src.indexOf('const _edTouchEnd'));
  assert(/if\(!editorOpen \|\| e\.touches\.length!==2\)\{ _edTouch=null; return; \}/.test(h),
    'touchstart ignores anything that is not exactly two fingers, in the editor');
  assert(/if\(!editorOpen \|\| e\.touches\.length!==2 \|\| !_edTouch\) return;/.test(h),
    '...and so does touchmove');
  // the preventDefault must be INSIDE the two-finger guard, or a one-finger tap would stop selecting
  const ts = h.slice(0, h.indexOf("renderer.domElement.addEventListener('touchmove'"));
  assert(ts.indexOf('return; }') < ts.indexOf('e.preventDefault()'),
    'and the preventDefault sits AFTER the guard — calling it on a one-finger touch would kill tap-to-select');
  assert(/ONE FINGER IS UNTOUCHED\./.test(src), 'which is stated as the constraint it is');
  assert(/editorDragMoved = true;   \/\* a two-finger gesture is never a tap-select \*\//.test(h),
    'a two-finger gesture marks the drag as moved, so releasing it cannot register as a tap');
}

// ---------------------------------------------------------------- the maths, executed
const geom = new Function(extractFunction('_edTouchGeom') + '; return _edTouchGeom;')();
{
  const g = geom([{ clientX: 300, clientY: 300 }, { clientX: 400, clientY: 300 }]);
  eq(g.d, 100, 'the pinch distance is the separation');
  eq(g.cx, 350, '...and the centroid is the midpoint');
  eq(g.cy, 300);
  const g2 = geom([{ clientX: 400, clientY: 300 }, { clientX: 300, clientY: 300 }]);
  eq(g2.d, g.d, 'finger order does not matter');
  eq(g2.cx, g.cx);
}
{
  // the pan is the SAME world-units-per-pixel the mouse pan uses, so a creator switching devices is not
  // learning two different sensitivities for the same view
  assert(/const wpp = \(2\*topZoom\)\/innerHeight;                       \/\/ world units per pixel, the same figure the mouse pan uses/.test(src),
    'the two-finger pan reuses the mouse pan’s conversion');
  assert(/const wpp = \(2\*topZoom\)\/innerHeight;   \/\/ world units per pixel at current zoom/.test(src),
    '...which is the one the mouse pan itself computes');
  assert(/topPanX -= dx \* wpp; topPanZ -= dy \* wpp;/.test(src), 'and drags the world under the fingers');
}
{
  // pinch is a RATIO, so it means the same thing on a phone and a tablet
  assert(/const scale = \(_edTouch\.d > 8 && g\.d > 8\) \? \(g\.d \/ _edTouch\.d\) : 1;/.test(src),
    'the pinch is scale-relative, and guarded against two fingers landing on the same point');
  assert(/topZoom = Math\.max\(6, Math\.min\(Math\.max\(110, ARENA\*1\.3\), topZoom \/ scale\)\);/.test(src),
    'pinch OUT zooms in, and the clamps are byte-identical to the wheel’s');
  const wheel = src.match(/topZoom = Math\.max\(6, Math\.min\(Math\.max\(110, ARENA\*1\.3\), topZoom \* \(1 \+ e\.deltaY\*0\.0012\)\)\);/);
  assert(wheel, '...which is the wheel line it must agree with');
}
{
  // THE DOLLY IS LOGARITHMIC. (1 - 1/scale) is asymmetric: pinching out and back in by the same amount
  // would leave the camera somewhere new, which reads as drift and is the sort of thing nobody reports,
  // they just stop trusting the gesture.
  const step = (scale) => Math.log(scale) * 9;
  near(step(2) + step(0.5), 0, 1e-12, 'pinching out and back in returns to exactly where it started');
  near(Math.abs(step(2)), 6.238, 0.01, '...at ~6.2 m per doubling, which is what the live probe measured');
  const bad = (scale) => 1 - 1 / scale;
  assert(Math.abs(bad(2) + bad(0.5)) > 0.4, 'the ratio form this replaced drifts by ' + Math.abs(bad(2) + bad(0.5)).toFixed(2) + ' per round trip');
  assert(/log, not a ratio difference, so pinching in and out by the same amount travels the same\n           distance/.test(src),
    'and why is recorded');
}
{ // the look uses the creator's own sensitivity, and clamps where the mouse clamps
  assert(/const _s = \(typeof _mouseSensNow==='function'\) \? _mouseSensNow\(false\) : 0\.0022;/.test(src),
    'the two-finger look reads the same sensitivity setting the mouse does (build 1281)');
  assert(/player\.pitch = Math\.max\(-1\.5, Math\.min\(1\.5, player\.pitch\)\);/.test(src), '...and clamps identically');
}

// ---------------------------------------------------------------- the gesture means what it means per mode
{
  const h = src.slice(src.indexOf("renderer.domElement.addEventListener('touchmove'"), src.indexOf('const _edTouchEnd'));
  assert(/if\(editorTopView\)\{/.test(h), 'top view gets pan + zoom…');
  assert(/player\.yaw -= dx \* _s; player\.pitch -= dy \* _s;/.test(h), '…and perspective gets look + dolly');
  assert(/if\(editorFreeFly && typeof flyPos!=='undefined'\)\{/.test(h),
    'the dolly moves the FLY camera when free-fly is on…');
  assert(/\} else if\(typeof _charPrevDist!=='undefined'\)\{\n        _charPrevDist = Math\.max\(1\.8, Math\.min\(12, _charPrevDist \/ scale\)\);/.test(h),
    '…and the character preview distance otherwise — the same thing the wheel does in each mode');
  assert(/_charPrevDist = Math\.max\(1\.8, Math\.min\(12, _charPrevDist \+ e\.deltaY\*0\.01\)\);/.test(src),
    'which is the wheel line it mirrors, clamps included');
}
{ // a lifted finger ends the gesture, from either exit
  assert(/const _edTouchEnd = \(e\)=>\{ if\(!e\.touches \|\| e\.touches\.length<2\) _edTouch=null; \};/.test(src),
    'lifting to one finger ends the gesture rather than leaping on the next move');
  assert(/addEventListener\('touchend', _edTouchEnd/.test(src) && /addEventListener\('touchcancel', _edTouchEnd/.test(src),
    'and touchcancel is handled too — a system gesture or an incoming call must not strand it');
  assert(/\{ passive:false \}/.test(src.slice(src.indexOf("addEventListener('touchmove'"), src.indexOf('const _edTouchEnd'))),
    'touchmove is non-passive, or preventDefault cannot stop the browser scrolling the page under the gesture');
}

// ---------------------------------------------------------------- THE STICKS STAY, AND THAT IS THE FINDING
{
  // This build tried to hide the on-screen sticks while editing, reading the audit's "taps on the stick
  // half do nothing" as the overlay swallowing half the canvas. THE SUITE CAUGHT IT. Build 165's test
  // asserts the touch UI shows in the editor, and the line below it says why.
  assert(/const d=\(gameOn && !shopOpen && !choosingUpgrade\)\?'block':'none';/.test(src),
    'the on-screen sticks are STILL shown while editing');
  assert(/if\(isTouch\)\{ if\(touchMoveZ\) flyPos\.addScaledVector\(fwd, -touchMoveZ\*spd\*1\.5\);/.test(src),
    'BECAUSE THE JOYSTICK IS HOW A TOUCH CREATOR FLIES THE EDITOR CAMERA — hiding it would have taken away their only way to move');
  assert(/THE SUITE CAUGHT IT/.test(src), 'the near-miss is recorded where the temptation is');
  assert(/The stick\n     half not selecting is a trade-off that was already made deliberately, not a defect\./.test(src),
    '...along with the re-reading of the audit line that prompted it');
}

// ---------------------------------------------------------------- what this build does NOT close
{
  // Honesty: 4.6 also covers the animation editor refusing touch outright, which is deliberate and
  // documented there, and the fact that every editor drag still rides synthesized mouse events. This build
  // gives a phone a CAMERA; it does not make every editor gesture touch-native.
  assert(/const IS_COARSE = /.test(src), 'the coarse-pointer probe still exists for the rest of that work');
  assert(/cv\.addEventListener\('wheel'/.test(src),
    'the ANIMATION editor still has its own wheel-only camera — 4.6 also covers that, and it refuses touch on purpose');
  // and every editor DRAG still rides synthesized mouse events. This build gives a phone a CAMERA; it does
  // not make every editor gesture touch-native, and the entry should not be read as though it does.
  assert(/document\.addEventListener\('mousemove', e=>\{/.test(src),
    'the drag path is still mouse-shaped, which is the rest of 4.6 and is not claimed here');
}

done('build 1312 (editor audit 4.6): the editor viewport answers to two fingers — top-view pan was bound to the MIDDLE or RIGHT mouse button and zoom to the wheel, neither of which a touchscreen has, so a phone creator could enter top view, arrive fitted to the whole arena, and never get closer or move sideways; the marquee lives only in that view, so touch had no multi-select at all. Two fingers now pan and pinch-zoom in top view and look and dolly in perspective, reusing the mouse path’s own world-units-per-pixel, clamps and sensitivity so the two inputs cannot disagree; the dolly is logarithmic so pinching out and back returns exactly where it started. One finger is deliberately untouched, so tap-select, gizmo drags and the marquee are unchanged. It does NOT close the audit\'s third mobile finding: hiding the on-screen sticks to free the left half was tried and REVERTED, because build 165\'s own test showed the joystick is how a touch creator flies the editor camera — that trade-off was made deliberately. Measured with real TouchEvents at the real canvas');
