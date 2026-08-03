// (build 40) Authorable player spawn point: a single editor marker (gizmo move + yaw) that decides
// where the player starts each run; persists in the level and applies in startGame.
import { extractFunction, gameSource, done, assert } from './harness.mjs';
const src = gameSource();

// data model + default (origin, facing 0 -> identical to the old hardcoded spawn)
assert(/let playerSpawn = \{[\s\S]*x:[\s\S]*z:[\s\S]*yaw:/.test(src), 'playerSpawn has x/z/yaw');
assert(/savedLevel\.pstart && savedLevel\.pstart\.x  !=null\) \? savedLevel\.pstart\.x   : 0/.test(src), 'defaults to arena center when unset (back-compat)');
assert(/function buildPlayerSpawnMarker\(\)/.test(src) && /function refreshPlayerSpawnMarker\(\)/.test(src), 'marker build/refresh helpers exist');

// it shows up as an editor tab
assert(/pstart: \{\s*label: 'Player start',\s*isPstart: true/.test(src), 'Player start is an editor target/tab');

// gizmo wiring: move writes x/z, rotate writes yaw, getters read the marker
/* build 1326: the drag writes Y as well now (reported: "allow the gizmo y handle to move it for height
   placement"). Same claim, plus the axis that was being thrown away. */
assert(/editorActive==='pstart'\)\{[\s\S]{0,900}playerSpawn\.x=v\.x; playerSpawn\.z=v\.z;/.test(src), 'gizmo move sets playerSpawn x/z');
assert(/playerSpawn\.y=\+Math\.max\(0, v\.y-_pterr\)\.toFixed\(2\);/.test(src), '...and y, terrain-relative and clamped at the floor');
assert(/editorActive==='pstart'\)\{\s*playerSpawn\.yaw = euler\.y; refreshPlayerSpawnMarker/.test(src), 'gizmo rotate sets playerSpawn yaw');
assert(/editorActive==='pstart'\)\{ return playerSpawnMarker\?playerSpawnMarker\.position:null; \}/.test(src), 'getSelPos reads the marker');
assert(/editorActive==='props' \|\| editorActive==='station' \|\| editorActive==='lights' \|\| editorActive==='spawns' \|\| editorActive==='pstart'/.test(src), 'gizmo treats player start as movable');
assert(/editorActive==='lights'\|\|editorActive==='spawns'\|\|editorActive==='pstart'\) && mode==='scale'/.test(src), 'player start translates/yaws only (no scale)');

// applied at run start
const sg = extractFunction('startGame');
assert(/player\.pos\.set\(playerSpawn\.x, terrainHeightAt\(playerSpawn\.x, playerSpawn\.z\)\+\(playerSpawn\.y\|\|0\)\+EYE, playerSpawn\.z\)/.test(sg), 'startGame spawns the player at the authored point');
assert(/player\.yaw=playerSpawn\.yaw/.test(sg), 'startGame applies the authored facing');

// persistence: serialize + restore + co-op net
assert(/pstart:  \{ x: playerSpawn\.x, y: playerSpawn\.y\|\|0, z: playerSpawn\.z, yaw: playerSpawn\.yaw \}/.test(src), 'serializeLevel writes pstart (with y)');
const restores = src.match(/playerSpawn\.x=level\.pstart\.x\|\|0; playerSpawn\.z=level\.pstart\.z\|\|0; playerSpawn\.y=level\.pstart\.y\|\|0; playerSpawn\.yaw=level\.pstart\.yaw\|\|0;/g) || [];
assert(restores.length >= 2, 'player start restored on load AND adopted from host in co-op');

// marker only visible while editing (rides the spawn-marker visibility toggle)
assert(/if\(playerSpawnMarker\) playerSpawnMarker\.visible = v;/.test(src), 'marker shows with the editor, hides on deploy');

done('authorable player spawn point (marker + gizmo + persistence + startGame)');
