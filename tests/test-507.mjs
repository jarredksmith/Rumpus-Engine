import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 657: every placeable thing must be click-selectable in the editor. The scene-click picker already
// covered props/lights/spawns/pickups/loot/station/death-zones/jump-pads/fire-zones, but missed turrets,
// ladders, audio zones, the player start marker, and the extract zone. Also, the existing grouped-Zones
// section (build 649) wasn't being switched to the right tool when clicking a zone — fixed via a small
// revealZoneTool helper that jumps to World mode + sets the active zone type.

// --- the new targets are pushed into the ray list ---
assert(/for\(const g of turretModels\)\{ if\(g && g\.visible && !\(g\.userData && g\.userData\.edLock\)\) targets\.push\(g\); \}/.test(src), 'turrets added to the pick targets (build 1036: unless outliner-locked/hidden)');
/* build 1464: these two used to be hand-written lines in the pick path, and are now derived from
   ZONE_EDIT along with the other six zone types — which is why the hand-written form is gone. What this
   build asserted, that a ladder and an audio zone are click-selectable, is unchanged and stronger: it is
   now a property of every zone type rather than of two remembered ones. */
assert(/for\(const type in ZONE_EDIT\)/.test(src) && /ZONE_EDIT\[type\]\.markers\(\) \|\| \[\]\)\)\{ if\(m && m\.visible\) targets\.push\(m\); \}/.test(src),
  'every zone type is pushed into the pick targets from ZONE_EDIT');
for(const t of ['ladders', 'audiozones'])
  assert(new RegExp('\\b' + t + ':\\s*\\{').test(src), t + ' is a ZONE_EDIT row, so it is in that list');
assert(/if\(playerSpawnMarker && playerSpawnMarker\.visible\) targets\.push\(playerSpawnMarker\);/.test(src), 'the player-start marker is pickable when visible');
assert(/if\(extractZone && extractZone\.visible\) targets\.push\(extractZone\);/.test(src), 'the extract zone is pickable when visible');

// --- the picked-resolution loop maps each clicked root to the right kind ---
assert(/const ti = turretModels\.indexOf\(root\);\s*\n\s*if\(ti>=0\)\{ picked='turrets'; editorTargets\.turrets\.idx=ti; selTurrets=\[turretModels\[ti\]\]; break; \}/.test(src), 'a turret hit selects it + sets the index');
/* build 1326: five hand-written marker lookups became one table-driven _zoneHitAt, which also added the
   three types that were never click-selectable at all (triggers, water zones, effect zones). The claim is
   the same and now covers every type rather than the five somebody remembered. */
assert(/const zh=_zoneHitAt\(root\); if\(zh\)\{ picked=zh\.type; ZONE_EDIT\[zh\.type\]\.pick\(zh\.i\); break; \}/.test(src),
  'every zone marker hit is resolved from one table');
assert(/ladders:    \{ list:\(\)=>ladders/.test(src), 'a ladder hit selects it');
assert(/audiozones: \{ list:\(\)=>audioZones/.test(src), 'an audio-zone hit is resolved');
assert(/triggers:   \{ list:\(\)=>triggerZones/.test(src), '...and a trigger, which never was before');
assert(/if\(playerSpawnMarker && root===playerSpawnMarker\)\{ picked='pstart'; break; \}/.test(src), 'the player-start marker is resolved');
assert(/if\(extractZone && root===extractZone\)\{ picked='extract'; break; \}/.test(src), 'the extract zone is resolved');

// --- the new picked branches route the editor correctly ---
/* build 1466: the five hand-written zone branches in the pick chain collapsed into ONE off ZONE_EDIT,
   because three of them (triggers, water zones, effect zones) had never existed and those zones were
   therefore selected with no panel and no gizmo. What this asserts — clicking a zone reveals its tool —
   is unchanged and now holds for every zone type rather than the five somebody remembered. */
{
  const zb = src.slice(src.indexOf("else if(picked && ZONE_EDIT[picked])"));
  assert(zb.length > 0, 'the one zone branch exists');
  assert(/editorActive=picked;/.test(zb) && /revealZoneTool\(picked\)/.test(zb) && /_zd\.refresh\(\)/.test(zb),
    'clicking a ladder or an audio zone reveals its tool inside the Zones section and repaints its markers');
  assert(/updateGizmo\(\)/.test(zb), '...and grows drag handles, which the generic fall-through never did');
  for(const t of ['ladders','audiozones']) assert(new RegExp('\\b'+t+':\\s*\\{').test(src), t+' is a ZONE_EDIT row');
}
assert(/else if\(picked==='turrets'\)\{[\s\S]*?editorActive='turrets'; syncModeToActive\(\);/.test(src), 'clicking a turret jumps to its mode');
assert(/else if\(picked==='pstart'\)\{[\s\S]*?editorActive='pstart'; syncModeToActive\(\);/.test(src), 'clicking the player start jumps to its mode');
assert(/else if\(picked==='extract'\)\{[\s\S]*?editorActive='extract'; syncModeToActive\(\);/.test(src), 'clicking the extract zone jumps to its mode');

// --- the existing zone branches now also reveal the right tool (build 649 regression fix) ---
for(const z of ['deathzones','jumppads','firezones'])
  assert(new RegExp('\\b'+z+':\\s*\\{').test(src) && /else if\(picked && ZONE_EDIT\[picked\]\)\{/.test(src),
    'clicking a '+z+' marker reveals its tool inside the grouped Zones picker');

// --- the helper itself ---
assert(/function revealZoneTool\(type\)\{/.test(src), 'revealZoneTool is defined');
assert(/setEditorMode\('scene', true\)/.test(src), 'revealZoneTool jumps to World mode');
assert(/activeZoneType = type;/.test(src), 'revealZoneTool sets the active zone type');
assert(/applyZoneVisibility\(\);[\s\S]{0,200}renderZonePicker\(\);/.test(src), 'revealZoneTool shows the picked tool + repaints the picker');

// --- new selAudioZone state was added (no gizmo today, but the panel/highlight can use it later) ---
assert(/let selAudioZone = -1;/.test(src), 'selAudioZone is declared');

done('build 657: turrets / ladders / audio zones / player-start / extract are click-selectable');
