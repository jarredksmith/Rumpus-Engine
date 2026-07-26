import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1084: top-down and side-scroller levels derive their camera from the player start; nothing in the
// editor showed where it would be or what it would frame. Now a rig in the world + a live preview window.

// ---------------------------------------------------------------- the pose is the single source of truth
const pose = extractFunction('_vcamPose');
assert(pose, '_vcamPose exists');

// The one thing that actually matters: it must agree with the LIVE camera block, or the preview lies.
// Pull both out and compare the numbers that define the framing.
const live = src.match(/if\(_vmC==='top'\)\{[\s\S]*?camera\.lookAt\(_t\.x, _cy, _t\.z\); camera\.rotation\.z=0;/);
assert(live, 'found the live top/side framing block in the frame loop');
const L = live[0];
const nums = (t) => (t.match(/-?\d+(?:\.\d+)?/g) || []).join(',');
eq(nums(L.match(/Math\.max\(8, Math\.min\(80, _vd\|\|26\)\)/)[0]), nums('Math.max(8, Math.min(80, _vd||26))'),
   'top: the live clamp is 8..80 with a default of 26');
assert(/Math\.max\(8, Math\.min\(80, _vd\|\|26\)\)/.test(pose), '...and the preview uses exactly that clamp');
assert(/Math\.max\(6, Math\.min\(60, _vd\|\|16\)\)/.test(L) && /Math\.max\(6, Math\.min\(60, _vd\|\|16\)\)/.test(pose),
   'side: both use the 6..60 clamp with a default of 16');
assert(/position\.set\(t\.x, t\.y\+D, t\.z\+D\*0\.55\)/.test(pose) && /position\.set\(_t\.x, _t\.y\+D, _t\.z\+D\*0\.55\)/.test(L),
   'top: both lift by D and pull back by D*0.55 (the ~61 degree isometric tilt)');
assert(/cy=t\.y\+1\.0/.test(pose) && /_cy=_t\.y\+1\.0/.test(L), 'side: both sit 1.0 above the player anchor');
assert(/viewAxis==='z'\) cam\.position\.set\(t\.x\+D, cy, t\.z\)/.test(pose) && /viewAxis==='z'\) camera\.position\.set\(_t\.x\+D, _cy, _t\.z\)/.test(L),
   'side: both put the camera on +X for a north-south lane');
assert(/rotation\.z=0/.test(pose), 'and the preview is level, like the real one');

// the anchor point must be where the player actually spawns, not the raw pstart
const tgt = extractFunction('_vcamTarget');
assert(/terrainHeightAt\(gx,gz\)/.test(tgt) && /\+\(\+playerSpawn\.y\|\|0\)/.test(tgt) && /gy\+EYE/.test(tgt),
  'the anchor is terrain + pstart.y + EYE — exactly what deployAt() gives the player');
assert(/deployAt\(\)?[\s\S]{0,200}/.test(src), 'sanity: the deploy path exists');
assert(/player\.pos\.set\(playerSpawn\.x, ty\+\(playerSpawn\.y\|\|0\)\+EYE, playerSpawn\.z\)/.test(src),
  '...and that really is how deploy positions the player');

// FOV: the resting one, not a transient ADS zoom
assert(/cam\.fov=\(typeof worldCfg!=='undefined' && worldCfg\.fov\) \? worldCfg\.fov : 78/.test(pose),
  'the preview frames at the level FOV');

// ---------------------------------------------------------------- run the pose and check real geometry
const mk = (view, opts = {}) => {
  const THREE = {
    Vector3: class { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
      set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
      copy(v){ return this.set(v.x,v.y,v.z); }
      distanceTo(v){ return Math.hypot(this.x-v.x, this.y-v.y, this.z-v.z); } },
  };
  const cam = { position: new THREE.Vector3(), rotation: { z: 1 }, lookedAt: null, fov: 0, near: 0, far: 0, aspect: 0,
    lookAt(x,y,z){ this.lookedAt = { x,y,z }; }, updateProjectionMatrix(){}, updateMatrixWorld(){} };
  const fn = new Function('THREE','gameCfg','playerSpawn','worldCfg','EYE','camera','terrainHeightAt',
    `${extractFunction('_vcamMode')}\n${tgt}\n${pose}\n${extractFunction('_vcamDist')}
     const _VCAM_T={x:0,y:0,z:0}; const _vcamTmp=new THREE.Vector3();
     return { pose:_vcamPose, dist:_vcamDist, target:_vcamTarget };`
  )(THREE,
    { view, viewDist: opts.dist || 0, viewAxis: opts.axis || 'x' },
    { x: opts.px || 0, y: opts.py || 0, z: opts.pz || 0 },
    { fov: 78 }, 1.7,
    { near: 0.1, far: 400 },
    () => opts.terrain || 0);
  return { cam, api: fn };
};

