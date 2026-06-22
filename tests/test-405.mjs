import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// build 530: solo enemies spawn WITHIN the spawn region when one is active (same region-aware spawner as MP bots).
assert(/const _regionOn = !!\(gameCfg && gameCfg\.spawnRegion && gameCfg\.spawnRegion\.on\);/.test(src), 'spawnEnemy detects an active spawn region');
assert(/else if\(_regionOn && typeof randomSpawn==='function'\)\{ const sp=randomSpawn\(\);/.test(src), 'random/wave-fallback spawn routes through the MP region-aware randomSpawn');
assert(/mesh\.position\.set\(px, _spawnY\+1\.4, pz\);/.test(src), 'spawn places feet on the validated surface height (build 538)');
assert(/else if\(_spawnYaw!=null\) mesh\.rotation\.y = _spawnYaw;/.test(src), 'region spawn faces the play space');
// the no-region perimeter ring is preserved (unchanged feel when no boundary is set)
assert(/r=ARENA\*0\.6\+Math\.random\(\)\*ARENA\*0\.3;/.test(src), 'no-region perimeter ring fallback retained');

// executable: the region containment test (circle) used by the spawner accepts inside points, rejects outside
const _inRegion = new Function('gameCfg', 'return (' + extractFunction('_inRegion') + ')')(
  { spawnRegion: { on:true, shape:'circle', x:10, z:-4, r:6 } }
);
assert(_inRegion(10, -4) === true, 'region center is inside');
assert(_inRegion(15, -4) === true, 'point within radius is inside');
assert(_inRegion(20, -4) === false, 'point beyond radius is outside');
const _inRegionOff = new Function('gameCfg', 'return (' + extractFunction('_inRegion') + ')')({ spawnRegion: { on:false } });
assert(_inRegionOff(999, 999) === true, 'no active region -> everywhere counts as in-region (no confinement)');
done();
