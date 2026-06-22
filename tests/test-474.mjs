import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 620: "patrol wide + investigate" maze AI.
//  - Firing is loud: a shot alerts living enemies within HEAR_RADIUS and turns them toward the sound, so they
//    leave their area and navigate to where you fired (investigate) instead of holding a tiny patrol circle.
//  - Wandering/searching enemies now route through the nav grid when blocked (not just active chasers), so they
//    stop getting "confused" grinding on corners/objects.
//  - Wider default patrol radius + detect range.

// --- hearing helper exists and is wired into shoot() ---
assert(/const HEAR_RADIUS = 40;/.test(src), 'gunshot hearing radius is defined');
assert(/alertEnemiesNear\(player\.pos\.x, player\.pos\.z, HEAR_RADIUS/.test(src), 'firing alerts nearby enemies toward the shooter');

// --- executable: alertEnemiesNear wakes only LIVING enemies within the radius ---
const fn = extractFunction('alertEnemiesNear');
const run = new Function('alertEnemy', `
  const enemies = [
    { id:1, dead:false, hp:5, mesh:{position:{x:0,z:0}} },    // right at the sound
    { id:2, dead:false, hp:5, mesh:{position:{x:30,z:0}} },   // within 40
    { id:3, dead:false, hp:5, mesh:{position:{x:50,z:0}} },   // outside 40
    { id:4, dead:true,  hp:0, mesh:{position:{x:0,z:0}} },    // dead -> skipped
    { id:5, dead:false, hp:0, mesh:{position:{x:0,z:0}} },    // hp<=0 -> skipped
  ];
  ${fn}
  return (sx,sz,r)=>{ for(const e of enemies) e._woke=false; alertEnemiesNear(sx,sz,r); return enemies.filter(e=>e._woke).map(e=>e.id); };
`)((en, sx, sz)=>{ en._woke = true; en._lkp = { x:sx, z:sz }; });

eq(JSON.stringify(run(0,0,40)), JSON.stringify([1,2]), 'only living enemies within HEAR_RADIUS are alerted');
eq(JSON.stringify(run(0,0,55)), JSON.stringify([1,2,3]), 'a bigger radius reaches the far enemy too');
eq(JSON.stringify(run(0,0,5)),  JSON.stringify([1]),     'a small radius only wakes the one at the sound');

// --- wandering/searching enemies pathfind around walls (the td.chase-only gate is gone) ---
assert(/if\(en\._pathBlk && typeof _botFollowPath==='function'\)/.test(src), 'all blocked movement routes through the nav grid (not just chasers)');
assert(!/if\(td\.chase && en\._pathBlk/.test(src), 'the chase-only pathfinding gate is removed');
assert(/if\(en\._wantMove\)\{/.test(src) && !/if\(en\._chase && en\._wantMove\)\{/.test(src), 'stuck detection runs for any translating enemy (chase OR wander)');

// --- wider default patrol/detect ---
assert(/const detect = en\.detectR \|\| 18;/.test(src), 'wider default detect range');
assert(/Math\.random\(\)\*\(en\.patrolR \|\| 10\)/.test(src), 'wider default wander radius');
assert(/patrolR: \(spawn && spawn\.patrolR!=null\) \? spawn\.patrolR : 10,/.test(src), 'spawn default patrolR widened');
assert(/detectR: \(spawn && spawn\.detectR!=null\) \? spawn\.detectR : 18,/.test(src), 'spawn default detectR widened');
assert(/mode:'patrol', radius:12, detect:22/.test(src), 'editor default marker is wider');

done('maze AI: gunfire alerts/investigate, wandering enemies pathfind, wider patrol/detect (build 620)');