// side-scroller, lane east-west, start at the origin on flat ground
let m = mk('side');
eq(m.api.pose(m.cam, 16 / 9), 'side', 'poses a side-scroller');
near(m.cam.position.z, 16, 1e-6, 'the camera sits the default 16 back on +Z');
near(m.cam.position.x, 0, 1e-6, '...directly in line with the start');
near(m.cam.position.y, 1.7 + 1.0, 1e-6, '...at eye height plus the 1.0 lift');
near(m.cam.lookedAt.y, 1.7 + 1.0, 1e-6, 'and it looks level — a tilted side-scroller camera would be wrong');
eq(m.cam.rotation.z, 0, 'no roll');
eq(m.cam.fov, 78, 'at the level FOV');

// the lane axis genuinely swings the camera round
m = mk('side', { axis: 'z', dist: 24, px: 5, pz: -3 });
m.api.pose(m.cam, 16 / 9);
near(m.cam.position.x, 5 + 24, 1e-6, 'a north-south lane puts the camera 24 out on +X');
near(m.cam.position.z, -3, 1e-6, '...level with the start on Z');

// terrain and the start height both raise it
m = mk('side', { terrain: 12, py: 3 });
m.api.pose(m.cam, 16 / 9);
near(m.cam.position.y, 12 + 3 + 1.7 + 1.0, 1e-6, 'a start on a hill (or a platform) lifts the camera with it');

// out-of-range distances are clamped exactly like the live path
m = mk('side', { dist: 500 }); m.api.pose(m.cam, 16 / 9);
near(m.cam.position.z, 60, 1e-6, 'side distance clamps to 60');
m = mk('top', { dist: 500 }); m.api.pose(m.cam, 16 / 9);
near(m.cam.position.y - 1.7, 80, 1e-6, 'top distance clamps to 80');

// top-down: lifted and pulled toward +Z for the isometric read
m = mk('top', { dist: 30 });
eq(m.api.pose(m.cam, 16 / 9), 'top', 'poses a top-down level');
near(m.cam.position.y, 1.7 + 30, 1e-6, 'lifted by the camera distance');
near(m.cam.position.z, 30 * 0.55, 1e-6, '...and pulled back so it reads isometric, not map-flat');

// every other view mode is left completely alone
for (const v of ['fps', 'chase', undefined, 'nonsense']) {
  const q = mk(v); eq(q.api.pose(q.cam, 1), '', (v || 'unset') + ' has no derived camera — nothing is posed');
  eq(q.cam.rotation.z, 1, '...and the camera object is not touched');
}

// ---------------------------------------------------------------- the frame rectangle
const corn = extractFunction('_vcamCorners');
assert(/Math\.tan\(cam\.fov\*Math\.PI\/360\)\*d/.test(corn), 'the frame half-height is tan(fov/2)*distance');
assert(/hw=hh\*cam\.aspect/.test(corn), '...and the width follows the aspect, so the rectangle is the real window shape');
assert(/applyMatrix4\(cam\.matrixWorld\)/.test(corn), '...placed in world space off the posed camera');
const sync = extractFunction('_vcamSync');
assert(/camera && camera\.aspect/.test(sync), 'the rig uses the live window aspect, not a guess');
assert(/for\(let k=0;k<4;k\+\+\)\{ put\(_vcamCam\.position\); put\(c\[k\]\); \}/.test(sync), 'four rays run from the eye to the corners');
assert(/put\(c\[k\]\); put\(c\[\(k\+1\)%4\]\)/.test(sync), '...closed off by the rectangle they frame');
assert(/Float32Array\(48\)/.test(src), 'the line buffer holds exactly the 16 vertices those 8 segments need');

// ---------------------------------------------------------------- the lane
assert(/vm==='side'/.test(sync) && /_vcamLane\.visible=true/.test(sync), 'side view draws the lane plane');
assert(/viewAxis==='z'\)\{[\s\S]{0,120}rotation\.set\(0, Math\.PI\/2, 0\)/.test(sync),
  'a north-south lane turns the plane 90 degrees, so it lies along Z');
assert(/\} else \{ _vcamLane\.visible=false; _vcamLaneLine\.visible=false; \}/.test(sync),
  'top-down has no lane, so it is hidden — a lane line there would be a lie');
assert(/_sideLock/.test(src), 'sanity: the lock the lane visualizes is real');

// ---------------------------------------------------------------- editor-only, and provably so
assert(/editorOpen!=='undefined' && editorOpen && !\(typeof _cineActive!=='undefined' && _cineActive\)/.test(sync),
  'the rig only exists while editing, and gets out of the way of cutscenes');
assert(/if\(!vm\)\{ if\(_vcamGroup\) _vcamGroup\.visible=false; return; \}/.test(sync), '...and hides itself otherwise');
// ordering: the close paths flip editorOpen outside the loop, so a sync AFTER the render would leave the
// rig on screen for one frame of play. This is the build-859 bug class; pin the order.
const loop = src.match(/if\(typeof _vcamSync==='function'\) _vcamSync\(\);[\s\S]{0,400}?renderViewmodel\(\);/);
assert(loop, 'the loop calls _vcamSync');
assert(loop[0].indexOf('_vcamSync()') < loop[0].indexOf('renderScene(scene, activeCam())'),
  'and it runs BEFORE the world render, so the rig can never flash into play for a frame');

