// (build 874) PER-LEVEL CAMERA VIEWS — "Top down camera view for isometric games? 2.5d camera lock
// for sidescrollers." One system: gameCfg.view = 'fps' | 'top' | 'side' (+ viewDist, viewAxis), saved
// with the level. Top = fixed isometric-tilt camera, screen-relative WASD, twin-stick virtual cursor
// (shots resolve through the cursor's ray). Side = camera locked on one axis, movement held to the
// lane. Verified end-to-end in headless Chromium (camera pose, facing, movement axes, lane hold);
// these pins guard the wiring.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */


const src = gameSource();

// ---- the mode gate, executed: only live play reports a non-fps view ----
const mk = (deps) => evalDecl(extractFunction('activeViewMode', src), 'activeViewMode', deps);
eq(mk({ gameCfg:{ view:'top' }, gameOn:true, editorOpen:false, _cineActive:false })(), 'top', 'top mode live in play');
eq(mk({ gameCfg:{ view:'side' }, gameOn:true, editorOpen:false, _cineActive:false })(), 'side', 'side mode live in play');
eq(mk({ gameCfg:{ view:'top' }, gameOn:true, editorOpen:true, _cineActive:false })(), 'fps', 'the EDITOR always flies first-person');
eq(mk({ gameCfg:{ view:'top' }, gameOn:false, editorOpen:false, _cineActive:false })(), 'fps', 'menus stay first-person');
eq(mk({ gameCfg:{ view:'top' }, gameOn:true, editorOpen:false, _cineActive:true })(), 'fps', 'cutscenes keep their own camera');
eq(mk({ gameCfg:{ view:'fps' }, gameOn:true, editorOpen:false, _cineActive:false })(), 'fps', 'default is unchanged');

// ---- persistence: config, serialize, and BOTH load paths ----
assert(/view: \(savedLevel && savedLevel\.game && \(savedLevel\.game\.view==='top'\|\|savedLevel\.game\.view==='side'\|\|savedLevel\.game\.view==='chase'\)\) \? savedLevel\.game\.view : 'fps',/.test(src), 'gameCfg.view boots from the autosave (chase joined in build 894)');
assert(/viewAxis: \(savedLevel && savedLevel\.game && savedLevel\.game\.viewAxis==='z'\) \? 'z' : 'x',/.test(src), 'gameCfg.viewAxis boots from the autosave');
assert(/view: \(gameCfg\.view==='top'\|\|gameCfg\.view==='side'\|\|gameCfg\.view==='chase'\)\?gameCfg\.view:'fps', viewDist: \+gameCfg\.viewDist\|\|0, viewAxis: \(gameCfg\.viewAxis==='z'\)\?'z':'x'/.test(src), 'serializeLevel writes all three fields');
const loads = src.match(/gameCfg\.view = \(g\.view==='top'\|\|g\.view==='side'\|\|g\.view==='chase'\) \? g\.view : 'fps';/g) || [];
eq(loads.length, 1, 'both load paths (local load + multiplayer host-adopt) apply the view');

// ---- input rerouting: pointer + touch steer the cursor, not the head ----
// (build 1103: the gate widened to cursorAimActive — top/side always, chase when ARPG cursor aim is on)
assert(/if\(typeof cursorAimActive==='function' && cursorAimActive\(\) && !drivingCar\)\{ _vcX \+= mx; _vcY \+= my; return; \}/.test(src), 'mouse deltas feed the twin-stick cursor');
assert(/if\(typeof activeViewMode==='function' && activeViewMode\(\)!=='fps'\)\{ _vcX \+= touchLookDX\*1\.4; _vcY \+= touchLookDY\*1\.4; \}/.test(src), 'touch look feeds the cursor too');
assert(/_updateViewAim\(\);\s+\/\/ build 874/.test(src), 'the cursor→aim update runs every frame before the look pose');
// the aim update faces the body at the cursor and (side) captures the lane
assert(/player\.yaw=Math\.atan2\(-dx, -dz\);/.test(src), 'body yaw faces the cursor point');
assert(/if\(vm==='side' && _sideLock==null\) _sideLock=\(axis==='x'\) \? player\.pos\.z : player\.pos\.x;/.test(src), 'the side-scroll lane is captured at deploy');

