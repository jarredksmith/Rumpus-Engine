// Waypoint patrol routes (build 36): a patrol enemy with a route walks it in order (loop or ping-pong),
// breaks off to chase when it detects a player, and the route persists + is editable.
import { extractFunction, gameSource, html, done, assert, eq } from './harness.mjs';
const enemyDesiredTarget = new Function('Math',
  '"use strict"; ' + extractFunction('enemyDesiredTarget') + '; return enemyDesiredTarget;')(Math);

const route = [{x:0,z:0},{x:10,z:0},{x:10,z:10}];
const mkEnemy = (loop)=>({ mode:'patrol', detectR:5, route:route.map(p=>({...p})), routeLoop:loop, routeIdx:0, routeDir:1, aware:false, mesh:{ position:{x:0,z:0} } });

// walk the route by snapping to the current waypoint each step; record the index it advances to
function walk(en, steps){
  const seq=[];
  for(let i=0;i<steps;i++){
    en.mesh.position.x = en.route[en.routeIdx].x; en.mesh.position.z = en.route[en.routeIdx].z;  // "arrive"
    const r = enemyDesiredTarget(en, 999, 999, 999, i*1000);
    assert(!r.chase, 'patrolling a route does not chase when no player is near');
    seq.push(en.routeIdx);
  }
  return seq;
}

// loop: 0 -> 1 -> 2 -> 0 ...
eq(JSON.stringify(walk(mkEnemy(true), 3)), JSON.stringify([1,2,0]), 'loop route advances and wraps to the start');

// ping-pong: 0 ->1 ->2 ->1 ->0 ->1 (bounces at both ends)
eq(JSON.stringify(walk(mkEnemy(false), 5)), JSON.stringify([1,2,1,0,1]), 'ping-pong route reverses at each end');

// detection overrides the route: a player in range -> chase
let en = mkEnemy(true);
const r = enemyDesiredTarget(en, 2, 1, 2.2, 0);
assert(r.chase && r.tx === 2 && r.tz === 1, 'route patroller breaks off to chase a detected player');

// a single-waypoint route just holds that point (no division/΄bounce issues)
en = { mode:'patrol', detectR:5, route:[{x:7,z:7}], routeLoop:false, routeIdx:0, routeDir:1, aware:false, mesh:{ position:{x:7,z:7} } };
const r1 = enemyDesiredTarget(en, 999, 999, 999, 0);
assert(!r1.chase && r1.tx === 7 && r1.tz === 7, 'single-waypoint route is stable');

// --- wiring ---
const src = gameSource();
assert(/route:\s*\(opts\.route\|\|\[\]\)\.map/.test(src), 'buildSpawnMarker parses a route');
assert(/route:\s*m\.route\.map\(p=>\[p\.x,p\.z\]\),\s*loop:\s*m\.routeLoop/.test(src), 'serializeLevel persists route + loop');
assert(/function refreshRouteViz\(g\)/.test(src), 'route is visualized in the editor');
const clickAppend = /spawnRouteEdit\.userData\.mark\.route\.push\(\{ x:gp\.x, z:gp\.z \}\)/.test(src);
assert(clickAppend, 'clicking the ground in route mode appends a waypoint');
assert(/_icn\('pencil'\)\+'Place waypoints'/.test(src) && /↩ Remove last/.test(src) && /✕ Clear route/.test(src), 'route editing UI present (build 819: SVG icons)');
assert(/_icn\('arrows'\)\+'Ping-pong'/.test(src) && /_icn\('repeat'\)\+'Loop'/.test(src), 'loop / ping-pong toggle present (SVG icons)');
done('waypoint patrol routes (loop / ping-pong / detect) + editor wiring');
