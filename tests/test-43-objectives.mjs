// (build 65) Objective layer: the win condition + HUD label are pluggable. 'eliminate' = clear waves,
// 'survival' = outlast a countdown (endless spawns). Existing waves route through it unchanged.
import { gameSource, extractFunction, done, assert, eq, near } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();

// config + persistence
assert(/objective: \(savedLevel && savedLevel\.game && savedLevel\.game\.objective\) \|\| 'eliminate'/.test(src), 'objective in gameCfg');
assert(/surviveSecs: \(savedLevel/.test(src), 'survival duration in gameCfg');
assert(/objective: gameCfg\.objective, surviveSecs: gameCfg\.surviveSecs/.test(src), 'serialized into the level');
assert(/gameCfg\.objective = g\.objective\|\|'eliminate'/.test(src), 'restored / synced to co-op clients');

// loop wiring
assert(/objectiveTick\(dt\);   \/\/ survival countdown/.test(src), 'objective ticks each frame (host/solo)');
assert(/objectiveActive\(\)==='eliminate' && gameCfg\.winWaves>0 && wave>=gameCfg\.winWaves/.test(src), 'eliminate win is objective-gated (survival never wins on wave count)');
assert(/if\(typeof startObjective==='function'\) startObjective\(\)/.test(src), 'run start resets the survival timer');
assert(/objectiveHUD\(\);\n  updateHUD\(\)/.test(src), 'startWave label goes through the objective HUD');

// editor
assert(/obBtn\('eliminate'/.test(src) && /obBtn\('survival'/.test(src) && /gameCfg\.objective=key/.test(src), 'editor objective selector');
assert(/gameCfg\.surviveSecs=Math\.max\(10/.test(src), 'editor survive-seconds input');

// win screen reflects the objective
assert(/gameCfg\.objective==='survival' \? \('SURVIVED '\+fmtClock\(gameCfg\.surviveSecs\)\)/.test(src), 'win screen shows survived time');

// --- runnable: the objective helpers ---
let won=false;
const mk = new Function('gameCfg','$','gameWon','waveRef', `
  let surviveLeft = 0; let wave = waveRef;
  ${extractFunction('objectiveActive')}
  ${extractFunction('fmtClock')}
  ${extractFunction('objectiveHUD')}
  ${extractFunction('objectiveTick')}
  return { fmtClock, objectiveActive, tick:(d)=>objectiveTick(d), setLeft:(v)=>{surviveLeft=v;}, get left(){return surviveLeft;}, hudText:()=>{ const e={textContent:''}; const old=$; return objectiveHUD(), null; } };
`);
const cfg = { objective:'survival', surviveSecs:120, winWaves:0 };
const api = mk(cfg, ()=>({textContent:''}), ()=>{won=true;}, 1);

eq(api.fmtClock(0), '0:00', 'clock floors at 0:00');
eq(api.fmtClock(5), '0:05', 'pads seconds');
eq(api.fmtClock(125), '2:05', 'minutes:seconds');
eq(api.fmtClock(60), '1:00', 'exact minute');
eq(api.objectiveActive(), 'survival', 'reads the active objective');

api.setLeft(2); api.tick(1); eq(Math.round(api.left), 1, 'survival timer counts down'); assert(!won, 'not won mid-countdown');
api.tick(1.5); assert(won, 'survival win fires when the timer hits 0'); eq(api.left, 0, 'timer clamps to 0');

// eliminate objective never auto-wins on the timer
won=false; const cfg2={ objective:'eliminate', surviveSecs:120, winWaves:5 };
const api2 = mk(cfg2, ()=>({textContent:''}), ()=>{won=true;}, 1);
api2.setLeft(1); api2.tick(5); assert(!won, 'eliminate ignores the survival timer');

// ---- Extraction objective (build 66) ----
assert(/extractHold: \(savedLevel/.test(src) && /extractRadius: \(savedLevel/.test(src), 'extraction params in gameCfg');
assert(/function buildExtractZone\(\)/.test(src) && /function placeExtraction\(\)/.test(src), 'beacon build + auto-placement');
assert(/objectiveActive\(\)==='extraction'/.test(src), 'extraction handled in the objective layer');
assert(/obBtn\('extraction'/.test(src), 'editor extraction option');
assert(/extractHold: gameCfg\.extractHold, extractRadius: gameCfg\.extractRadius/.test(src), 'extraction params serialized');
assert(/gameCfg\.extractHold = g\.extractHold!=null/.test(src), 'extraction params restored / synced');
assert(/\(objectiveActive\(\)==='extraction'\|\|objectiveActive\(\)==='defend'\) && extractZone && extractZone\.visible\) blip\(extractPos\.x, extractPos\.z/.test(src), 'extraction/defend zone shows on the minimap');
assert(/gameCfg\.objective==='extraction' \? 'EXTRACTED'/.test(src), 'win screen reads EXTRACTED');

// runnable: hold-to-extract accumulation + decay + win
let exWon=false;
const exmk = new Function('gameCfg','$','gameWon','player', `
  let surviveLeft=0, extractHoldT=0, extractZone=null, wave=1;
  const NET = { players:{} };   // (build 82) the extraction win-check now scans co-op teammates
  const extractPos = { x:10, z:10 };
  const performance = { now:()=>0 };
  ${extractFunction('objectiveActive')}
  ${extractFunction('fmtClock')}
  ${extractFunction('objectiveHUD')}
  ${extractFunction('objectiveTick')}
  return { tick:(d)=>objectiveTick(d), get hold(){return extractHoldT;} };
`);
const exPlayer = { pos:{ x:10, z:10 } };   // standing on the beacon
const exApi = exmk({ objective:'extraction', extractHold:3, extractRadius:3.5 }, ()=>({textContent:''}), ()=>{exWon=true;}, exPlayer);
exApi.tick(1); near(exApi.hold, 1, 1e-9, 'hold accumulates while in the zone'); assert(!exWon, 'not extracted mid-hold');
exApi.tick(1); exApi.tick(1.2); assert(exWon, 'extraction wins after holding the full duration');

exWon=false;
const exPlayer2 = { pos:{ x:10, z:10 } };
const exApi2 = exmk({ objective:'extraction', extractHold:3, extractRadius:3.5 }, ()=>({textContent:''}), ()=>{exWon=true;}, exPlayer2);
exApi2.tick(1); exPlayer2.pos.x=100; exPlayer2.pos.z=100; exApi2.tick(1);
assert(exApi2.hold < 1, 'progress decays once you leave the zone');

done('objective layer (eliminate / survival / extraction)');
