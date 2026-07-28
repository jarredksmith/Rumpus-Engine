import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1085: top-down and side-scroller cameras became an ORBIT (distance, rotate, tilt, height, roll)
// instead of one hard-coded offset each. The whole build hinges on one claim: a level built before this
// change must frame IDENTICALLY. Everything below either proves that or proves a knob does what it says.

// ---------------------------------------------------------------- run the real pose function
const grab = (re, what) => { const m = src.match(re); assert(m, 'found ' + what); return m[0]; };
const CONSTS = [
  grab(/const VCAM_DEG = [^\n]*/, 'VCAM_DEG'),
  grab(/const VCAM_TOP_R = [^\n]*/, 'the top orbit constants'),
  grab(/const VCAM_SIDE_LIFT = [^\n]*/, 'the side lift'),
  grab(/const VCAM_LIM = \{[\s\S]*?\n\};/, 'the limits table'),
  grab(/const VCAM_DEF = \{[\s\S]*?\n\};/, 'the defaults table'),
  "const _vcamLast={ vm:'', r:0, aimY:0 };",
].join('\n');

const build = (cfg, spawn = {}) => {
  const V3 = class {
    constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
    set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  };
  const cam = { position: new V3(), up: new V3(0,1,0), rotation: { z: 99 },
    aim: null, rolled: 0, fov: 0, near: 0, far: 0, aspect: 0,
    lookAt(x,y,z){ this.aim = { x, y, z }; },
    rotateZ(r){ this.rolled += r; },
    updateProjectionMatrix(){ this.proj = (this.proj || 0) + 1; },
    updateMatrixWorld(){} };
  const api = new Function('gameCfg','playerSpawn','worldCfg','EYE','camera','terrainHeightAt','THREE',
    `${CONSTS}
     ${extractFunction('_vcamMode')}
     ${extractFunction('_vcamTarget')}
     ${extractFunction('_vcamNum')}
     ${extractFunction('_vcamOpt')}
     ${extractFunction('_vcamBaseYaw')}
     const _vcamOrbitOn=()=>false;   // build 1100: player orbit is off in this authored-framing harness
     ${extractFunction('_vcamYawRad')}
     ${extractFunction('_vcamPose')}
     ${extractFunction('_vcamReset')}
     const _VCAM_T={x:0,y:0,z:0};
     return { pose:_vcamPose, opt:_vcamOpt, yaw:_vcamYawRad, reset:_vcamReset, last:()=>_vcamLast,
              TOP_R:VCAM_TOP_R, TOP_TILT:VCAM_TOP_TILT, LIM:VCAM_LIM, DEF:VCAM_DEF };`
  )(cfg, { x: spawn.x||0, y: spawn.y||0, z: spawn.z||0 }, { fov: 78 }, 1.7,
    { near: 0.1, far: 400 }, () => spawn.terrain||0, { Vector3: V3 });
  return { cam, api };
};

