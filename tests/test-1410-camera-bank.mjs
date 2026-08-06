// build 1410 — the fixed camera is a BANK.
//
// Build 1404 took the FIRST prop carrying the camera tag and wrote "a camera is ONE place". But a tag has
// named a SET since build 1299 — a level has thirty crates and one tag — and every other tag-taking verb in
// the engine acts on all of them. So the second, third and fourth props carrying a camera tag were placed,
// serialized, tagged, and unreachable: the security-desk idiom, which is the thing the verb was asked for,
// needed a logic-graph counter plus one `view` node per angle.
//
// A bank cuts. It does NOT blend — see the recorded kill at the foot of this file — and it does not avoid
// geometry, for a reason that is also recorded there rather than left to be rediscovered.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

const DWELL_MIN = +/const VIEW_DWELL_MIN = ([\d.]+)/.exec(src)[1];
const DWELL_MAX = +/VIEW_DWELL_MAX = ([\d.]+)/.exec(src)[1];

// ------------------------------------------------------------- the dwell, executed ----
{
  const f = new Function('const VIEW_DWELL_MIN = ' + DWELL_MIN + ', VIEW_DWELL_MAX = ' + DWELL_MAX + ';\n' +
    extractFunction('_viewDwell') + '\nreturn _viewDwell;')();

  eq(f(0), 0, '0 is OFF — one mount, no clock, byte-identical to build 1404');
  eq(f(undefined), 0, '...and so is an unset field, which is what every level authored before this build has');
  eq(f(''), 0, '...and a blank editor box');
  eq(f(null), 0);
  eq(f('nonsense'), 0, 'a value that is not a number holds rather than cutting on NaN');
  eq(f(-4), 0, 'and so does a negative one — there is no such thing as cutting backwards');

  eq(f(4), 4, 'a real dwell passes through');
  eq(f('2.5'), 2.5, '...including the string the editor field hands over');
  eq(f(0.001), DWELL_MIN,
    'a hostile 0.001 is FLOORED, not honoured: a level file is untrusted input (build 1325) and four ' +
    'hundred cuts a second is a strobe, not a camera');
  eq(f(1e9), DWELL_MAX, '...and an absurd one is capped');
  assert(DWELL_MIN > 0 && DWELL_MIN <= 0.5,
    'the floor is a FAST CUT rather than a refusal — a glitching camera is a legitimate thing to author');
}

// --------------------------------------------------- the bank, driven frame by frame ----
// The real _viewFixedPose, over a real clock, with a real (stubbed) camera.
function rig(opts) {
  opts = opts || {};
  const notes = [];
  const props = opts.props || [];
  const clock = { t: 0 };
  const cam = {
    position: { x: 0, y: 0, z: 0, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } },
    quaternion: { v: null, copy(q) { this.v = q; } },
    looked: null,
    lookAt(x, y, z) { this.looked = { x, y, z }; },
    updateMatrixWorld() {}
  };
  const fn = new Function('props', 'notes', 'clock', 'cam', 'player',
    'var _viewOv = null;\n' +
    'const propModels = props;\n' +
    'const performance = { now: () => clock.t };\n' +
    'const _vfP = { x:0, y:0, z:0 }, _vfQ = {}, _vfD = {};\n' +
    'const VIEW_MODES = ["fps","chase","top","side","fixed"];\n' +
    'const VIEW_DWELL_MIN = ' + DWELL_MIN + ', VIEW_DWELL_MAX = ' + DWELL_MAX + ';\n' +
    'function _noteLogicFailure(m){ notes.push(m); }\n' +
    extractFunction('_viewMountsFor') + '\n' +
    extractFunction('_viewDwell') + '\n' + extractFunction('_setViewOverride') + '\n' +
    extractFunction('_viewFixedPose') + '\n' +
    'return { set:_setViewOverride, pose:()=>_viewFixedPose(cam), ov:()=>_viewOv, mounts:_viewMountsFor };')
    (props, notes, clock, cam, opts.player || { pos: { x: 0, y: 1.7, z: 0 } });
  // Real frame cadence. The dwell is decided per FRAME, and a gap over a second re-bases the clock
  // (it is a pause, not elapsed dwell) — so a probe that jumps three seconds between poses would only
  // ever exercise the re-base and would measure a bank that never cuts.
  function stepTo(t) { while (clock.t < t) { clock.t = Math.min(t, clock.t + 16); fn.pose(); } }
  return { r: fn, cam, clock, notes, stepTo };
}

// A mount stub: getWorldPosition writes into the engine's own scratch vector.
function mount(tag, x, z) {
  const o = {
    parent: {}, tag,
    userData: { tag },
    getWorldPosition(v) { v.x = x; v.y = 3; v.z = z; return v; },
    getWorldQuaternion(q) { q.tag = tag; return q; }
  };
  return o;
}

