// (build 179) Animated props become KINEMATIC physics bodies so dynamic props get swept/launched by a
// moving platform (the trebuchet batting a ball), and the player fling is tunable via worldCfg.launchPower.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// animated props -> kinematic body
const asc = extractFunction('addStaticColliderFor');
assert(/o\.userData\.xa && o\.userData\.xa\.on/.test(asc), 'animated props detected');
assert(/RAPIER\.RigidBodyDesc\.kinematicPositionBased\(\)/.test(asc), 'built as kinematicPositionBased');
assert(/o\.userData\._kbody = rb/.test(asc), 'kinematic body handle stored on the prop');

// pose driven each step before world.step
const up = extractFunction('updatePhysics');
assert(/kb\.setNextKinematicTranslation\(\{ x:o\.position\.x/.test(up) && /kb\.setNextKinematicRotation/.test(up), 'kinematic pose pushed each step');
assert(up.indexOf('setNextKinematicTranslation') < up.indexOf('physWorld.step()'), 'pose set before stepping');

// handles cleared on teardown
assert(/for\(const o of colliders\)\{ if\(o\.userData\)\{ if\(o\.userData\._kbody\) o\.userData\._kbody = null; if\(o\.userData\._physStatic\) o\.userData\._physStatic = null; \} \}/.test(extractFunction('destroyPhysWorld')), 'kinematic handles dropped on destroy (and the 1194 static stamps with them)');

// launch power knob
assert(/launchPower:1,/.test(src), 'DEFAULT_WORLD has launchPower');
assert(/worldCfg\.launchPower = Math\.max\(0\.1, Math\.min\(5, \+worldCfg\.launchPower/.test(src), 'launchPower clamped in applyWorldCfg');
const xc = extractFunction('_xaCarry');
assert(/const LP = \(worldCfg && \+worldCfg\.launchPower\) \|\| 1;/.test(xc) && /player\.extVel\.x = \(_xaUp\.x\*sp \+ mvx\/dt\) \* LP/.test(xc), 'fling scales by launchPower');
assert(/slider\(b,'Launch power','launchPower',0\.25,4,0\.25\)/.test(src), 'launch-power slider in World panel');
done('kinematic moving platforms + launch power');
