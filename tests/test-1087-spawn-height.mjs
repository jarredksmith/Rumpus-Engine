import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1087, user-reported: "I have no way to place enemy spawns on higher ground. I'm trying to put an
// enemy on the rooftop of a building, and it's forcing it to sit on the ground floor."
// Two separate causes: spawn markers stored no height at all, AND the floor lookup deliberately refuses to
// look above the player's head.

// ---------------------------------------------------------------- 1. the real bug: the ceiling
// _spawnFloorAt caps its surface search at player.pos.y + 2.5. That is correct for a RANDOM wave — build 617
// added it so enemies stop materialising on a roof while the player is inside the building — but it means an
// authored rooftop marker could never find the roof. Both are needed, so there are now two functions.
const at = extractFunction('_spawnFloorAt'), near_ = extractFunction('_spawnFloorNear');
assert(at && near_, 'both floor lookups exist');
assert(/player\.pos\.y[\s\S]{0,20}\+ 2\.5/.test(at), 'the random-wave lookup still ceilings at the player\'s head (build 617)');
assert(!/player\.pos/.test(near_), 'the authored lookup does not care where the player is standing');
assert(/surfaceTopUnder\(x, z, wantY \+ 1\.2, wantY \+ 50\)/.test(near_),
  '...it ceilings at the authored height, with a little headroom so a marker set just under the roof still finds it');

// run both against the same fake world: terrain at 0, a building roof at 8, the player on the ground floor
const runFloor = (fn, name, playerY) => new Function('surfaceTopUnder','terrainHeightAt','player',
  `${fn}\nreturn ${name};`)(
    (x, z, ceil) => { const surfaces = [0, 8]; let best = -Infinity;   // ground and roof
      for (const s of surfaces) if (s < ceil && s > best) best = s;
      return best; },
    () => 0,
    { pos: { y: playerY } });
{
  const old = runFloor(at, '_spawnFloorAt', 1.7);
  eq(old(0, 0), 0, 'the reported bug, reproduced: on the ground floor the old lookup finds only the ground');
  const raised = runFloor(near_, '_spawnFloorNear', 1.7);
  eq(raised(0, 0, 8), 8, '...and with an authored height of 8 the new lookup finds the roof');
  eq(raised(0, 0, 7.2), 8, '...even if the marker was left a little under it');
  eq(raised(0, 0, 3), 0, 'a marker below the roof still lands on the ground under it');
}
{
  const raised = runFloor(near_, '_spawnFloorNear', 1.7);
  // nothing solid at that height: hold the authored height rather than silently dropping to the terrain —
  // the enemy has gravity and will fall, which is at least what the creator drew.
  const empty = new Function('surfaceTopUnder','terrainHeightAt', `${near_}\nreturn _spawnFloorNear;`)(
    () => -Infinity, () => 0);
  eq(empty(0, 0, 12), 12, 'with nothing to stand on it holds the authored height and lets gravity resolve it');
  eq(raised(0, 0, 0), 0, 'and a height of 0 is exactly the ground');
}
// the branch itself: only an authored height changes the path, so every pre-1087 level is untouched
const se = extractFunction('spawnEnemy');
assert(/const _my=\(spawn && \+spawn\.y>0\) \? \+spawn\.y : 0;/.test(se), 'spawnEnemy reads the authored height');
assert(/_my \? _spawnFloorNear\([\s\S]{0,90}: _spawnFloorAt\(x,z\)/.test(se),
  '...and only then takes the new lookup — a marker without one behaves exactly as before');
assert(/terrainHeightAt\(x,z\):0\) \+ _my/.test(se),
  'the height is relative to the terrain under each candidate column, not an absolute world Y');