// ---- movement: screen-relative in top, lane-only in side ----
// build 1085 rotated this basis with the camera; at yaw 0 it must still be exactly the original, so run
// it rather than matching the old literal.
{ const b=src.match(/if\(_vm874==='top'\)\{ const _ya=[^\n]*?right\.set\([^\n]*?\); \}/);
  assert(b, 'the top-down movement basis is still set in one place');
  const F={}, R={}, mk=o=>({ set:(x,y,z)=>{ o.x=x; o.y=y; o.z=z; } });
  new Function('_vm874','forward','right','_vcamYawRad', b[0])('top', mk(F), mk(R), ()=>0);
  eq([F.x,F.y,F.z].join(), '0,0,-1', 'top at yaw 0: W = up-screen');
  eq([R.x,R.y,R.z].join(), '1,0,0', 'top at yaw 0: D = right-screen');
}
assert(/else if\(_vm874==='side'\)\{ if\(gameCfg\.viewAxis==='z'\)\{ right\.set\(0,0,-1\); \} else \{ right\.set\(1,0,0\); \} forward\.set\(0,0,0\); \}/.test(src), 'side: only the lane axis moves');
assert(/if\(_vm874==='side' && _sideLock!=null && !drivingCar\)\{/.test(src), 'lane hold: off-lane velocity killed, eased back on');

// ---- camera override: after the branch ladder, respecting turret/killcam ----
assert(/if\(_vmC!=='fps' && !mountedTurret && !\(duelDead && pvpMode\(\)\)\)\{/.test(src), 'override skips the turret seat and the PvP killcam');
// build 1085: the framing moved into _vcamPose(), shared by the live camera, the editor rig and the
// preview window. The old (0, D, 0.55D) offset survives as the orbit's default radius and tilt.
assert(/_vcamPose\(camera, 0, true, drivingCar \? drivingCar\.position : player\.pos\)/.test(src), 'the live camera is posed by the shared function');
assert(/const VCAM_TOP_R = Math\.hypot\(1, 0\.55\), VCAM_TOP_TILT = Math\.atan2\(1, 0\.55\)\/VCAM_DEG;/.test(src), 'top camera: height D, pulled back 0.55D (isometric tilt, not map-flat)');
assert(/top:  \{ dist:\[8,80\]/.test(src) && /top:  \{ dist:26/.test(src), 'top distance clamps 8–80, default 26');
assert(/function _vcamBaseYaw\(vm\)\{ return \(vm==='side' && gameCfg\.viewAxis==='z'\) \? 90 : 0; \}/.test(src), 'side camera sits off the lane axis');
assert(/drivingCar \? drivingCar\.position : player\.pos/.test(src), 'driving keeps the view — cars work top-down');

// ---- combat: shots through the cursor, body-relative melee/rockets, avatar shown ----
assert(/if\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\)\{\s*\n\s*tpMuzzleWorld\(muzzleWorld\);/.test(src), 'tracers start at the avatar barrel (tpActive since build 894)');
assert(/raycaster\.set\(_vmOrig, _pd\);/.test(src) && /\} else raycaster\.setFromCamera\(new THREE\.Vector2\(sx, sy\), camera\);/.test(src), 'hitscan: body-origin pellets in fixed views, screen-centre in fps (reworked in 885)');
// (build 1109: the target is resolved into _t first, so a tilted chase camera can use the
// crosshair ray instead of the cursor solver's point)
assert(/o\.set\(player\.pos\.x, player\.pos\.y-0\.2, player\.pos\.z\);\n    let _t = _vAimPt;/.test(src) && /d\.copy\(_t\)\.sub\(o\)\.normalize\(\);/.test(src), 'rockets launch from the body toward the cursor point');
assert(/if\(typeof cursorAimActive==='function' && cursorAimActive\(\)\) fwd\.set\(-Math\.sin\(player\.yaw\), 0, -Math\.cos\(player\.yaw\)\);/.test(src), 'melee swings where the body faces');
assert(/if\(!\(\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\) && gameOn && !editorOpen\)\)/.test(src), 'the player body renders in the fixed views');
assert(/if\(_scopedNow && typeof cursorAimActive==='function' && cursorAimActive\(\)\) _scopedNow=false;/.test(src), 'no sniper-optic tunnel from a bird’s-eye camera');   // build 1103: nor from chase-cursor

// ---- editor UI ----
assert(/vRow\.appendChild\(vBtn\('fps','First person'\)\); vRow\.appendChild\(vBtn\('chase','Third-person'\)\); vRow\.appendChild\(vBtn\('top','Top-down'\)\); vRow\.appendChild\(vBtn\('side','Side-scroller'\)\);/.test(src), 'four-way picker in Player options (chase joined in build 894)');
assert(/aw\.appendChild\(aBtn\('x','Lane runs east\\u2013west'\)\); aw\.appendChild\(aBtn\('z','Lane runs north\\u2013south'\)\);/.test(src), 'side mode picks its lane axis');
assert(/camSlider\('Camera distance','dist'/.test(src) && /gameCfg\[prop\]=\+rr\.value;/.test(src) &&
  /const prop='view'\+key\.charAt\(0\)\.toUpperCase\(\)\+key\.slice\(1\);/.test(src), 'camera distance slider writes viewDist');

done('build 874: per-level camera views — top-down twin-stick + 2.5D side-scroll, wired end to end');
