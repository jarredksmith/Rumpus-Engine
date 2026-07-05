import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 422: editor usability — (1) spawn-height visual aid (drop-line + ground shadow), (2) prop "snap bottom
// to ground" button, (3) "delete all objects" for a fresh scene.

// --- 1) spawn height aid ---
assert(/g\.userData\.dropLine = dropLine; g\.userData\.shadow = shadow;/.test(src), 'spawn marker carries a drop-line + shadow');
const rf = extractFunction('refreshPlayerSpawnMarker');
assert(/surfaceTopAt\(gx,gz\)/.test(rf), 'measures the surface beneath the spawn');
assert(/dl\.scale\.set\(1,h,1\); dl\.position\.y=-h\/2; sh\.position\.y=-h\+0\.04;/.test(rf), 'drop-line spans the gap, shadow sits on the surface');
assert(/if\(h>0\.15\)\{ dl\.visible=true; sh\.visible=true;[\s\S]*?else \{ dl\.visible=false; sh\.visible=false; \}/.test(rf), 'aids only show when actually raised');

// --- 2) prop snap-to-ground ---
const stb = extractFunction('surfaceTopBelow');
assert(/const box = new THREE\.Box3\(\)\.setFromObject\(obj\);/.test(stb), 'measures the prop bounding box');
assert(/colliders\.filter\(c=>c!==obj/.test(stb), 'ignores the prop itself when finding the surface below');
assert(/return \(top===-Infinity\) \? terr : Math\.max\(terr, top\);/.test(stb), 'falls back to terrain; otherwise highest surface below');
assert(/Snap bottom to ground/.test(src), 'Transform panel has a snap-to-ground button (props)');
assert(/const drop=bottom-surf; tgt\.state\.py = o\.position\.y - drop;/.test(src), 'snap lifts/lowers so the base rests on the surface');
assert(/if\(tgt===editorTargets\.props && tgt\.fields/.test(src), 'snap button only appears for props');

// --- 3) delete all ---
const ws = extractFunction('_wipeSceneCore') + extractFunction('wipeScene');   // build 879: wipeScene = pushUndoSnapshot + _wipeSceneCore
assert(/for\(let i=propModels\.length-1;i>=0;i--\) removeProp\(i\);/.test(ws), 'removes every prop via the proper remover');
assert(/lootSpots\.length=0;[\s\S]*?refreshLootMarkers/.test(ws) && /deathZones\.length=0;[\s\S]*?refreshDeathZoneMarkers/.test(ws), 'clears loot + death zones too');
assert(/audioZones\.length=0;[\s\S]*?refreshAudioZoneMarkers/.test(ws) && /pickupSpots\.length=0;/.test(ws), 'clears audio zones + pickups');
assert(/pushUndoSnapshot\(\);/.test(ws), 'wipe is undoable');
assert(/id="edWipe"/.test(src), 'Level file section has the Delete-all button');
assert(/if\(!armed\)\{ armed=true;[\s\S]*?Click again to delete ALL/.test(src), 'delete-all needs a two-step confirm');
done();
