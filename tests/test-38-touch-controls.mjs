// (build 58) On-screen touch controls + mobile. Left thumbstick (move + edge-sprint), right look pad,
// and action buttons, all feeding the same flags the keyboard/gamepad use. Structural wiring + stick math.
import { gameSource, html, done, assert, near } from './harness.mjs';
const src = gameSource();

// mobile viewport: no pinch / double-tap zoom during play
assert(/maximum-scale=1\.0, user-scalable=no/.test(html), 'viewport locks zoom on mobile');
assert(/canvas \{ touch-action: none; \}/.test(html), 'canvas swallows default touch gestures');

// touch state + detection
assert(/let isTouch = \(typeof matchMedia === 'function' && matchMedia\('\(pointer: coarse\)'\)\.matches\)/.test(src), 'detects a touch-primary device');
assert(/addEventListener\('touchstart', \(\)=>\{ if\(_ctrlPref==='desktop'\) return; isTouch = true; if\(document\.body\) document\.body\.classList\.add\('touch'\); \}, \{ once:true/.test(src), 'or reveals on first real touch (unless desktop is forced — build 351)');
assert(/let touchMoveX=0, touchMoveZ=0, touchSprint=false, touchFiring=false, touchAds=false, touchJump=false, touchLookDX=0, touchLookDY=0/.test(src), 'touch input state declared');

// markup
for(const id of ['touchUI','tLook','tStick','tThumb','tFire','tAim','tJump','tReload','tNade','tWeapon','tUse'])
  assert(new RegExp('id="'+id+'"').test(html), 'has #'+id);

// integration into the shared movement/look/fire/aim/jump flags
assert(/const mvx = padMoveX \|\| touchMoveX, mvz = padMoveZ \|\| touchMoveZ;/.test(src), 'movement combines pad + touch');
assert(/function sprinting\(\)\{ if\(padSprint \|\| touchSprint\) return true;/.test(src) && /return !!\(keys\[BINDS\.sprint\]\|\|\(BINDS\.sprint==='ShiftLeft'&&keys\['ShiftRight'\]\)\);/.test(src), 'sprint() honors stick/touch + the sprint bind (Shift default) or the toggle latch (build 369/910)');
assert(/\(_jHeld && !_jumpHeldPrev\) \|\| touchJump;/.test(src) && /touchJump = false;/.test(src), 'jump is a one-shot touch tap (edge-triggered, build 517)');
assert(/ads \|\| padAds \|\| touchAds \|\| editorAimPreview/.test(src), 'aim toggle feeds ADS');
assert(/if\(\(firing \|\| padFiring \|\| touchFiring\) && !heldProp && !editorOpen && !_levelLoaderActive && !drivingCar\)\{ if\(mountedTurret\) turretFire\(\); else shoot\(\); \}/.test(src), 'fire button feeds the shoot trigger');
assert(/if\(!isTouch && gameOn && !locked/.test(src), 'no pointer-lock grab on touch devices');

// touch look is applied in the loop (no pointer lock on mobile) and reset each frame
assert(/const tsens = \(ads\|\|touchAds\) \? \(TOUCH_ADS_SENS\*touchAdsMul\) : \(TOUCH_LOOK_SENS\*touchLookMul\);/.test(src), 'slower look while aiming, scaled by the player sensitivity multipliers (build 515)');
assert(/player\.yaw\s+-= touchLookDX \* tsens;/.test(src), 'drag rotates yaw');
assert(/touchLookDX = 0; touchLookDY = 0;/.test(src), 'look deltas consumed each frame');
assert(/const d=\(gameOn && !shopOpen && !choosingUpgrade\)\?'block':'none'/.test(src), 'UI shows only during active play');

// event wiring
assert(/stick\.addEventListener\('pointermove'/.test(src) && /touchMoveX=nx\/R; touchMoveZ=ny\/R; touchSprint=\(d\/R\)>0\.85/.test(src), 'joystick sets move vector + edge sprint');
assert(/look\.addEventListener\('pointermove'/.test(src) && /const dx=e\.clientX-lx, dy=e\.clientY-ly/.test(src) && /touchLookDX\+=dx/.test(src), 'look pad accumulates drag');
assert(/const fire=document\.getElementById\('tFire'\);[\s\S]*?touchFiring=true/.test(src) && /touchLookDX\+=\(e\.clientX-fx\)/.test(src), 'fire is hold-to-fire and drag-to-aim');
assert(/tap\('tJump', \(\)=>\{ touchJump=true; \}\)/.test(src) && /tap\('tReload'/.test(src) && /tap\('tNade'/.test(src) && /getElementById\('tUse'\)/.test(src) && /tap\('tWeapon'/.test(src), 'action buttons wired (USE moved to a tap-or-hold binding in build 908)');
assert(/aim\.addEventListener\('pointerdown', e=>\{[^}]*touchAds=!touchAds;/.test(src), 'aim toggles ADS (and now drags to look)');

// --- runnable: joystick vector (clamped to radius, normalized, edge = sprint) ---
const R = 60;
const stick = (dx,dy)=>{ const d=Math.hypot(dx,dy)||1, cl=Math.min(d,R); return { x:dx/d*cl/R, z:dy/d*cl/R, sprint:(d/R)>0.85 }; };
let v = stick(60,0);  near(v.x, 1, 1e-9, 'full right = +1 X'); assert(v.sprint, 'edge push sprints');
v = stick(10,0);      near(v.x, 10/60, 1e-9, 'small push = analog'); assert(!v.sprint, 'small push does not sprint');
v = stick(120,0);     near(v.x, 1, 1e-9, 'beyond the ring clamps to 1');
v = stick(60,60);     near(v.x, Math.SQRT1_2, 1e-6, 'diagonal X normalized'); near(v.z, Math.SQRT1_2, 1e-6, 'diagonal Z normalized');

// landscape relayout: readouts to the top band, controls to the bottom band, notch-safe
assert(/if\(isTouch && document\.body\) document\.body\.classList\.add\('touch'\)/.test(src), 'touch devices get the body.touch class');
assert(/body\.touch #stats \{ top:/.test(html), 'integrity moves to the top band');
assert(/body\.touch #ammoPanel \{ top:/.test(html), 'ammo moves out of the fire corner');
assert(/body\.touch #score \{ top:/.test(html), 'score pinned to the top band');
assert(/body\.touch #tFire +\{ right: calc\(/.test(html), 'fire button repositioned for touch');
assert(/env\(safe-area-inset-bottom\)/.test(html), 'controls respect the safe area (notch/home bar)');
assert(/body\.touch #minimap \{ width:66px; height:66px/.test(html), 'minimap shrinks on touch so it does not block the view');
done('touch controls + mobile (stick / look / buttons / flags)');
