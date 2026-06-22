import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 538: enemy spawns validate against the arena mesh — snap to the surface, escape buried spots.
assert(/if\(typeof clearAt==='function' && !clearAt\(px,pz,_fy\)\)\{/.test(src), 'spawn checks clearance against the mesh');
assert(/for\(let r=1\.2; r<=8 && !_found; r\+=1\.2\)/.test(src), 'buried spawn spirals outward for a clear column');
assert(/if\(!_found && typeof randomSpawn==='function'\)\{ const sp=randomSpawn\(\)/.test(src), 'falls back to a fresh random spawn if no nearby clear column');
assert(/mesh\.position\.set\(px, _spawnY\+1\.4, pz\)/.test(src), 'enemy feet land on the validated surface');
// build 539: melee on proximity, not LOS
assert(/\} else if\(en\._chase && en\._dist < \(en\._reach \|\| 2\.4\)/.test(src), 'melee gate dropped the line-of-sight requirement');
assert(!/en\._chase && en\._see && en\._dist < \(en\._reach/.test(src), 'old LOS-gated melee is gone');
// build 540: stuck recovery
assert(/if\(en\._stuckT>0\.2 && td\.chase\)\{/.test(src), 'wedged chasing enemy wall-follows to one side (faster trigger, build 546)');
assert(!/if\(en\._stuckT>3\.5 && typeof randomSpawn==='function'\)\{ const sp=randomSpawn\(\); en\.mesh\.position\.set/.test(src), 'build 541: the jarring stuck-teleport is removed (enemies no longer vanish)');
assert(/if\(en\._chase && en\._wantMove\)\{/.test(src), 'build 541: stuck detection only runs while actively closing distance (not when attacking/holding)');
assert(/if\(_mv < \(en\.speed\|\|3\)\*dt\*0\.3\)\{ en\._stuckT=\(en\._stuckT\|\|0\)\+dt; \}/.test(src), 'stuck time accrues when a closing enemy stops progressing');
assert(/en\._wantMove = true;/.test(src), 'chase movement marks the enemy as actively trying to move');
done();
