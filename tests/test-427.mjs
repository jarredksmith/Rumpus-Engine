import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 560: both generators scatter cover (crates / low barriers / pillars) and seed gameplay (a spread of
// weapons + health + ammo + powerups, plus an extraction point). All ordinary level data -> serializes to MP.

// helpers + state exist
assert(/function _genScatterCover\(rnd, pool, gndAt, density\)\{/.test(src), '_genScatterCover exists');
assert(/function _genSeedPickups\(rnd, pool, gndAt\)\{/.test(src), '_genSeedPickups exists');
assert(/function _genPlaceExtract\(spots, sx, sz\)\{/.test(src), '_genPlaceExtract exists');
assert(/let _genCells=9, _lastMazeSeed=0, _genCover=true, _genLoot=true, _genTex=true, _genDesc='', _genVision=true;/.test(src), 'panel cover/loot toggle state');

// cover places clearAt-validated box props (so nothing lands in a wall or overlapping)
const sc = extractFunction('_genScatterCover');
assert(/if\(typeof clearAt==='function' && !clearAt\(jx, jz, gndAt\(jx,jz\)\)\) continue;/.test(sc), 'cover validates each spot is open (clearAt)');
assert((sc.match(/spawnProp\('box'/g)||[]).length>=3, 'cover has crate / low-cover / pillar variants');
assert((sc.match(/spawnProp\('box', \[jx, 0, jz,/g)||[]).length>=3, 'cover props ground via finalizeProp (t[1]=0, base on terrain) — not hovered by h/2');
assert(/Math\.min\(40,/.test(sc), 'cover count is capped for perf');

// pickups: clearAt-validated, pushed to pickupSpots, markers refreshed
const sp = extractFunction('_genSeedPickups');
assert(/pickupSpots\.push\(\{ x:\+s\[0\]\.toFixed\(2\), z:\+s\[1\]\.toFixed\(2\), kind \}\);/.test(sp), 'pickups push to pickupSpots');
assert(/!clearAt\(s\[0\],s\[1\],gndAt\(s\[0\],s\[1\]\)\)/.test(sp), 'pickups skip blocked spots (walls / cover)');
assert(/refreshPickupMarkers/.test(sp), 'pickup markers refresh after seeding');

// CROSS-CHECK: every kind the generator seeds must be a real, spawnable pickup kind (PICKUP_KIND_OPTS)
const optsLine = (src.match(/const PICKUP_KIND_OPTS = \[([\s\S]*?)\];/)||[])[1] || '';
const validKinds = new Set((optsLine.match(/\['([a-z_]+)'/g)||[]).map(m=>m.replace(/\['/,'').replace(/'/,'')));
const seeded = new Set();
for(const m of (sp.match(/'([a-z_]+)'/g)||[])) seeded.add(m.replace(/'/g,''));
for(const k of ['rifle','smg','shotgun','sniper','launcher','health','ammo','damage','speed','shield']){
  assert(seeded.has(k), 'generator seeds '+k);
  assert(validKinds.has(k), k+' is a real PICKUP_KIND_OPTS kind (will actually spawn)');
}

// extraction sets the spot + refreshes its marker
const pe = extractFunction('_genPlaceExtract');
assert(/extractSpot=\{ x:\+best\[0\]\.toFixed\(2\), z:\+best\[1\]\.toFixed\(2\) \};/.test(pe) && /refreshExtractMarker/.test(pe), 'extraction point set at the farthest spot + marker refreshed');

// both generators wire the helpers, gated on the toggles
const gm = extractFunction('generateMaze'), go = extractFunction('generateOffice');
assert(/if\(opts\.cover!==false\)\{[^]*_genScatterCover/.test(gm) && /if\(opts\.loot!==false\)\{[^]*_genSeedPickups/.test(gm), 'maze scatters cover + seeds pickups under the toggles');
assert(/if\(opts\.cover!==false\)\{[^]*_genScatterCover/.test(go) && /if\(opts\.loot!==false\)\{[^]*_genSeedPickups/.test(go), 'office scatters cover + seeds pickups under the toggles');
assert(/>=3\) coverSpots\.push/.test(go), 'office restricts cover to roomy cells (3+ open neighbours), not 1-wide halls');

// panel exposes the two content toggles
const panel = extractFunction('renderGeneratePanel');
assert(/Scatter cover/.test(panel) && /Seed weapons/.test(panel), 'panel has cover + pickups toggles');

// --- executable model: the office "roomy" filter keeps room interiors, rejects 1-wide corridors ---
// floor map: a 3x3 room (rows1-3,cols1-3) with a 1-wide corridor poking right from row2
const G=7; const wall=[]; for(let r=0;r<G;r++) wall.push(Array(G).fill(true));
for(let r=1;r<=3;r++) for(let c=1;c<=3;c++) wall[r][c]=false;   // room
wall[2][4]=false; wall[2][5]=false;                              // corridor (1-wide)
const isFloor=(r,c)=> (r>=0&&c>=0&&r<G&&c<G&&!wall[r][c]);
const roomy=(r,c)=> ((isFloor(r-1,c)?1:0)+(isFloor(r+1,c)?1:0)+(isFloor(r,c-1)?1:0)+(isFloor(r,c+1)?1:0))>=3;
assert(roomy(2,2), 'room center counts as roomy (cover allowed)');
assert(!roomy(2,5), 'a 1-wide corridor cell is NOT roomy (no cover there)');
eq(isFloor(2,4) && !roomy(2,4), true, 'corridor mouth stays clear of cover too');

done('cover scatter + gameplay seeding: validated placement, real pickup kinds, roomy-only cover, extraction point (build 560)');
