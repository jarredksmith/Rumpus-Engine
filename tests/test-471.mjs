import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 617: a roof/ceiling primitive over a maze or building no longer becomes the enemy spawn surface.

// ---- executable: surfaceTopUnder ignores hits above the ceiling ----
const deps = `let _downOrigin={set(){}}, _downDir={}, _downRay={ set(){}, far:0, intersectObjects(){ return _RAYHITS; } };
function _surfCull(){ return []; } let dynamicProps=[], heldProp=null; let _RAYHITS=[];`;
const stu = new Function(deps + '\n' + extractFunction('surfaceTopUnder') + '\nreturn (hits, ceil)=>{ _RAYHITS=hits; return surfaceTopUnder(0,0,ceil); };')();
// floor at 0.2, roof at 6 -> with a ceiling at 2.5, only the floor counts
eq(stu([{point:{y:0.2}},{point:{y:6.0}}], 2.5), 0.2, 'roof above the ceiling is ignored; floor wins');
eq(stu([{point:{y:6.0}}], 2.5), -Infinity, 'nothing at/below the ceiling -> -Infinity (caller falls back to terrain)');
eq(stu([{point:{y:0.0}},{point:{y:1.5}},{point:{y:2.4}}], 2.5), 2.4, 'highest surface still wins among those under the ceiling');

// ---- executable: _spawnFloorAt uses player head as the ceiling, falls back to terrain ----
const sf = (playerY, surf, terr)=> new Function('player','surfaceTopUnder','terrainHeightAt',
  extractFunction('_spawnFloorAt') + '; return _spawnFloorAt(0,0);')(
  { pos:{ y:playerY } }, ()=>surf, ()=>terr);
eq(sf(0, -Infinity, 0), 0, 'open ground: no surface under the ceiling -> terrain');
eq(sf(0, 0.3, 0), 0.3, 'floor prop just above terrain is used');
eq(sf(5, 5.0, 0), 5.0, 'on an upper floor (ceiling = playerY+2.5) the upper floor wins over terrain far below');

// wiring: both spawn paths now go through the ceiling-aware floor
assert(/const _surfAt=\(x,z\)=> _spawnFloorAt\(x,z\);/.test(extractFunction('spawnEnemy')), 'spawnEnemy uses the ceiling-aware floor');
assert(/const surfAt = \(x,z\)=> _spawnFloorAt\(x,z\);/.test(extractFunction('randomSpawn')), 'randomSpawn uses the ceiling-aware floor');
assert(/const ceil = \(\(typeof player!=='undefined' && player\) \? player\.pos\.y : 0\) \+ 2\.5;/.test(extractFunction('_spawnFloorAt')), 'ceiling is the player head height');

done('roof no longer hijacks enemy spawns: ceiling-limited floor lookup (build 617)');
