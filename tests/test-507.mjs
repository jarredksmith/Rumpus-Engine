import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 657: every placeable thing must be click-selectable in the editor. The scene-click picker already
// covered props/lights/spawns/pickups/loot/station/death-zones/jump-pads/fire-zones, but missed turrets,
// ladders, audio zones, the player start marker, and the extract zone. Also, the existing grouped-Zones
// section (build 649) wasn't being switched to the right tool when clicking a zone — fixed via a small
// revealZoneTool helper that jumps to World mode + sets the active zone type.

// --- the new targets are pushed into the ray list ---
assert(/for\(const g of turretModels\)\{ if\(g && g\.visible && !\(g\.userData && g\.userData\.edLock\)\) targets\.push\(g\); \}/.test(src), 'turrets added to the pick targets (build 1036: unless outliner-locked/hidden)');
assert(/for\(const m of ladderMarkers\)\{ if\(m && m\.visible\) targets\.push\(m\); \}/.test(src), 'ladders added to the pick targets');
assert(/for\(const m of audioZoneMarkers\)\{ if\(m && m\.visible\) targets\.push\(m\); \}/.test(src), 'audio zones added to the pick targets');
assert(/if\(playerSpawnMarker && playerSpawnMarker\.visible\) targets\.push\(playerSpawnMarker\);/.test(src), 'the player-start marker is pickable when visible');
assert(/if\(extractZone && extractZone\.visible\) targets\.push\(extractZone\);/.test(src), 'the extract zone is pickable when visible');

// --- the picked-resolution loop maps each clicked root to the right kind ---
assert(/const ti = turretModels\.indexOf\(root\);\s*\n\s*if\(ti>=0\)\{ picked='turrets'; editorTargets\.turrets\.idx=ti; selTurrets=\[turretModels\[ti\]\]; break; \}/.test(src), 'a turret hit selects it + sets the index');
assert(/const ldi = ladderMarkers\.indexOf\(root\);\s*\n\s*if\(ldi>=0\)\{ picked='ladders'; selLadder=ldi; break; \}/.test(src), 'a ladder hit selects it');
assert(/const azi = audioZoneMarkers\.indexOf\(root\);\s*\n\s*if\(azi>=0\)\{ picked='audiozones'; selAudioZone=azi; break; \}/.test(src), 'an audio-zone hit is resolved');
assert(/if\(playerSpawnMarker && root===playerSpawnMarker\)\{ picked='pstart'; break; \}/.test(src), 'the player-start marker is resolved');
assert(/if\(extractZone && root===extractZone\)\{ picked='extract'; break; \}/.test(src), 'the extract zone is resolved');

// --- the new picked branches route the editor correctly ---
assert(/else if\(picked==='ladders'\)\{[\s\S]*?editorActive='ladders';[\s\S]*?revealZoneTool\('ladders'\);[\s\S]*?refreshLadderMarkers/.test(src), 'clicking a ladder reveals the ladder tool inside the Zones section');
assert(/else if\(picked==='audiozones'\)\{[\s\S]*?editorActive='audiozones';[\s\S]*?revealZoneTool\('audiozones'\);/.test(src), 'clicking an audio zone reveals the audio tool');
assert(/else if\(picked==='turrets'\)\{[\s\S]*?editorActive='turrets'; syncModeToActive\(\);/.test(src), 'clicking a turret jumps to its mode');
assert(/else if\(picked==='pstart'\)\{[\s\S]*?editorActive='pstart'; syncModeToActive\(\);/.test(src), 'clicking the player start jumps to its mode');
assert(/else if\(picked==='extract'\)\{[\s\S]*?editorActive='extract'; syncModeToActive\(\);/.test(src), 'clicking the extract zone jumps to its mode');

// --- the existing zone branches now also reveal the right tool (build 649 regression fix) ---
for(const z of ['deathzones','jumppads','firezones'])
  assert(new RegExp("else if\\(picked==='"+z+"'\\)\\{[\\s\\S]*?revealZoneTool\\('"+z+"'\\);").test(src), 'clicking a '+z+' marker reveals its tool inside the grouped Zones picker');

// --- the helper itself ---
assert(/function revealZoneTool\(type\)\{/.test(src), 'revealZoneTool is defined');
assert(/setEditorMode\('scene', true\)/.test(src), 'revealZoneTool jumps to World mode');
assert(/activeZoneType = type;/.test(src), 'revealZoneTool sets the active zone type');
assert(/applyZoneVisibility\(\);[\s\S]{0,200}renderZonePicker\(\);/.test(src), 'revealZoneTool shows the picked tool + repaints the picker');

// --- new selAudioZone state was added (no gizmo today, but the panel/highlight can use it later) ---
assert(/let selAudioZone = -1;/.test(src), 'selAudioZone is declared');

done('build 657: turrets / ladders / audio zones / player-start / extract are click-selectable');
