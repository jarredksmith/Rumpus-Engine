// build 1413 — the chase camera's sight line is the PLAYER's, not the costume's.
//
// `centerLocal.y` is half the DRAWN model's height (and a hardcoded 1.0 for the stock capsule), so the
// third-person pivot — and with it the camera's height and everything the player can see over — was a
// property of whichever character was equipped. Measured and recorded at build 1290: a 0.5 m creature
// gives 0.25 and a 4 m mech gives 2.0, against an EYE that is 1.7 whatever the model.
//
// Build 1289 established the rule this is an instance of: A GAMEPLAY QUANTITY MUST NEVER BE DERIVED FROM
// SOMETHING ONLY THE RENDERER KNOWS. That build fixed the ledge hang, which was reading the drawn body's
// bounding box for the COLLIDER's reach; this is the same fault one function along.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

const EYE = +/const EYE = ([\d.]+);/.exec(src)[1];
const MIN = +/const TP_PIVOT_MIN = EYE \* ([\d.]+)/.exec(src)[1] * EYE;
const MAX = EYE + +/TP_PIVOT_MAX = EYE \+ ([\d.]+)/.exec(src)[1];

function rig() {
  return new Function('EYE',
    'const _TPP={x:0,y:0,z:0};\n' +
    'const TP_PIVOT_MIN = EYE * ' + (MIN / EYE) + ', TP_PIVOT_MAX = EYE + ' + (MAX - EYE) + ';\n' +
    extractFunction('_tpPivot') + '\n' +
    'return (obj, base, yaw, fb) => { const p = _tpPivot(obj, base, yaw, fb); return { x:p.x, y:p.y, z:p.z }; };')(EYE);
}

// A body whose drawn height is `h`, feet on the ground at y=0, exactly as buildAvatarVisual writes it:
//   centerLocal = { x: xoff, y: yoff + h*0.5, z: zoff }
const body = (h, xoff, zoff) => ({ userData: { centerLocal: { x: xoff || 0, y: h * 0.5, z: zoff || 0 }, footY: 0 } });
const BASE = { x: 0, y: EYE, z: 0 };

// ------------------------------------------------------------------- the bounds are the player ----
{
  assert(/const TP_PIVOT_MIN = EYE \* [\d.]+, TP_PIVOT_MAX = EYE \+ [\d.]+;/.test(src),
    'both bounds are derived from EYE — the player\'s own body, which is the same whatever the costume ' +
    'is. A pair of hardcoded metres would be the very thing this build removes, one level up');
  assert(MIN < 1.0 && MAX > 1.0,
    'and the band contains the stock capsule\'s 1.0, so the shipped body is untouched', MIN + '..' + MAX);
  assert(MIN < EYE - 0.3 && MAX > EYE - 0.3,
    '...and the no-model fallback\'s EYE-0.3, which has ALWAYS been player-derived — the two halves of ' +
    'this one function disagreed about what the pivot is for, and now they do not');
}

// ------------------------------------------------------------------ every humanoid is unchanged ----
{
  const f = rig();
  // The compatibility claim, executed rather than asserted: a model is byte-identical while its own
  // centre lies inside the band, i.e. between 2*MIN and 2*MAX tall.
  for (const h of [1.7, 1.8, 1.9, 2.0, 2.2, 2.5, 3.0, 3.4, 3.7]) {
    const p = f(body(h), BASE, 0, 0);
    near(p.y, h * 0.5, 1e-9, 'a ' + h + ' m model pivots at its own centre, exactly as before this build');
  }
  eq(f({ userData: { centerLocal: { x: 0, y: 1.0, z: 0 }, footY: 0 } }, BASE, 0, 0).y, 1.0,
    'and the STOCK capsule is byte-identical — the body every existing level was framed against');
}

// ------------------------------------------------------------------- the cases that were broken ----
{
  const f = rig();
  const tiny = f(body(0.5), BASE, 0, 0);
  eq(tiny.y, MIN,
    'a 0.5 m creature pivoted at 0.25 — ankle height, with the boom looking along the floor. It is the ' +
    'player\'s own hip now', tiny.y);
  const mech = f(body(4.0), BASE, 0, 0);
  eq(mech.y, MAX,
    'a 4 m mech pivoted at 2.0, above the player\'s head, so the camera looked DOWN at a character it ' +
    'was supposed to be behind', mech.y);
  assert(mech.y - 2.0 > -0.2,
    '...and the mech moves by centimetres, not by a stop — the cap is a bound on the pathological, not ' +
    'a re-framing of the ordinary', (mech.y - 2.0).toFixed(3));

  // the boundary, both sides
  eq(f(body(2 * MIN - 0.02), BASE, 0, 0).y, MIN, 'just under the low bound clamps');
  near(f(body(2 * MIN + 0.02), BASE, 0, 0).y, MIN + 0.01, 1e-9, '...and just over it does not');
  eq(f(body(2 * MAX + 0.02), BASE, 0, 0).y, MAX, 'just over the high bound clamps');
  near(f(body(2 * MAX - 0.02), BASE, 0, 0).y, MAX - 0.01, 1e-9, '...and just under it does not');
}