// ---------------------------------------------------------------- 1. the legacy framing is EXACTLY preserved
// Pre-1085: top sat at (t.x, t.y+D, t.z+0.55D); side at (t.x, t.y+1.0, t.z+D). A level saved before this
// build has none of the new fields, so the defaults must land on those points to the last decimal.
{
  const D = 26, t = { x: 0, y: 1.7, z: 0 };
  const b = build({ view: 'top', viewAxis: 'x' });
  eq(b.api.pose(b.cam, 16/9), 'top', 'an old top-down level still poses');
  near(b.cam.position.x, t.x, 1e-9, 'legacy top: dead over the player on X');
  near(b.cam.position.y, t.y + D, 1e-9, 'legacy top: lifted by exactly the camera distance');
  near(b.cam.position.z, t.z + D * 0.55, 1e-9, 'legacy top: pulled back exactly 0.55 x distance');
  near(b.cam.aim.y, t.y, 1e-9, '...aimed at the player, not above them');
  eq(b.cam.rolled, 0, '...with no roll');
}
{
  const D = 16;
  const b = build({ view: 'side', viewAxis: 'x' });
  b.api.pose(b.cam, 16/9);
  near(b.cam.position.x, 0, 1e-9, 'legacy side: in line with the player');
  near(b.cam.position.y, 1.7 + 1.0, 1e-9, 'legacy side: the old 1.0 lift, now expressed as the aim height');
  near(b.cam.position.z, D, 1e-9, 'legacy side: the full distance back');
  near(b.cam.aim.y, 1.7 + 1.0, 1e-9, '...looking dead level');
}
{
  const b = build({ view: 'side', viewAxis: 'z' });   // a north-south lane is still filmed from +X
  b.api.pose(b.cam, 16/9);
  near(b.cam.position.x, 16, 1e-9, 'legacy side (north-south lane): camera on +X');
  near(b.cam.position.z, 0, 1e-9, '...level with the player on Z');
}
// and the constants are derived, not typed in by hand — that is WHY it is exact
assert(/Math\.hypot\(1, 0\.55\)/.test(src) && /Math\.atan2\(1, 0\.55\)/.test(src),
  'the default radius and tilt are computed from the old 1 : 0.55 offset, so they cannot drift');

// ---------------------------------------------------------------- 2. each knob does what it says
const poseOf = (cfg, spawn) => { const b = build(cfg, spawn); b.api.pose(b.cam, 16/9); return b; };

// distance orbits, it does not just slide
{
  const near26 = poseOf({ view: 'top', viewAxis: 'x' }).cam.position;
  const far52  = poseOf({ view: 'top', viewAxis: 'x', viewDist: 52 }).cam.position;
  near(far52.y - 1.7, (near26.y - 1.7) * 2, 1e-6, 'doubling the distance doubles the height');
  near(far52.z, near26.z * 2, 1e-6, '...and the pull-back, so the angle is unchanged');
}

// ROTATE: swings the camera around the player at a constant radius
{
  const a = poseOf({ view: 'top', viewAxis: 'x' }).cam.position;
  const b = poseOf({ view: 'top', viewAxis: 'x', viewYaw: 90 }).cam.position;
  near(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z), 1e-6, 'rotating keeps the camera the same distance out');
  near(a.y, b.y, 1e-6, '...and at the same height');
  near(b.x, Math.hypot(a.x, a.z), 1e-6, 'a 90 degree rotation puts it on +X');
  near(b.z, 0, 1e-6, '...and off Z entirely');
  const c = poseOf({ view: 'top', viewAxis: 'x', viewYaw: 180 }).cam.position;
  near(c.z, -a.z, 1e-6, '...and 180 puts it on the opposite side');
}
// a side lane's rotation is measured from ITS base direction, not from north
{
  // north-south lane: base is +X (90 degrees). Rotating -60 swings it 60 degrees toward +Z.
  const b = poseOf({ view: 'side', viewAxis: 'z', viewYaw: -60 }).cam.position;
  near(b.x, 16 * Math.sin(30 * Math.PI / 180), 1e-6, 'rotation composes with the lane\'s own base direction');
  near(b.z, 16 * Math.cos(30 * Math.PI / 180), 1e-6, '...on both axes');
  const clamped = poseOf({ view: 'side', viewAxis: 'z', viewYaw: -90 }).cam.position;
  near(clamped.x, b.x, 1e-9, 'and -90 clamps back to -60 rather than swinging down the lane');
}

// TILT: 89 is nearly straight down, low is nearly flat
{
  const steep = poseOf({ view: 'top', viewAxis: 'x', viewTilt: 89 }).cam.position;
  const flat  = poseOf({ view: 'top', viewAxis: 'x', viewTilt: 15 }).cam.position;
  assert(steep.y > flat.y, 'a steeper tilt is higher up (' + steep.y.toFixed(1) + ' vs ' + flat.y.toFixed(1) + ')');
  assert(Math.abs(steep.z) < Math.abs(flat.z), '...and closer to overhead');
  near(Math.hypot(steep.x, steep.y - 1.7, steep.z), Math.hypot(flat.x, flat.y - 1.7, flat.z), 1e-6,
    'tilting orbits: the distance from the player never changes');
}
{ // a side-scroller can now look down on its lane
  const down = poseOf({ view: 'side', viewAxis: 'x', viewTilt: 35 }).cam;
  assert(down.position.y > 1.7 + 1.0, 'a tilted side camera rises above the lane');
  near(down.aim.y, 1.7 + 1.0, 1e-9, '...while still aiming at the lane, so it genuinely looks DOWN');
}

