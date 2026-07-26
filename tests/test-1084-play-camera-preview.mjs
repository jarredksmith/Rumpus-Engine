import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1084: top-down and side-scroller levels derive their camera from the player start; nothing in the
// editor showed where it would be or what it would frame. Now a rig in the world + a live preview window.

// ---------------------------------------------------------------- the pose is the single source of truth
const pose = extractFunction('_vcamPose');
assert(pose, '_vcamPose exists');

// Build 1084 shipped this alongside a duplicate of the framing maths in the frame loop, and pinned the two
// against each other. Build 1085 deleted the duplicate: the live camera now calls _vcamPose too. That is
// strictly safer, so the test becomes "there is exactly one implementation, and everything uses it".
assert(!/camera\.position\.set\(_t\.x, _t\.y\+D, _t\.z\+D\*0\.55\)/.test(src),
  'the frame loop no longer carries its own copy of the framing');
assert(/_vcamPose\(camera, 0, true, drivingCar \? drivingCar\.position : player\.pos\)/.test(src),
  'the live camera is posed by the shared function, following the player (or their car)');
eq((src.match(/function _vcamPose\(/g) || []).length, 1, 'and there is only one of it');
// the live call must NOT let the pose touch fov/projection — the ADS blend above owns those
assert(/if\(!live\)\{[\s\S]{0,240}updateProjectionMatrix\(\);\n\s*\}/.test(pose),
  'driving the real camera leaves fov and the projection alone');

// the anchor point must be where the player actually spawns, not the raw pstart
const tgt = extractFunction('_vcamTarget');
assert(/terrainHeightAt\(gx,gz\)/.test(tgt) && /\+\(\+playerSpawn\.y\|\|0\)/.test(tgt) && /gy\+EYE/.test(tgt),
  'the editor anchor is terrain + pstart.y + EYE — exactly what deployAt() gives the player');
assert(/player\.pos\.set\(playerSpawn\.x, ty\+\(playerSpawn\.y\|\|0\)\+EYE, playerSpawn\.z\)/.test(src),
  '...and that really is how deploy positions the player');
assert(/const t=tgt \|\| _vcamTarget\(\);/.test(pose),
  'so the editor previews the START point while the live camera follows the player, through one function');

// FOV: the resting one, not a transient ADS zoom
assert(/cam\.fov=\(typeof worldCfg!=='undefined' && worldCfg\.fov\) \? worldCfg\.fov : 78/.test(pose),
  'the preview frames at the level FOV');

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