{
  const a = mount('sec', 10, 0), b = mount('sec', -10, 0), c = mount('sec', 0, 10);
  const other = mount('door', 99, 99);
  const { r, cam, clock, stepTo } = rig({ props: [other, a, b, c] });

  eq(r.mounts('sec').length, 3, 'every prop carrying the tag is in the bank...');
  eq(r.mounts('door').length, 1, '...and no prop carrying another one is');
  eq(r.mounts('nothere').length, 0, 'an unplaced tag resolves to nothing rather than to everything');
  { const dead = mount('sec', 5, 5); dead.parent = null;
    const g = rig({ props: [dead, mount('sec', 1, 1)] });
    eq(g.r.mounts('sec').length, 1,
      'and a DESTROYED prop is not in the bank at all — otherwise the cycle would stop on a corpse for a ' +
      'whole dwell, and the pose\'s own re-resolve would keep handing back the object it was called to replace'); }

  // --- dwell 0 is exactly build 1404 -------------------------------------------------
  eq(r.set('fixed', 'sec', true, 0), true, 'a bank with no dwell arms');
  eq(r.ov().dwell, 0);
  r.pose(); eq(cam.position.x, 10, 'it sits on camera 1...');
  stepTo(60000);
  eq(cam.position.x, 10, '...and a MINUTE later it is still on camera 1 — no clock, no cut (build 1404)');

  // --- the cut ------------------------------------------------------------------------
  clock.t = 0;
  eq(r.set('fixed', 'sec', true, 3), true);
  r.pose(); eq(cam.position.x, 10, 'camera 1 at t=0');
  stepTo(2900);
  eq(cam.position.x, 10, '...still camera 1 a tenth of a second before the dwell');
  stepTo(3000);
  eq(cam.position.x, -10, '...camera 2 exactly on it');
  stepTo(6000);
  eq(cam.position.z, 10, '...camera 3');
  stepTo(9000);
  eq(cam.position.x, 10, '...and it WRAPS back to camera 1, so a bank cycles forever rather than ending');

  // --- the cut is a CUT ---------------------------------------------------------------
  clock.t = 0; r.set('fixed', 'sec', true, 3);
  r.pose();
  stepTo(2992);
  const wasZ = cam.position.z, wasX = cam.position.x;
  stepTo(3008);   // ONE frame later
  assert(wasX === 10 && wasZ === 0 && cam.position.x === -10 && cam.position.z === 0,
    'and it is a CUT, not a move: one frame is fully on camera 1 and the very next fully on camera 2, ' +
    'with no position between them (see the blend kill at the foot of this file)');
}

// ------------------------------------------------------- the pause must not flush the bank ----
{
  const a = mount('sec', 10, 0), b = mount('sec', -10, 0), c = mount('sec', 0, 10);
  const { r, cam, clock, stepTo } = rig({ props: [a, b, c] });
  r.set('fixed', 'sec', true, 3);
  clock.t = 0; r.pose();
  stepTo(496);
  eq(cam.position.x, 10, 'half a second in, camera 1');

  clock.t = 496 + 30000; r.pose();   // ONE frame with a thirty-second gap: the pause
  eq(cam.position.x, 10,
    'a THIRTY SECOND gap is a pause, a tab-back or a level load, not elapsed dwell — the clock re-bases ' +
    'and the bank holds, instead of flicking through ten cuts in the frame the player comes back on');
  stepTo(496 + 30000 + 2992);
  eq(cam.position.x, 10, '...and the new dwell runs from the moment play resumed');
  stepTo(496 + 30000 + 3008);
  eq(cam.position.x, -10, '...cutting one dwell after that, not one dwell after the pause began');
}

// ---------------------------------------------------- membership changes mid-cycle ----
{
  const a = mount('sec', 10, 0), b = mount('sec', -10, 0);
  const { r, cam, clock, stepTo } = rig({ props: [a, b] });
  r.set('fixed', 'sec', true, 2);
  clock.t = 0; r.pose(); eq(cam.position.x, 10);
  eq(r.mounts('sec').length, 2, 'the bank is two cameras...');
  stepTo(496); eq(cam.position.x, 10, '...and holds mid-dwell');

  // --- a mount destroyed MID-DWELL is re-resolved on the spot -------------------------
  a.parent = null;
  stepTo(1008);
  eq(cam.position.x, -10,
    'a camera destroyed mid-dwell does not leave the player staring at a dead object — the bank is ' +
    're-resolved on the frame it goes, and the next one in the list takes over');

  // --- the tag going entirely drops the override -------------------------------------
  b.parent = null;
  clock.t += 16; r.pose();
  eq(r.ov(), null,
    'and if the tag is gone ENTIRELY the override drops, so the player returns to the level\'s own camera ' +
    'rather than to nothing (build 1404\'s rule, through the bank)');
}

// ------------------------------------------------------------------ tracking is unchanged ----
{
  const a = mount('sec', 10, 0), b = mount('sec', -10, 0);
  const { r, cam, clock, stepTo } = rig({ props: [a, b], player: { pos: { x: 4, y: 1.7, z: -6 } } });

  r.set('fixed', 'sec', true, 2);
  clock.t = 0; r.pose();
  eq(cam.looked.x, 4, 'a tracking camera still looks at the player...');
  near(cam.looked.y, 1.5, 1e-9, '...a shade below the eye, exactly as build 1404 framed it');
  eq(cam.looked.z, -6);
  stepTo(2000);
  eq(cam.position.x, -10, '...and after the cut it is the NEW mount looking at them');
  eq(cam.looked.x, 4);

  r.set('fixed', 'sec', false, 2);
  clock.t = 0; r.pose();
  eq(cam.quaternion.v.tag, 'sec', 'an untracked bank takes each mount\'s OWN facing as it cuts to it');
}

