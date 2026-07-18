// (build 146) Build mechanic: gravity-gun style grab / carry / stack / throw of dynamic props. Aim at a
// physics prop, press E to grab; it floats in front of the camera (velocity driven toward a hold point);
// scroll adjusts distance; click throws; E again drops. Dropping props on each other stacks them (physics).
// Host/solo author the bodies; a client streams its aim to the host, which stays authoritative.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

assert(/let heldProp=null, heldDist=4, heldNidLocal=null/.test(src), 'carry state');
assert(/const HOLD_MIN=2\.2, HOLD_MAX=6\.5, HOLD_GRAB_RANGE=6\.5, HOLD_K=14, HOLD_MAXV=22, HOLD_BREAK=7\.5, THROW_SPEED=17;/.test(src), 'carry tuning consts');
assert(/const _remoteHold=\{\};/.test(src), 'host tracks props clients carry');
assert(/function tryGrabProp\(\)/.test(src) && /function throwHeld\(\)/.test(src) && /function releaseHeld\(\)/.test(src) && /function driveAllHeld\(\)/.test(src), 'grab lifecycle fns');

const drv = extractFunction('_driveOneHeld');
assert(/body\.setLinvel\(\{x:vx,y:vy,z:vz\}, true\)/.test(drv), 'held body is velocity-driven toward the hold point');

const grab = extractFunction('tryGrabProp');
assert(/if\(!gameOn \|\| editorOpen \|\| shopOpen \|\| paused \|\| duelDead\) return false;/.test(grab), 'cannot grab in menus/dead');
assert(/sendToPlayer\(0, \{t:'grab', nid:heldNidLocal\}\)/.test(extractFunction('grabSpecificProp')), 'a client tells the host it grabbed (shared grab helper, build 688)');

const thr = extractFunction('throwHeld');
assert(/b\.applyImpulse\(_impJ, true\)/.test(thr), 'host throws via a forward impulse');
assert(/THROW_SPEED\*m/.test(thr), 'throw force scales with prop mass for consistent speed');

assert(/if\(heldProp\)\{ releaseHeld\(\); return; \}   \/\/ carrying a prop -> drop it/.test(src), 'E drops while carrying');
assert(/if\(!nearTarget\)\{ tryGrabProp\(\); return; \}/.test(src), 'E grabs when not aiming at a crate/station');
assert(/if\(e\.button===0\)\{ if\(heldProp\)\{ throwHeld\(\); return; \} firing=true; \}/.test(src), 'click throws while carrying');
assert(/if\(\(firing \|\| padFiring \|\| touchFiring \|\| touchFireBufT>performance\.now\(\)\) && !heldProp && !editorOpen && !_levelLoaderActive && !drivingCar && !\(typeof buildMode!=='undefined' && buildMode\)\)\{ if\(mountedTurret\) turretFire\(\); else shoot\(\); \}/.test(src), 'no shooting while carrying');
assert(/heldDist=Math\.max\(HOLD_MIN, Math\.min\(HOLD_MAX, heldDist - e\.deltaY\*0\.003\)\)/.test(src), 'scroll adjusts carry distance');
assert(/function updatePhysics\(dt\)\{\n  if\(!physWorld\) return;\n  driveAllHeld\(\);/.test(src), 'physics step drives held bodies');
assert(/if\(obj===heldProp\) continue;   \/\/ carried prop is driven by the grab system/.test(src), 'carried prop skips the collision resolver');

assert(/else if\(msg\.t==='grab'\)\{[\s\S]*?if\(!_remoteHold\[msg\.nid\]\)/.test(src), 'host handles client grab');
assert(/else if\(msg\.t==='hold'\)\{[\s\S]*?const h=_remoteHold\[msg\.nid\]/.test(src), 'host handles client carry stream');
assert(/else if\(msg\.t==='holdEnd'\)\{ const h=_remoteHold\[msg\.nid\]/.test(src), 'host handles client drop/throw');
assert(/if\(heldProp && heldNidLocal!=null\)\{ const tgt=_localHoldTarget\(\); try\{ NET\.conn\.send\(\{ t:'hold'/.test(src), 'client streams its aim while carrying');

assert(/<div id="grabHint"><\/div>/.test(html) && /#grabHint \{ position:fixed/.test(html), 'carry prompt element + style');
done('grab / carry / throw');
