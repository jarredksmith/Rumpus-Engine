// (build 878) SHOWCASE EXAMPLES — three new one-click tutorial projects that exercise everything from
// builds 871–877 in real compositions: a top-down twin-stick city (camera views + vehicles), a 2.5D
// side-scroller ascent (new primitives + glass opacity + win signals), and a living landscape (terrain
// sculpt + painted dirt path with SELF-GENERATED textures + primitive pines + pond & waterfall).
// Verified composing in headless Chromium (prop counts, systems, fx meshes, serialization); these pins
// guard the wiring and the design decisions that keep the examples deterministic and offline.
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the tutorials exist and point at their builders ----
for (const [id, ex] of [['tut-topdown','topdown'], ['tut-side','sidescroller'], ['tut-landscape','landscape']])
  assert(new RegExp(`id:'${id}',[^\\n]*example:'${ex}'`).test(src), `${id} tutorial wired to the '${ex}' example`);
// they sit with the other tutorials, before Save & share
assert(src.indexOf("id:'tut-topdown'") > src.indexOf("id:'tut-puzzle'") && src.indexOf("id:'tut-landscape'") < src.indexOf("id:'share'"),
  'tutorials grouped with the existing three');

// ---- top-down city ----
assert(/else if\(kind==='topdown'\)\{/.test(src), 'topdown builder exists');
assert(/let s=20260705; const rnd=\(\)=>\{ s=\(s\*1103515245\+12345\)&0x7fffffff;/.test(src), 'seeded rng — the city is deterministic, not a dice roll per load');
assert(/if\(Math\.abs\(gx\)<=0 && Math\.abs\(gz\)<=0\) continue;\s+\/\/ the spawn plaza stays open/.test(src), 'no building lands on the spawn');
assert(/kind==='topdown'\)\{[\s\S]{0,2200}gameCfg\.view='top'; gameCfg\.viewDist=32;/.test(src), 'sets the top-down camera view');
assert(/kind==='topdown'\)\{[\s\S]{0,2500}vehicleApply\(o, \{ maxSpeed:34/.test(src), 'a drivable car is part of the kit');

// ---- 2.5D ascent ----
assert(/else if\(kind==='sidescroller'\)\{/.test(src), 'sidescroller builder exists');
for (const p of ['stairs','wedge','torus','dome']) assert(new RegExp(`kind==='sidescroller'\\)\\{[\\s\\S]{0,3500}spawnProp\\('${p}',`).test(src), `the ascent uses the ${p} primitive`);
assert(/spawnProp\('stairs',\[9, 0, 0, 0, -Math\.PI\/2, 0/.test(src), 'stairs rotated 90° to climb along the lane');
assert(/const _glass=\(o\)=>\{[\s\S]{0,160}applyPropOpacity\(o, 0\.35\);/.test(src), 'the glass bridge uses build-871 opacity');
assert(/kind==='sidescroller'\)\{[\s\S]{0,4200}gameCfg\.view='side'; gameCfg\.viewAxis='x'; gameCfg\.viewDist=16;/.test(src), 'sets the side-scroll camera on the east–west lane');
assert(/kind==='sidescroller'\)\{[\s\S]{0,4200}signals=\[\{ when:'interacted', do:'win' \}\]/.test(src), 'the beacon wins the level');
// the whole course sits at z=0 — the lane players deploy on
const sideBlock = src.slice(src.indexOf("else if(kind==='sidescroller')"), src.indexOf("else if(kind==='landscape')"));
const lanes = [...sideBlock.matchAll(/spawnProp\('(?:box|stairs|wedge|torus|cone)',\s*\[[-\d.]+, [-\d.]+, ([-\d.]+),/g)].map(m=>+m[1]);
assert(lanes.length >= 9 && lanes.every(z => z === 0), `every course piece sits on the z=0 deploy lane (${lanes.length} checked)`);

// ---- living landscape ----
assert(/else if\(kind==='landscape'\)\{/.test(src), 'landscape builder exists');
assert(/worldCfg\.terrain = \{ seg:48, amp:5, freq:3, seed:20260705, h:generateTerrain\(48, 5, 3, 20260705\) \};/.test(src), 'deterministic hills (fixed seed)');
assert(/for\(let i=0;i<3;i\+\+\) _terrainPaint\(worldCfg\.terrain\.h, 49, ARENA, 26, -18, 14, 1\.3, 'lower'\);/.test(src), 'the pond bowl is sunk before placement');
assert(/const _exTex=\(base, flecks, seed\)=>\{ const c=document\.createElement\('canvas'\)/.test(src), 'grass/dirt textures are generated in-page — the example loads with zero downloads');
assert(/_paintStroke\(px, pz\); _paintStroke\(px, pz\);/.test(src) && /if\(typeof _paintCommit==='function'\) _paintCommit\(\);/.test(src), 'the dirt path is painted with the real brush, then committed');
assert(/terrainBrush\.radius=keep\.radius; terrainBrush\.soft=keep\.soft;/.test(src), 'the user’s brush settings are restored after the auto-paint');
assert(/Math\.hypot\(px-26, pz\+18\)<16 \|\| \(px>-6 && px<30 && pz>-20 && pz<12\)/.test(src), 'trees avoid the pond and the path corridor');
assert(/waterZones\.push\(_migrateWaterZone\(\{ x:26, z:-18, r:11, y:-3, h:2\.6/.test(src) && /waterfalls\.push\(_migrateWaterfall\(\{ x:26, z:-28\.5/.test(src), 'pond + waterfall placed in the bowl');
assert(/kind==='landscape'\)\{[\s\S]{0,5200}refreshWaterZones\(\);[\s\S]{0,400}refreshWaterfalls\(\);/.test(src), 'water visuals rebuilt immediately (the build-873 lesson)');
assert(/kind==='landscape'\)\{[\s\S]{0,6600}gameCfg\.view='fps'; gameCfg\.objective='puzzle';/.test(src), 'explicitly resets the view — loading it after the top-down example must not stay top-down');

done('build 878: three showcase tutorials — every 871–877 system demonstrated in playable examples');