// HEIGHT: shifts the whole frame vertically — camera and aim move together, the angle does not change
{
  const base = poseOf({ view: 'side', viewAxis: 'x' }).cam;
  const up   = poseOf({ view: 'side', viewAxis: 'x', viewHeight: 4 }).cam;
  near(up.position.y - base.position.y, 4, 1e-9, 'height raises the camera by exactly that much');
  near(up.aim.y - base.aim.y, 4, 1e-9, '...and what it looks at with it');
  near(up.position.z, base.position.z, 1e-9, '...without moving it back or tilting it');
}
{
  const dn = poseOf({ view: 'top', viewAxis: 'x', viewHeight: -5 }).cam;
  near(dn.aim.y, 1.7 - 5, 1e-9, 'a negative height drops the framed point (useful over a pit)');
}

// ROLL: a dutch angle, and nothing else
{
  const r = poseOf({ view: 'side', viewAxis: 'x', viewRoll: 12 }).cam;
  near(r.rolled, 12 * Math.PI / 180, 1e-9, 'roll tips the horizon by the authored angle, in radians');
  const p = poseOf({ view: 'side', viewAxis: 'x' }).cam;
  near(r.position.x, p.position.x, 1e-9, '...and moves the camera not at all');
  near(r.position.y, p.position.y, 1e-9, '...at all');
  near(r.position.z, p.position.z, 1e-9, '...at all');
  eq(poseOf({ view: 'side', viewAxis: 'x', viewRoll: 0 }).cam.rolled, 0, 'and zero roll never calls rotateZ');
}

// Found in a browser: the live camera runs its Euler in 'YXZ' order (the first-person path sets that and
// never puts it back), while a fresh preview camera is 'XYZ'. The old `rotation.z = 0` safety line therefore
// meant two different things once a camera had BOTH yaw and pitch, and the preview drifted from the real
// camera the moment Rotate was used. lookAt already produces zero roll, so the line is gone and roll is
// applied as a quaternion turn, which no Euler order can reinterpret.
assert(!/cam\.rotation\.z=0;/.test(extractFunction('_vcamPose')),
  'the pose never zeroes the Euler roll — that is order-dependent and the two cameras use different orders');
assert(/cam\.rotateZ\(roll\*VCAM_DEG\)/.test(extractFunction('_vcamPose')),
  'roll is applied as a local quaternion turn instead');
assert(/camera\.rotation\.order = 'YXZ'/.test(src), "sanity: the live camera really is 'YXZ'");

// the height offset is applied to the SIDE lift, not instead of it
assert(/aimY=t\.y \+ \(vm==='side' \? VCAM_SIDE_LIFT : 0\) \+ _vcamOpt\(vm,'height'\)/.test(extractFunction('_vcamPose')),
  'height stacks on top of the mode lift rather than replacing it');