// The frame loop bails out early when !gameOn, and the editor is entered from a LIVE game (enterEditor
// calls startGame), so closing it back to the menu drops gameOn and skips both calls above. Found in a
// browser: without a guard placed BEFORE every early-out, the rig and panel sat on the main menu.
assert(/if\(!gameOn\) \{[\s\S]{0,200}return; \}/.test(src), 'sanity: the loop really does bail out when the game is not running');
const guard = src.match(/if\(_vcamGroup && !editorOpen\) _vcamGroup\.visible=false;\n\s*if\(_vcamPvPanel && \(!editorOpen \|\| _cineActive \|\| !_vcamPvOn\)\) _vcamPvPanel\.style\.display='none';/);
assert(guard, 'the rig and panel are hidden by an unconditional guard, not only by the in-editor calls');
assert(src.indexOf(guard[0]) < src.indexOf('if(!gameOn) {'), '...and that guard sits BEFORE the early-out, or it would never run on the way back to the menu');
assert(src.indexOf(guard[0]) < src.indexOf('if(typeof _vcamSync'), '...and before the normal per-frame sync');

// ---------------------------------------------------------------- the preview window
const pv = extractFunction('_renderVcamPvWindow');
assert(/editorOpen && _vcamPvOn/.test(pv), 'the preview is editor-only and can be switched off');
assert(/if\(!vm\)\{ if\(_vcamPvPanel\) _vcamPvPanel\.style\.display='none'; return; \}/.test(pv),
  '...and takes its panel away with it — including when the editor closes, since it is called unconditionally');
assert(/if\(typeof _renderVcamPvWindow==='function'\) _renderVcamPvWindow\(\);/.test(src) &&
  !/editorOpen && typeof _renderVcamPvWindow/.test(src), 'the call site is unguarded on purpose (it self-gates)');
assert(/_vcamPose\(_vcamPvCam, Wr\/Hr\)/.test(pv), 'the preview camera is posed at the PANEL aspect, so nothing is stretched');
assert(/setScissorTest\(true\)[\s\S]{0,160}render\(scene, _vcamPvCam\)/.test(pv), 'it scissor-renders the real scene into the panel');
assert(/setScissorTest\(false\); renderer\.setViewport\(0,0,size\.x,size\.y\)/.test(pv), '...and puts the viewport back afterwards');
assert(/shadowMap\.autoUpdate=false/.test(pv) && /shadowMap\.autoUpdate=sa/.test(pv),
  'shadows are not rebuilt for the second view — the main render already did it this frame');
assert(/for\(const o of \[_vcamGroup, _cinePreviewGroup/.test(pv), 'the rig and other editor chrome are hidden inside the preview');
assert(/for\(const o of hid\) o\.visible=true/.test(pv), '...and restored after');
assert(/cineUp \? \(_cinePvPanel\.offsetHeight\|\|0\)\+10 : 0/.test(pv),
  'it stacks above the cinematic preview instead of landing on top of it');

// remembered across sessions, like every other panel
assert(/localStorage\.getItem\('breach_vcampv'\)==='off'/.test(src), 'the on/off state is remembered');
assert(/localStorage\.setItem\('breach_vcampvpos'/.test(src), '...and so is where you dragged it');

// ---------------------------------------------------------------- stand in it
const goto = extractFunction('_vcamGoTo');
assert(/editorTopView=false; editorFreeFly=true; flyInit=true;/.test(goto), 'Stand in it switches to free-fly');
assert(/flyPos\.copy\(_vcamCam\.position\)/.test(goto), '...at the play camera position');
// the free-fly look basis is fwd = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)); inverting it
// gives yaw = atan2(-x,-z) and pitch = asin(y). Get this wrong and "stand in it" faces the wrong way.
assert(/player\.yaw=Math\.atan2\(-_vcamDir\.x, -_vcamDir\.z\)/.test(goto), '...facing the way it points');
assert(/player\.pitch=Math\.asin\(Math\.max\(-1, Math\.min\(1, _vcamDir\.y\)\)\)/.test(goto), '...at its pitch, clamped for asin');
assert(/fwd = new THREE\.Vector3\(-sy\*cp, sp, -cy\*cp\)/.test(src), 'sanity: that inverse matches the free-fly basis');
assert(/if\(!_vcamMode\(\)\) return false/.test(goto), 'and it does nothing in a first-person level');

// ---------------------------------------------------------------- wiring
assert(/Live camera preview/.test(src), 'the toggle is in the Camera view section');
assert(/gb\.textContent='Stand in it'/.test(src), '...next to Stand in it');
assert(/label:'Play-camera preview'/.test(src), 'and it is in the Tools menu');
assert(/Only top-down and side-scroller levels have a fixed play camera/.test(src),
  '...which explains itself rather than silently doing nothing in an FPS level');

done('build 1084: the top-down / side-scroller camera is visible while you build — rig, frame and live preview');
