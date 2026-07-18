// (build 160) Transform-animated mechanisms (userData.xa): move/rotate any object into a moving platform,
// door, elevator. Loop/ping-pong/once + auto/E-activate. Collision follows the motion; the grounded player
// rides platforms; persists in the level; E-toggles sync in multiplayer. (Separate from GLB-clip anims.)
import { gameSource, html, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/function xaApply\(o, sx\)/.test(src) && /function updateXAnim\(dt\)/.test(src) && /function xaToggle\(o\)/.test(src), 'core mechanism functions');
assert(/function xaCapture\(\)/.test(src) && /function xaSnapToBase\(\)/.test(src), 'deploy-capture + editor-snap of point A');

const u = extractFunction('updateXAnim');
assert(/if\(!gameOn \|\| editorOpen \|\| paused\) return;/.test(u), 'mechanisms run only in live play');
assert(/a\.mode==='pingpong'/.test(u) && /a\.ph\+=step; if\(a\.ph>=1\) a\.ph-=1; lin=true;/.test(u), 'loop / ping-pong / once playback');
assert(/a\.trig==='interact'/.test(u) && /const tgt=a\.dest\?1:0;/.test(u), 'E-activate eases toward open/closed');
assert(/colliders\.indexOf\(o\)>=0\|\|o\.userData\.box\) refreshPropCollider\(o\)/.test(u), 'collision follows the motion');
assert(/const _xaOldBox = o\.userData\.box;[\s\S]*?if\(player\.onGround\) _xaCarry\(o, _xaOldBox, _xaPrevP, _xaPrevQ, dt, _peakSp\)/.test(u), 'grounded player rides on the PRE-rotation box, then collider refreshes');

const c = extractFunction('_xaCarry');
assert(/player\.pos\.x\+=mvx; player\.pos\.y\+=mvy; player\.pos\.z\+=mvz;/.test(c), 'carry adds platform delta to the player');

// interact + proximity + prompt
assert(/else if\(nearTarget\.type==='xanim'\)\{\s*const o = nearTarget\.obj;\s*if\(!tryUnlockProp\(o\)\) return;[\s\S]{0,40}xaToggle\(o\);/.test(src), 'E activates a mechanism (behind the build-331 lock gate)');
assert(/if\(best\) nearTarget = \{ type:'xanim', obj:best \};/.test(src), 'proximity detects E-activate mechanisms');

// persistence + restore
const pe = extractFunction('propEntry');
assert(/e\.xa=\{ mode:a\.mode/.test(pe), 'mechanism saved into the level');
assert(/if\(p\.xa\) xaApply\(obj, p\.xa\)/.test(src), 'mechanism restored on load');

// multiplayer toggle sync
assert(/function broadcastXAnim\(i\)/.test(src), 'toggle broadcast helper');
assert((src.match(/msg\.t==='xa'/g)||[]).length>=2, 'host + client handle xa toggles');

// editor UI
assert(/edFold\(motionHost, 'mech', 'Mechanism'/.test(src) && /seg\('Playback','mode'/.test(src) && /seg\('Trigger','trig'/.test(src), 'editor Mechanism section (title + playback + trigger), build 362');
// deploy/editor hooks
assert(/if\(typeof xaCapture==='function'\) xaCapture\(\)/.test(src), 'deploy captures base');
assert(/if\(typeof xaSnapToBase==='function'\) xaSnapToBase\(\)/.test(src), 'editor open snaps to base');
done('animated mechanisms');