// ---------------------------------------------------------------- 3. junk data can never break the camera
{
  const b = build({ view: 'side', viewAxis: 'x', viewYaw: 'banana', viewTilt: NaN, viewHeight: Infinity, viewRoll: null, viewDist: undefined });
  eq(b.api.pose(b.cam, 16/9), 'side', 'a level full of garbage still poses');
  near(b.cam.position.z, 16, 1e-9, '...at the default distance');
  near(b.cam.position.y, 2.7, 1e-9, '...the default height');
  eq(b.cam.rolled, 0, '...and no roll');
}
{
  const b = build({ view: 'side', viewAxis: 'x', viewYaw: 179 });
  b.api.pose(b.cam, 16/9);
  // 179 degrees would put a side camera behind the player, looking down the lane, where A/D stop reading as
  // left/right and the aim ray runs almost parallel to the plane it has to hit. It is clamped to 60.
  const at60 = poseOf({ view: 'side', viewAxis: 'x', viewYaw: 60 }).cam.position;
  near(b.cam.position.x, at60.x, 1e-9, 'side rotation is clamped to +-60 so the lane stays readable');
  near(b.cam.position.z, at60.z, 1e-9, '...exactly at the limit');
}
{
  const b = poseOf({ view: 'top', viewAxis: 'x', viewTilt: 200 });
  const at89 = poseOf({ view: 'top', viewAxis: 'x', viewTilt: 89 }).cam.position;
  near(b.cam.position.y, at89.y, 1e-9, 'top tilt is clamped to 89, so lookAt never gimbals straight down');
}
{
  const b = build({ view: 'top', viewAxis: 'x' });
  eq(b.api.opt('top', 'dist'), 26, 'a distance of 0 or absent means the mode default, as it always has');
  eq(build({ view: 'top', viewAxis: 'x', viewDist: 0 }).api.opt('top', 'dist'), 26, '...including an explicit 0');
  eq(build({ view: 'top', viewAxis: 'x', viewDist: 999 }).api.opt('top', 'dist'), 80, '...and 999 clamps to 80');
}

// other view modes are still untouched
for (const v of ['fps', 'chase', undefined]) {
  const b = build({ view: v, viewAxis: 'x' });
  eq(b.api.pose(b.cam, 1), '', (v || 'unset') + ' has no orbit — nothing is posed');
  eq(b.cam.rotation.z, 99, '...and the camera object is not touched');
}

// ---------------------------------------------------------------- 4. reset
{
  const cfg = { view: 'top', viewAxis: 'x', viewYaw: 40, viewTilt: 20, viewHeight: 9, viewRoll: 12, viewDist: 70 };
  const b = build(cfg);
  eq(b.api.reset(), true, 'Reset camera reports success');
  eq(cfg.viewYaw, 0, '...clears the rotation');
  eq(cfg.viewHeight, 0, '...the height');
  eq(cfg.viewRoll, 0, '...the roll');
  eq(cfg.viewDist, 26, '...and puts the distance back to the mode default');
  near(cfg.viewTilt, Math.atan2(1, 0.55) * 180 / Math.PI, 1e-9, '...with the tilt back to the legacy isometric angle');
  const c2 = build(cfg); c2.api.pose(c2.cam, 16/9);
  near(c2.cam.position.y, 1.7 + 26, 1e-9, 'and a reset camera frames exactly like a pre-1085 level');
  near(c2.cam.position.z, 26 * 0.55, 1e-9, '...on both axes');
}
eq(build({ view: 'fps' }).api.reset(), false, 'reset does nothing in a first-person level');

// ---------------------------------------------------------------- 5. movement follows a rotated camera
// Top-down WASD is screen-relative. If the camera rotates and the basis does not, W stops meaning "up".
{
  const b = src.match(/if\(_vm874==='top'\)\{ const _ya=[^\n]*?right\.set\([^\n]*?\); \}/);
  assert(b, 'the top-down movement basis is derived from the camera yaw');
  const run = (yaw) => {
    const F = {}, R = {}, mk = o => ({ set: (x,y,z) => { o.x=x; o.y=y; o.z=z; } });
    new Function('_vm874','forward','right','_vcamYawRad', b[0])('top', mk(F), mk(R), () => yaw);
    return { F, R };
  };
  let m = run(0);
  eq([m.F.x, m.F.y, m.F.z].join(), '0,0,-1', 'at rotation 0 the basis is exactly what it was before 1085');
  eq([m.R.x, m.R.y, m.R.z].join(), '1,0,0', '...on both vectors');
  m = run(Math.PI / 2);
  near(m.F.x, -1, 1e-9, 'rotate the camera 90 degrees and W pushes -X...');
  near(m.R.z, -1, 1e-9, '...while D pushes -Z — still up-screen and right-screen');
  m = run(Math.PI / 4);
  near(Math.hypot(m.F.x, m.F.z), 1, 1e-9, 'the basis stays unit length at any angle');
  near(m.F.x * m.R.x + m.F.z * m.R.z, 0, 1e-9, '...and forward stays perpendicular to right');
}
// side keeps the LANE basis: the player runs along the lane wherever the camera is watching from
assert(/else if\(_vm874==='side'\)\{ if\(gameCfg\.viewAxis==='z'\)\{ right\.set\(0,0,-1\); \} else \{ right\.set\(1,0,0\); \} forward\.set\(0,0,0\); \}/.test(src),
  'side movement is unchanged — rotating that camera is a look, not a control change');