// the clearance spiral re-samples x/z, so the ceiling has to be recomputed per column, not once
assert(/const _surfAt=\(x,z\)=>/.test(se) && /for\(let r=1\.2; r<=8[\s\S]{0,200}_surfAt\(qx,qz\)/.test(se),
  '...which is why _surfAt takes x,z: the clearance spiral moves the column');

// ---------------------------------------------------------------- 2. the marker stores it
const bsm = extractFunction('buildSpawnMarker');
assert(/y: Math\.max\(0, Math\.min\(SPAWN_MAX_Y, \+opts\.y\|\|0\)\)/.test(bsm),
  'the marker carries a height, clamped on the way in');
assert(/const SPAWN_MAX_Y = \d+;/.test(src), 'with a stated ceiling');
assert(/refreshSpawnMarkerY\(g\);/.test(bsm), '...and is placed at it when built');
const rsy = extractFunction('refreshSpawnMarkerY');
// build 1088 wrapped the terrain read in a try/catch — saved markers are rebuilt before the probe globals
// exist, and an unguarded call killed the boot. The MEANING is unchanged: height is measured from terrain.
assert(/let terr=0; try\{ if\(typeof terrainHeightAt==='function'\) terr=terrainHeightAt\(gx,gz\); \}catch\(e\)\{\}\n\s*const gy=terr\+\(\+m\.y\|\|0\);/.test(rsy),
  'the height is measured from the terrain, like the player start — so it rides terrain edits');
assert(/g\.position\.y=gy;/.test(rsy), '...and the marker actually moves there');
// height aids, mirroring the player start marker exactly
assert(/if\(surf===-Infinity \|\| surf>gy\+0\.01\) surf=terr;/.test(rsy),
  'the drop line measures to what is BELOW the marker, ignoring anything above it');
assert(/dl\.scale\.set\(1,h,1\); dl\.position\.y=-h\/2; sh\.position\.y=-h\+0\.04;/.test(rsy),
  '...stretching a drop line down to a landing disc');
assert(/if\(h>0\.15\)/.test(rsy), '...shown only once the marker is genuinely raised');
// so a marker resting ON the roof draws nothing (there is no gap), and one floating above it measures to
// the ROOF rather than to the ground far below. Verified in a browser both ways.
{
  const aid = new Function('surfaceTopAt','terrainHeightAt', `
    return (markerY, roof)=>{
      const terr=terrainHeightAt(), gy=markerY;
      let surf=surfaceTopAt(roof);
      if(surf===-Infinity || surf>gy+0.01) surf=terr;
      return Math.max(0, gy-surf);
    };`)((roof)=>roof, ()=>0);
  eq(aid(12, 12), 0, 'resting on a 12-high roof: no gap, so no drop line');
  eq(aid(16, 12), 4, 'floating 4 above it: the aids measure to the roof...');
  eq(aid(16, -Infinity), 16, '...and to the terrain when there is no roof at all');
  eq(aid(5, 12), 5, 'a marker BELOW the roof ignores it and measures to the ground');
}
assert(/g\.userData\.dropLine=dropLine/.test(bsm) && /g\.userData\.shadow=shadow/.test(bsm), 'both aids are built');
// the patrol polyline starts at the post, which can now be in the air
assert(/new THREE\.Vector3\(g\.position\.x, \(g\.position\.y\|\|0\)\+0\.12, g\.position\.z\)/.test(extractFunction('refreshRouteViz')),
  'a patrol route drawn from a raised marker starts at the marker, not on the floor beneath it');

// ---------------------------------------------------------------- 3. you can drag it up
const setPos = src.match(/\} else if\(editorActive==='spawns'\)\{[\s\S]*?s\.pz=v\.z;/);
assert(setPos, 'the gizmo has a spawn branch');
assert(!/g\.position\.set\(v\.x, 0, v\.z\);\s*\/\/ spawns live on the floor/.test(src),
  'the gizmo no longer throws the Y away — that line WAS the "forced to the ground floor" half of the bug');
assert(/g\.userData\.mark\.y=Math\.max\(0, Math\.min\(SPAWN_MAX_Y, v\.y-terr\)\)/.test(setPos[0]),
  'dragging up stores the height above the terrain beneath, clamped');
assert(/s\.px=v\.x; s\.py=g\.userData\.mark\.y; s\.pz=v\.z;/.test(setPos[0]), '...and the inspector follows the drag');

// ---------------------------------------------------------------- 4. and type it
const tgt = src.match(/spawns: \{[\s\S]*?code\(\)\{ return '\/\/ ===== Enemy spawns/);
assert(tgt, 'found the spawns inspector');
assert(/\{ k:'py',\s*label:'Height',\s*min:0,\s*max:SPAWN_SLIDER_Y/.test(tgt[0]),
  'there is a Height field (build 1088 gave the slider its own, shorter drag range — see test-1088)');
assert(/state: \{ px:0, py:0, pz:0/.test(tgt[0]), '...backed by state');
assert(/this\.state\.py=\(\+m\.y\|\|0\)/.test(tgt[0]), '...synced from the marker');
assert(/m\.y=Math\.max\(0, Math\.min\(SPAWN_MAX_Y, \+s\.py\|\|0\)\)/.test(tgt[0]), '...and applied back, clamped the same way');
assert(/refreshSpawnMarkerY\(g\)/.test(tgt[0]), '...redrawing the marker and its aids');

// ---------------------------------------------------------------- 5. it saves, and old levels do not change
assert(/\.\.\.\(m\.y\?\{y:\+m\.y\}:\{\}\)/.test(src),
  'the height is written only when set, so a ground-level level serializes byte-identically to before 1087');
assert(/t:\[g\.position\.x, g\.position\.z\]/.test(src),
  'and t stays a two-element x/z pair — widening it would break every older build reading these levels');
// a level saved before 1087 has no y at all; that must read back as 0, not NaN
{
  const mk = new Function('SPAWN_MAX_Y', `return (opts)=>Math.max(0, Math.min(SPAWN_MAX_Y, +opts.y||0));`)(60);
  eq(mk({}), 0, 'a pre-1087 spawn (no y at all) loads at ground level');
  eq(mk({ y: null }), 0, '...as does a null');
  eq(mk({ y: 'roof' }), 0, '...and junk');
  eq(mk({ y: -5 }), 0, 'a negative height is clamped to the ground');
  eq(mk({ y: 999 }), 60, '...and a silly one to the ceiling');
  eq(mk({ y: 8 }), 8, 'a real height survives');
}

done('build 1087: enemy spawns have a height — put the sniper on the roof');
