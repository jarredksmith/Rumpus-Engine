// (build 879) LEVEL-LOAD HYGIENE — user report: "loading different levels and examples loads elements
// from the previous loaded levels", and "if the player is in a car when they win or die, a new level
// still shows the car controls, and the speedometer shows on the main homepage."
// Four root causes, all fixed and verified headless (example chains, pickup round-trip, car HUD):
//   1. restoreLevel (community / share links / .json / undo) never restored OR cleared pickups/loot/inv.
//   2. The multiplayer adopt path dropped the modern pickup fields (item/transform/interact).
//   3. Example builders wiped only props — zones, terrain, paint, turrets and gameCfg bled through.
//   4. Every game-end path sets gameOn=false BEFORE driveUpdate could ever run its exitCar branch.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- 1. restoreLevel round-trips pickups / loot / inventory with the boot loader's exact field map ----
const bootMap = "x:+s.x||0, z:+s.z||0, kind:s.kind||'health', item:s.item, y:+s.y||0, rx:+s.rx||0, ry:+s.ry||0, rz:+s.rz||0, scale:(s.scale!=null?+s.scale:1), interact:!!s.interact";
const restore = src.slice(src.indexOf('function restoreLevel(level){'), src.indexOf('function performUndo(){'));
assert(restore.includes(bootMap), 'restoreLevel uses the same pickup field map as the boot loader');
assert(/pickupsOn = \(level\.pickupsOn !== false\);/.test(restore), 'pickupsOn restores');
assert(/lootSpots = Array\.isArray\(level\.loot\)/.test(restore), 'loot spots restore');
assert(/selPickup=-1; if\(typeof refreshPickupMarkers==='function'\) refreshPickupMarkers\(\);/.test(restore), 'markers rebuilt + stale selection dropped');
assert(/invCatalog = JSON\.parse\(JSON\.stringify\(level\.invItems\)\);/.test(restore), 'inventory catalog restores');
// an ABSENT pickups array must CLEAR (the ": []" arm) — that is the anti-bleed half of the fix
assert(/pickupSpots = Array\.isArray\(level\.pickups\) \? level\.pickups\.map[\s\S]{0,300}\)\) : \[\];/.test(restore), 'no pickups in the level = no pickups after load');

// ---- 2. the multiplayer adopt path carries the full fields now ----
const netAt = src.indexOf('function loadLevelFromNet(');
const net = src.slice(netAt, netAt + 12000);
assert(net.includes(bootMap), 'co-op joiners receive pickup items/transforms/interact flags');

// ---- 3. example loads start from a genuinely blank canvas ----
assert(/function wipeScene\(\)\{ pushUndoSnapshot\(\); _wipeSceneCore\(\); \}/.test(src), 'wipeScene = undo snapshot + core (behavior unchanged for its old callers)');
const ex = src.slice(src.indexOf('function _helpBuildExample(kind){'), src.indexOf("if(kind==='race'){"));
assert(/_wipeSceneCore\(\);/.test(ex), 'examples run the full scene wipe (zones, pickups, loot, audio)');
assert(/if\(typeof clearTurrets==='function'\) clearTurrets\(\);/.test(ex), '...and turrets');
assert(/worldCfg = Object\.assign\(\{\}, DEFAULT_WORLD\);/.test(ex), '...and the world (terrain/paint/sky/floor/arena all stock)');
assert(/gameCfg\.view='fps'; gameCfg\.viewDist=0; gameCfg\.viewAxis='x';/.test(ex), '...and the camera view (top-down must not bleed into the race example)');
assert(/gameCfg\.goalText=''; gameCfg\.winText=''; gameCfg\.loseText='';/.test(ex), '...and the objective texts');
assert(/playerSpawn\.x=0; playerSpawn\.z=0;/.test(ex), '...and the player start');
assert(/pushUndoSnapshot\(\);/.test(ex), 'one undo still restores the whole previous level');

// ---- 4. the car HUD can no longer be stranded ----
const ends = src.match(/if\(typeof drivingCar!=='undefined' && drivingCar && typeof exitCar==='function'\) exitCar\(\); gameOn=false; gameOver=true; safeExitPointerLock\(\);/g) || [];
eq(ends.length, 3, 'all three game-end paths (lose, win, net-end) exit the car first');
assert(/if\(!gameOn\) \{ if\(drivingCar && typeof exitCar==='function'\) exitCar\(\);/.test(src), 'the menu loop self-heals any leftover drive state (speedometer can never sit on the homepage)');
// exitCar itself hides the HUD — the contract these fixes rely on
assert(/const _dh=document\.getElementById\('driveHud'\); if\(_dh\) _dh\.style\.display='none';/.test(extractFunction('exitCar', src)), 'exitCar hides the speedometer');

done('build 879: loads wipe clean (pickups/zones/world/view) and the car HUD always stands down');
