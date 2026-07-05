// (build 874) PER-LEVEL CAMERA VIEWS — "Top down camera view for isometric games? 2.5d camera lock
// for sidescrollers." One system: gameCfg.view = 'fps' | 'top' | 'side' (+ viewDist, viewAxis), saved
// with the level. Top = fixed isometric-tilt camera, screen-relative WASD, twin-stick virtual cursor
// (shots resolve through the cursor's ray). Side = camera locked on one axis, movement held to the
// lane. Verified end-to-end in headless Chromium (camera pose, facing, movement axes, lane hold);
// these pins guard the wiring.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

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
assert(/view: \(savedLevel && savedLevel\.game && \(savedLevel\.game\.view==='top'\|\|savedLevel\.game\.view==='side'\)\) \? savedLevel\.game\.view : 'fps',/.test(src), 'gameCfg.view boots from the autosave');
assert(/viewAxis: \(savedLevel && savedLevel\.game && savedLevel\.game\.viewAxis==='z'\) \? 'z' : 'x',/.test(src), 'gameCfg.viewAxis boots from the autosave');
assert(/view: \(gameCfg\.view==='top'\|\|gameCfg\.view==='side'\)\?gameCfg\.view:'fps', viewDist: \+gameCfg\.viewDist\|\|0, viewAxis: \(gameCfg\.viewAxis==='z'\)\?'z':'x' \},/.test(src), 'serializeLevel writes all three fields');
const loads = src.match(/gameCfg\.view = \(level\.game\.view==='top'\|\|level\.game\.view==='side'\) \? level\.game\.view : 'fps';/g) || [];
eq(loads.length, 2, 'both load paths (local load + multiplayer host-adopt) apply the view');

// ---- input rerouting: pointer + touch steer the cursor, not the head ----
assert(/if\(typeof activeViewMode==='function' && activeViewMode\(\)!=='fps' && !drivingCar\)\{ _vcX \+= mx; _vcY \+= my; return; \}/.test(src), 'mouse deltas feed the twin-stick cursor');
assert(/if\(typeof activeViewMode==='function' && activeViewMode\(\)!=='fps'\)\{ _vcX \+= touchLookDX\*1\.4; _vcY \+= touchLookDY\*1\.4; \}/.test(src), 'touch look feeds the cursor too');
assert(/_updateViewAim\(\);\s+\/\/ build 874/.test(src), 'the cursor→aim update runs every frame before the look pose');
// the aim update faces the body at the cursor and (side) captures the lane
assert(/player\.yaw=Math\.atan2\(-dx, -dz\);/.test(src), 'body yaw faces the cursor point');
assert(/if\(vm==='side' && _sideLock==null\) _sideLock=\(axis==='x'\) \? player\.pos\.z : player\.pos\.x;/.test(src), 'the side-scroll lane is captured at deploy');

// ---- movement: screen-relative in top, lane-only in side ----
assert(/if\(_vm874==='top'\)\{ forward\.set\(0,0,-1\); right\.set\(1,0,0\); \}/.test(src), 'top: W = up-screen, D = right-screen');
assert(/else if\(_vm874==='side'\)\{ if\(gameCfg\.viewAxis==='z'\)\{ right\.set\(0,0,-1\); \} else \{ right\.set\(1,0,0\); \} forward\.set\(0,0,0\); \}/.test(src), 'side: only the lane axis moves');
assert(/if\(_vm874==='side' && _sideLock!=null && !drivingCar\)\{/.test(src), 'lane hold: off-lane velocity killed, eased back on');

// ---- camera override: after the branch ladder, respecting turret/killcam ----
assert(/if\(_vmC!=='fps' && !mountedTurret && !\(duelDead && pvpMode\(\)\)\)\{/.test(src), 'override skips the turret seat and the PvP killcam');
assert(/camera\.position\.set\(_t\.x, _t\.y\+D, _t\.z\+D\*0\.55\);/.test(src), 'top camera: height D, pulled back 0.55D (isometric tilt, not map-flat)');
assert(/const D=Math\.max\(8, Math\.min\(80, _vd\|\|26\)\);/.test(src), 'top distance clamps 8–80, default 26');
assert(/if\(gameCfg\.viewAxis==='z'\) camera\.position\.set\(_t\.x\+D, _cy, _t\.z\);/.test(src), 'side camera sits off the lane axis');
assert(/const _t = drivingCar \? drivingCar\.position : player\.pos;/.test(src), 'driving keeps the view — cars work top-down');

// ---- combat: shots through the cursor, body-relative melee/rockets, avatar shown ----
assert(/if\(tpMode \|\| activeViewMode\(\)!=='fps'\)\{\s*\n\s*tpMuzzleWorld\(muzzleWorld\);/.test(src), 'tracers start at the avatar barrel');
assert(/raycaster\.set\(_vmOrig, _pd\);/.test(src) && /\} else raycaster\.setFromCamera\(new THREE\.Vector2\(sx, sy\), camera\);/.test(src), 'hitscan: body-origin pellets in fixed views, screen-centre in fps (reworked in 885)');
assert(/o\.set\(player\.pos\.x, player\.pos\.y-0\.2, player\.pos\.z\); d\.copy\(_vAimPt\)\.sub\(o\)\.normalize\(\);/.test(src), 'rockets launch from the body toward the cursor point');
assert(/if\(activeViewMode\(\)!=='fps'\) fwd\.set\(-Math\.sin\(player\.yaw\), 0, -Math\.cos\(player\.yaw\)\);/.test(src), 'melee swings where the body faces');
assert(/if\(!\(\(tpMode \|\| activeViewMode\(\)!=='fps'\) && gameOn && !editorOpen\)\)/.test(src), 'the player body renders in the fixed views');
assert(/if\(_scopedNow && activeViewMode\(\)!=='fps'\) _scopedNow=false;/.test(src), 'no sniper-optic tunnel from a bird’s-eye camera');

// ---- editor UI ----
assert(/vRow\.appendChild\(vBtn\('fps','First person'\)\); vRow\.appendChild\(vBtn\('top','Top-down'\)\); vRow\.appendChild\(vBtn\('side','Side-scroller'\)\);/.test(src), 'three-way picker in Player options');
assert(/aw\.appendChild\(aBtn\('x','Lane runs east\\u2013west'\)\); aw\.appendChild\(aBtn\('z','Lane runs north\\u2013south'\)\);/.test(src), 'side mode picks its lane axis');
assert(/gameCfg\.viewDist=\+rr\.value;/.test(src), 'camera distance slider writes viewDist');

done('build 874: per-level camera views — top-down twin-stick + 2.5D side-scroll, wired end to end');
