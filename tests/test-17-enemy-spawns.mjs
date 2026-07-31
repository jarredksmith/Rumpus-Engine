// Authored enemy spawns + behavior state machine (build 33+).
import { extractFunction, gameSource, done, assert, eq } from './harness.mjs';

const enemyDesiredTarget = new Function('Math',
  '"use strict"; ' + extractFunction('enemyDesiredTarget') + '; return enemyDesiredTarget;')(Math);
const mk = (o) => Object.assign({ mesh:{ position:{ x:0, z:0 } }, aware:false, lostAt:0, wp:null, wpUntil:0 }, o);

// hunt: always chases the player, anywhere
let en = mk({ mode:'hunt' });
let r = enemyDesiredTarget(en, 40, -25, 999, 0);
assert(r.chase === true && r.tx === 40 && r.tz === -25, 'hunt chases the player from any range');

// hold: guards the post until a player enters detect range
en = mk({ mode:'hold', detectR:14, home:{ x:5, z:5 }, mesh:{ position:{ x:5, z:5 } } });
r = enemyDesiredTarget(en, 50, 50, 60, 0);              // player far
assert(!r.chase && r.tx === 5 && r.tz === 5, 'hold returns to its post when no player is near');
r = enemyDesiredTarget(en, 6, 6, 1.4, 0);               // player steps inside detect
assert(r.chase && r.tx === 6 && en.aware, 'hold engages when a player enters detect range');

// leash: stays aware through the buffer zone, drops awareness after the timeout
en = mk({ mode:'hold', detectR:14, home:{ x:0, z:0 }, aware:true });
r = enemyDesiredTarget(en, 0, 20, 20, 1000);            // inside detect*1.6 buffer -> still aware
assert(r.chase, 'stays aware within the leash buffer');
r = enemyDesiredTarget(en, 0, 30, 30, 1500);            // beyond buffer, timer starts
assert(r.chase, 'still chasing right after losing sight (grace period)');
r = enemyDesiredTarget(en, 0, 30, 30, 5200);            // > 3500ms later -> gives up (build 388)
assert(!r.chase && !en.aware && r.tx === 0 && r.tz === 0, 'leashes back to post after the timeout');

// patrol: wanders inside its radius when unaware, chases when it detects
en = mk({ mode:'patrol', detectR:10, patrolR:8, home:{ x:20, z:-20 }, mesh:{ position:{ x:20, z:-20 } } });
for (let i = 0; i < 40; i++) {
  r = enemyDesiredTarget(en, 999, 999, 999, i * 3000);   // no player; force fresh waypoints over time
  const dHome = Math.hypot(r.tx - 20, r.tz - (-20));
  assert(!r.chase && dHome <= 8 + 1e-9, `patrol waypoint stays within the patrol radius (d=${dHome.toFixed(2)})`);
}
r = enemyDesiredTarget(en, 22, -19, 2.2, 100000);        // player enters detect
assert(r.chase && r.tx === 22, 'patrol breaks off to chase a detected player');

// --- structural wiring ---
const src = gameSource();
assert(/function spawnEnemy\(spawn\)/.test(src), 'spawnEnemy takes an authored spawn descriptor');
const sw = extractFunction('startWave');
assert(/gameCfg\.mode === 'prebuilt'/.test(sw) && /spawnAppearsOnWave/.test(sw), 'pre-built waves spawn from authored markers');
assert(/randomWaveDescriptors\(wave, ARENA/.test(sw), 'random mode auto-generates scaled waves');
assert(/spawns:\s*spawnMarkers\.map/.test(src), 'serializeLevel persists authored spawns');
assert(/spawns:\s*\{[\s\S]*?isSpawns:\s*true/.test(src), 'editorTargets has a spawns target');
assert(/function buildSpawnMarker\(opts\)/.test(src), 'spawn marker builder exists');
assert(/function enemyDesiredTarget\(en, px, pz, dist, now, py\)/.test(src), 'AI state machine factored out (py since 1202: the pursuit carries the target\'s storey)');
done('authored enemy spawns + Hunt/Patrol/Hold AI');
