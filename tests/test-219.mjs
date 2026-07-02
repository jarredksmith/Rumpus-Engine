import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 310: Escort objective (move a payload from spawn to the beacon)
assert(/const escortPos = new THREE\.Vector3\(\); let escortStartDist=1, escortMarker=null, _escortNear=false, _escortPct=0;/.test(src), 'escort state');
const setup = extractFunction('_setupEscort');
assert(/escortPos\.set\(playerSpawn\.x, 0, playerSpawn\.z\)/.test(setup) && /placeExtraction\(\)/.test(setup), 'payload starts at spawn, beacon = destination');
const so = extractFunction('startObjective');
assert(/objectiveActive\(\)==='escort'\) _setupEscort\(\); else _clearEscort\(\);/.test(so), 'startObjective sets up/tears down escort');
const ot = extractFunction('objectiveTick');
assert(/objectiveActive\(\)==='escort'/.test(ot), 'escort tick branch');
assert(/if\(near && remain>0\.05\)\{ const step=Math\.min\(remain, 2\.2\*dt\)/.test(ot), 'payload advances only while escorted');
assert(/if\(remain<=1\.2\)\{ if\(typeof gameWon==='function'\) gameWon\(\); \}/.test(ot), 'wins on delivery');
const hud = extractFunction('objectiveHUD');
assert(/objectiveActive\(\)==='escort'/.test(hud) && /STAY CLOSE/.test(hud), 'escort HUD label');
assert(/es:\[\+escortPos\.x\.toFixed\(2\), \+escortPos\.z\.toFixed\(2\)\], ep:_escortPct, en:_escortNear\?1:0/.test(src), 'escort synced to clients');
const aos = extractFunction('applyObjectiveSnapshot');
assert(/O\.o==='escort'/.test(aos) && /_ensureEscortMarker\(\); escortMarker\.visible=true;/.test(aos), 'client renders the payload');
assert(/obBtn\('escort',_icn\('truck'\)\+'Escort'\)/.test(src), 'editor has an Escort button (build 819: SVG icon)');
done();