// ---------------------------------------------------------------- 6. it saves and loads
assert(/viewYaw: \+gameCfg\.viewYaw\|\|0, viewTilt: \(gameCfg\.viewTilt!=null\?\+gameCfg\.viewTilt:undefined\), viewHeight: \+gameCfg\.viewHeight\|\|0, viewRoll: \+gameCfg\.viewRoll\|\|0/.test(src),
  'every knob is written into the level');
// tilt is the one field with a per-mode default, so "unset" has to survive as unset rather than becoming 0
assert(/viewTilt: \(gameCfg\.viewTilt!=null\?\+gameCfg\.viewTilt:undefined\)/.test(src),
  'an untouched tilt is left out of the file, so the mode default still applies on load');
eq((src.match(/gameCfg\.viewYaw = \+level\.game\.viewYaw\|\|0;/g) || []).length, 2,
  'both load paths restore it (level import and campaign/undo restore)');
assert(/gameCfg\.viewTilt = \(level\.game\.viewTilt!=null\) \? \+level\.game\.viewTilt : null;/.test(src),
  '...and a missing tilt loads as null, not 0 — 0 would flatten every old top-down level');
assert(/viewTilt:   \(savedLevel && savedLevel\.game && savedLevel\.game\.viewTilt!=null\)   \? \+savedLevel\.game\.viewTilt   : null,/.test(src),
  'the browser autosave boots the same way');
// null must read back as the default, not as 0 — this is the whole backward-compatibility story
{
  const b = build({ view: 'top', viewAxis: 'x', viewTilt: null });
  near(b.api.opt('top', 'tilt'), Math.atan2(1, 0.55) * 180 / Math.PI, 1e-9, 'a null tilt reads as the mode default');
  b.api.pose(b.cam, 16/9);
  near(b.cam.position.z, 26 * 0.55, 1e-9, '...so an old level loads with its original framing');
}

// ---------------------------------------------------------------- 7. the controls
for (const [label, key] of [['Camera distance','dist'], ['Rotate','yaw'], ['Tilt','tilt'], ['Height','height'], ['Roll','roll']])
  assert(new RegExp("camSlider\\('" + label + "','" + key + "'").test(src), 'there is a ' + label + ' slider');
assert(/rr\.min=String\(_lim\[key\]\[0\]\); rr\.max=String\(_lim\[key\]\[1\]\)/.test(src),
  'each slider takes its range from the same limits table the camera clamps against');
assert(/rr\.value=String\(Math\.round\(_vcamOpt\(_curView,key\)\*10\)\/10\)/.test(src),
  '...and shows the value the camera is actually using, defaults included');
assert(/rr\.addEventListener\('pointerdown',\(\)=>pushUndoSnapshot\(\)\)/.test(src), 'dragging one is undoable');
assert(/rs\.textContent='Reset camera'/.test(src) && /_vcamReset\(\)/.test(src), 'and there is a way back to the default');
assert(/const _lim=VCAM_LIM\[_curView\], _def=VCAM_DEF\[_curView\]/.test(src), 'the panel reads the per-mode tables, so side and top get different ranges');

done('build 1085: the top-down / side-scroller camera orbits — rotate, tilt, raise and roll, with the old framing intact');