// ----------------------------------------------------------------- an empty tag refuses ----
{
  const { r, notes } = rig({ props: [mount('other', 0, 0)] });
  eq(r.set('fixed', 'nosuchtag', true, 3), false,
    'arming a bank whose tag names nothing REFUSES rather than leaving the player looking at nowhere');
  eq(notes.length, 1, '...and reports it through build 1214\'s channel');
  assert(/nosuchtag/.test(notes[0]), '...naming the tag');
  eq(r.ov(), null, '...with the camera that was running left running');
}

// ------------------------------------------------------------------------- the wiring ----
{
  assert(/vmode:'vm', vtag:'vt', vtrack:'vk', vdwell:'vd',/.test(src),
    'the dwell serializes through build 1406\'s signal table, so a bank survives a save and a share code');

  const wa = extractFunction('_applyWorldAction');
  assert(/const dw=_viewDwell\(s\.vdwell\);/.test(wa),
    'the verb clamps the authored dwell at the point of use — the one derivation, so the editor field, ' +
    'the graph node and a hand-edited level file all land on the same number');

  assert(/\{k:'vdwell',l:'cut every \(s\)',w:44,ifv:\['verb','view'\],ifv2:\['vmode','fixed'\]\}/.test(src),
    'the graph\'s Do node offers it, and only for a FIXED camera');
  assert(/lab\('cut every'\); txt\('0 = hold', s\.vdwell/.test(src),
    'and so does the signal editor\'s own row (build 1406), with the default stated in the placeholder');
  assert(/tag several props to cut between them/.test(src),
    '...and the row SAYS a second tagged prop makes a bank: nothing else in the product does, and a ' +
    'capability nobody can find is one that does not exist (build 1348)');

  assert(/_setViewOverride\(String\(msg\.vw\[0\]\|\|''\), String\(msg\.vw\[1\]\|\|''\), !!msg\.vw\[2\], \+msg\.vw\[3\]\|\|0\)/.test(src),
    'a client applies the dwell through the identical function — and a PRE-1410 host sends a 3-element ' +
    'payload, whose missing fourth reads 0, which is exactly build 1404\'s behaviour');
}

// ---------------------------------------------------------------- it still costs nothing ----
{
  const f = extractFunction('_viewFixedPose');
  assert(!/new THREE\./.test(f), 'the pose still allocates nothing per frame (build 1168)');
  assert(/if\(_n - ov\.t0 >= ov\.dwell\*1000\)\{ ov\.t0 = _n; ov\.idx\+\+; ov\.mounts = null; \}/.test(f),
    'membership is re-resolved ON THE CUT and never per frame: _viewMountsFor is an O(propModels) walk, ' +
    'and a cut is exactly the moment a camera spawned or destroyed since the last one should join or leave');
  assert(/if\(ov\.dwell > 0\)\{/.test(f),
    '...and a bank with no dwell never reads the clock at all, so build 1404\'s single mount pays nothing');
}

// ============================================================================================
// TWO RECORDED KILLS, so they are not rediscovered as gaps.
//
// BLEND between mounts — NOT built, and it would be wrong. A security camera cuts; a survival-horror
//   fixed camera cuts at the doorway. Sliding the viewpoint from one mounted camera to another is a
//   CINEMATIC move, and this engine already has cinematics for it (cineCfg, shots carrying path /
//   lensFrom-To / focusOn / ease). A second, weaker path to the same thing inside a gameplay camera would
//   duplicate that system and would read as a drifting camera rather than as a camera bank.
//
// GEOMETRY AVOIDANCE — NOT built, for the opposite reason to the chase camera's. tpCameraPushback collides
//   because the player DRAGS that camera through the level and it legitimately ends up inside a wall. A
//   mount is AUTHORED: the creator chose where it goes, and pulling it toward the player would move it off
//   the spot they picked. The case that looks like a defect — the player walks behind a pillar and the
//   camera shows a pillar — is the fixed-camera idiom working, not failing.
// ============================================================================================
{
  assert(!/_cameraCollide/.test(extractFunction('_viewFixedPose')),
    'a MOUNTED camera is deliberately not collided: the creator chose where it goes (see the kill above)');
  assert(!/function _viewMountFor\b/.test(src) && !/_viewMountFor\(/.test(src),
    'and there is no singular resolver left beside the bank\'s: build 1404 had one, 1410 left it with no ' +
    'callers, and a second resolver nobody uses is a trap — the next build that wants "the camera" reaches ' +
    'for it and gets camera 1 rather than the one the bank is on');
}

done('build 1410: the fixed camera is a bank — several mounts under one tag, cutting on a dwell');
