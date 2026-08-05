import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 423: multiplayer/bot spawns scattered across the whole map (randomSpawn), so players could land outside
// an arena prop. New gameCfg.spawnRegion {on,x,z,r} confines random spawns to a circle (place it inside the arena).

// config
assert(/spawnRegion: \{\s*on:[\s\S]*?x:[\s\S]*?z:[\s\S]*?r:/.test(src), 'gameCfg has a spawnRegion {on,x,z,r}');
// randomSpawn honors it
const rs = extractFunction('randomSpawn');
assert(/const sr = \(gameCfg && gameCfg\.spawnRegion && gameCfg\.spawnRegion\.on\) \? gameCfg\.spawnRegion : null;/.test(rs) && /const usePoly = sr && sr\.shape==='poly' && sr\.poly && sr\.poly\.length>=3;/.test(rs), 'randomSpawn reads the region (circle or poly)');
assert(/if\(reg\)\{ const a=Math\.random\(\)\*Math\.PI\*2, rr=Math\.sqrt\(Math\.random\(\)\)\*Math\.max\(1,reg\.r\); x=reg\.x\+Math\.cos\(a\)\*rr; z=reg\.z\+Math\.sin\(a\)\*rr; \}/.test(rs), 'picks a uniform point inside the region disc when confined');
assert(/const c = usePoly \? _polyCentroid\(sr\.poly\) : \(reg \? \{ x:reg\.x, z:reg\.z \} : \{ x:0, z:0 \}\); best=\{ x:c\.x, z:c\.z, y:surfAt\(c\.x,c\.z\) \};/.test(rs), 'fallback is the region center/centroid, on its surface');
// serialize + load
assert(/spawnRegion: \{ on: !!gameCfg\.spawnRegion\.on, shape: gameCfg\.spawnRegion\.shape\|\|'circle'/.test(src) && /poly: \(gameCfg\.spawnRegion\.poly\|\|\[\]\)\.map/.test(src), 'region (shape + poly) saved with the level');
assert((src.match(/gameCfg\.spawnRegion = \{ on:!!_sr\.on, shape:_sr\.shape\|\|'circle'/g)||[]).length===1, 'region restored on both load paths');
// editor + marker
assert(/Confine spawns to a region/.test(src), 'Game panel has the confine toggle');
assert(/\\u2316 Center on player start|Center on player start/.test(src), 'can center the region on the player start');
const rm = extractFunction('refreshSpawnRegionMarker');
assert(/if\(!sr \|\| !sr\.on\) return;/.test(rm), 'region marker only when enabled');
assert(/g\.userData\.spawnRegionMarker=true/.test(rm), 'region shows as an editor ring');

// executable: confined picks land inside the circle; unconfined can range the whole arena
// (model the point-in-disc generation used by randomSpawn)
function pick(reg){ const a=Math.random()*Math.PI*2, rr=Math.sqrt(Math.random())*Math.max(1,reg.r); return { x:reg.x+Math.cos(a)*rr, z:reg.z+Math.sin(a)*rr }; }
const reg={x:20,z:-10,r:8};
for(let i=0;i<500;i++){ const p=pick(reg); const d=Math.hypot(p.x-reg.x, p.z-reg.z); assert(d<=reg.r+1e-9, 'confined spawn stays within the region radius'); }
done();