// ----------------------------------- why clamping Y is safe, and X/Z would NOT be ----
// _tpPivot's own comment says pivoting on the model's real centre "keeps ANY model on the crosshair
// while it rotates in place instead of swinging around the reticle". That is TRUE of x and z, which are
// rotated by yaw — and it is what stopped this being clamped for 120 builds. It is FALSE of y, which is
// a plain add: a vertical difference between the pivot and the model's centre is a constant screen
// offset, not a swing. Measured over a full turn rather than restated.
{
  const f = rig();
  const off = body(2.0, 0.4, 0.25);   // a model whose centre is offset horizontally as well
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const ys = new Set();
  const N = 720;   // fine enough that the sampled extremes ARE the extremes to 1e-6
  for (let i = 0; i < N; i++) {
    const p = f(off, BASE, (i / N) * Math.PI * 2, 0);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    ys.add(p.y.toFixed(9));
  }
  const swing = Math.hypot(0.4, 0.25) * 2;
  near(maxX - minX, swing, 1e-6,
    'the X offset SWINGS through a full turn — the diameter of the model\'s own horizontal offset. That ' +
    'is the behaviour the original comment protects, and this build does not touch it');
  near(maxZ - minZ, swing, 1e-6, '...and so does Z');
  eq(ys.size, 1,
    'while Y is IDENTICAL at every one of 720 headings — it is a plain add, so a vertical difference is a ' +
    'constant screen offset and can never become a swing. That is what makes the clamp safe, and it is ' +
    'the fact the function\'s own comment obscured');
}

// ------------------------------------------------------------------- nothing else moved ----
{
  const p = extractFunction('_tpPivot');
  assert(/_TPP\.x = base\.x \+ cl\.x\*cy \+ cl\.z\*sy;/.test(p) && /_TPP\.z = base\.z - cl\.x\*sy \+ cl\.z\*cy;/.test(p),
    'the horizontal terms are byte-identical');
  assert(/_TPP\.y=base\.y-0\.3;/.test(p), 'and the no-model fallback is untouched — it was already right');
  assert(/footY!=null\) \? obj\.userData\.footY : footFallback/.test(p),
    '...as is the foot resolution, so a model standing on a lift still pivots at its own feet');
  const f = rig();
  eq(f(null, BASE, 0, 0).y, EYE - 0.3, 'a body with no centerLocal still gets the upper-chest fallback');
  eq(f({ userData: {} }, BASE, 1.2, 0).x, 0, '...and no horizontal offset');
}

// ============================================================================================
// WHAT THIS DOES NOT CLOSE, stated rather than implied.
//
// Build 1290 recorded two things: the pivot is derived from the art, and "there is no authored control
// over it (`tpHeight` offsets the camera, not the pivot)". This build closes the FIRST. The second is
// now much smaller and deliberately left: with the pivot bounded to the player's own body, the spread
// across every humanoid a creator would actually equip is ~0.25 m, and `tpHeight` is a PARALLEL camera
// offset — tpCameraPushback looks along the frame's own forward, not at the pivot — so it can absorb
// that. A fifth slider would be a fifth value in `_sanitizeView` / `_snapshotView` / `_applyView` /
// `_loadPersonalView`, which is the hand-kept-list defect this file records more than any other, for a
// quarter of a metre a creator can already dial out.
// ============================================================================================
{
  const push = extractFunction('tpCameraPushback');
  assert(/camera\.lookAt\(_tpLookAt\)/.test(push) && /_tpLookAt\.set\(camx \+ fx, camy \+ fy, camz \+ fz\)/.test(push),
    'tpHeight really is a PARALLEL offset — the camera looks along the frame\'s forward, not back at ' +
    'the pivot — which is what makes it able to absorb the remaining spread');
  // `!/tpPivot/` matched `_tpPivot`, the FUNCTION — the fourth time this session a pin has been
  // defeated by a name rather than by a value. Assert the absence of the SETTING: a framing slider is a
  // key in _sanitizeView and a `let` beside tpHeight, and neither exists.
  assert(!/tpPivot:/.test(extractFunction('_sanitizeView')) && !/\blet tpPivot\b/.test(src),
    'and there is deliberately no fifth framing slider: it would be a fifth value in four hand-kept ' +
    'places (sanitize / snapshot / apply / load) for a quarter of a metre tpHeight already covers');
}

done('build 1413: the chase camera frames the player, not the costume');
