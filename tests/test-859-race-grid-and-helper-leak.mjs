// (build 859) TWO PLAYTEST FIXES:
//  1. RACE GRID — _raceSetup now grids the PLAYER'S car onto the racing line (pole position, lat 2.7,
//     just ahead of the bot rows) when the loop is closed, solo. Authors can park the car anywhere —
//     the help example used to leave it 6m off a 12m road — and the move is runtime-only (physHome
//     snaps it back on editor re-entry). The example's block car also sits ON the start line now.
//  2. HELPER LEAK — toggleEditor's close branch hid the vehicle forward arrow / pivot dot / orange
//     hit-area box / joint marker, but the DIRECT editor-close paths (startGame on Deploy, endGame)
//     didn't: with a car selected, Deploy carried them into play. Both paths hide them now.
//     (Verified end-to-end in a headless browser: all helpers false right after startGame + 70 frames.)
import { gameSource, assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();

// 1 — the grid block inside _raceSetup
const setup = src.match(/function _raceSetup\(\)\{[\s\S]{0,2600}/)[0];
assert(/_racePathAt\(_racePath\.total-4, 2\.7\)/.test(setup), 'pole position just ahead of the bots (they start at total-7-6i)');
assert(/if\(_racePath && \(typeof NET==='undefined' \|\| NET\.mode==='off'\)\)\{/.test(setup), 'solo only — MP humans are the field');
assert(/!p\.userData\.runtime/.test(setup), 'grids the AUTHORED car, never a bot clone');
assert(/pose\.yaw - \(\(car\.userData\.vehicle\.modelYaw\|\|0\)\*RAD\)/.test(setup), 'heading matches the racing line (modelYaw compensated)');
assert(/surfaceTopAt\(pose\.x, pose\.z, car, true, pose\.y\+6, true\)/.test(setup), 'rests on the actual track surface like the bots');
// the example car sits on the start line (road spans x±6; the old spot was x=12)
assert(/spawnProp\('box', \[2\.5, 0, 1\.5, 0, 0, 0, 1\.9, 1\.1, 4\.4\]/.test(src), 'the help example parks the car ON the start piece');
const seed = JSON.parse(readFileSync(new URL('../community/levels/stadium-circuit.json', import.meta.url), 'utf8'));
eq(seed.props.find(p=>p.veh).t.slice(0,3).join(','), '2.5,0,1.5', 'the library seed regenerated with the fixed placement');

// 2 — both direct-close paths hide the vehicle helpers (toggleEditor already did = 3 hide sites total)
const hideLine = /if\(typeof _vehArrow!=='undefined' && _vehArrow\) _vehArrow\.visible=false; if\(typeof _vehPivotDot!=='undefined' && _vehPivotDot\) _vehPivotDot\.visible=false; if\(typeof _carHitBox!=='undefined' && _carHitBox\) _carHitBox\.visible=false; if\(typeof _jointGiz!=='undefined' && _jointGiz\) _jointGiz\.visible=false;/g;
eq((src.match(hideLine)||[]).length, 2, 'startGame AND endGame direct-close paths hide arrow/pivot/hitbox/joint');
assert(/_vehArrow\.visible = false;   \/\/ build 719/.test(src), '...and toggleEditor keeps its own hide (3 paths covered)');

done('build 859: player car grids onto the racing line; editor vehicle helpers can no longer ride into play');
