// (build 118) Better-looking projectiles: enemy shots are a hot-core + additive-halo bolt stretched
// along travel with a fading streak trail + impact flash; the player/remote tracer is a glowing
// additive beam instead of a 1px line. Built from primitives (no external particle lib).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// shared resources
assert(/const _boltCoreMat = new THREE\.MeshBasicMaterial\(\{ color:0xfff0c8 \}\);/.test(src), 'warm bolt core material');
assert(/blending:THREE\.AdditiveBlending, depthWrite:false \}\);/.test(src), 'additive halo material');
assert(/function makeEnemyBolt\(\)/.test(src) && /function emitBoltTrail/.test(src) && /function boltImpact/.test(src), 'bolt + trail + impact helpers');

// fire builds + orients the bolt
const fe = extractFunction('fireEnemyShot');
assert(/const mesh = makeEnemyBolt\(\);/.test(fe), 'enemy shot uses the bolt');
assert(/quaternion\.setFromUnitVectors\(_UP, dir\.clone\(\)\.normalize\(\)\)/.test(fe), 'bolt oriented along travel');
assert(/glow\.position\.y = -sl\*0\.5;/.test(extractFunction('makeEnemyBolt')), 'build 637: streak is a tapered tracer trailing the tip (shape baked from boltCfg)');
assert(/if\(!playFlipbook\('muzzle', from, 0\.7\*boltCfg\.muzzle\)\) flashLightAt\(from\)/.test(fe), 'enemy gun gets a muzzle flash (scaled by the gunfire config)');

// update emits trail + brighter impact
const ue = extractFunction('updateEnemyShots');
assert(/emitBoltTrail\(p\);/.test(ue), 'streak trail emitted each frame');
assert(/boltImpact\(p, boltCfg\.impactColor\)/.test(ue), 'impact flash on death (color from the enemy-gunfire config)');
assert(/playFlipbook\('smoke', p, 0\.22, null, 0\.45\)/.test(extractFunction('boltImpact')), 'bolt impacts kick a quick dust puff');

// tracer is now an additive beam mesh
const tr = extractFunction('tracer');
assert(/const beam = new THREE\.Mesh\(_tracerGeo, m\);/.test(tr), 'tracer is a beam mesh');
assert(/beam\.quaternion\.setFromUnitVectors\(_UP, d\.normalize\(\)\)/.test(tr) && /const w=0\.045\*tc\.width; beam\.scale\.set\(w, len, w\)/.test(tr), 'beam oriented + sized from the config');
assert(/if\(tc\.glow\) m\.blending=THREE\.AdditiveBlending/.test(tr), 'beam glows additively when enabled');

// lifecycle: trails fade in the loop, beam material disposed
assert(/for\(let i=boltTrails\.length-1;i>=0;i--\)\{/.test(src), 'bolt trails ticked in the loop');
assert(/if\(tr\.line\.material&&tr\.line\.material\.dispose\) tr\.line\.material\.dispose\(\)/.test(src), 'beam material disposed on removal');
done('better projectiles');
