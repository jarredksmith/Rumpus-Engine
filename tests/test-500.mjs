import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 649: the five placeable volumes (audio / death / jump pad / ladder / fire) were five always-open
// sections in World mode — a wall of panels. They're now grouped under ONE "Zones" section with a segmented
// type picker; only the chosen tool's panel is shown. The individual render functions + host divs are reused
// untouched, so all the zone behaviour/serialization is unchanged — this is purely a UI regrouping.

// --- one grouped section owns all five hosts ---
assert(/sec\('Zones', 'zones',/.test(src), 'a single Zones section is registered');
for(const id of ['edAudioZones','edDeathZones','edJumpPads','edLadders','edFireZones']){
  assert(new RegExp('id="'+id+'" class="zoneHost"').test(src), id+' host lives inside the grouped Zones section');
}
assert(/id="edZonePicker"/.test(src), 'the Zones section has a type picker host');

// --- World/scene mode now lists just world + generate + the grouped zones ---
assert(/scene:   \['world','generate','zones'\]/.test(src), 'scene mode collapsed 5 zone sections into 1');

// --- picker state + the two helpers ---
assert(/const ZONE_TYPES = \[\['audiozones'/.test(src), 'ZONE_TYPES drives the segmented picker');
assert(/const ZONE_HOST = \{ audiozones:'edAudioZones'/.test(src), 'ZONE_HOST maps a type to its panel host');
assert(/let activeZoneType = 'audiozones';/.test(src), 'the active zone tool is tracked');
assert(/localStorage\.getItem\('breach_editor_zone'\)/.test(src), 'the choice persists across sessions');
assert(/function applyZoneVisibility\(\)/.test(src), 'applyZoneVisibility exists');
assert(/el\.style\.display = \(k===activeZoneType\)\?'':'none';/.test(src), 'only the active zone host is shown');
assert(/function renderZonePicker\(\)/.test(src), 'renderZonePicker builds the segmented control');
assert(/textContent=SEC_SUB\[activeZoneType\]/.test(src), 'the picker shows the active zone type’s plain-language description');

// --- wired into the editor build ---
assert(/if\(typeof renderZonePicker==='function'\) renderZonePicker\(\);/.test(src), 'picker is rendered when the editor is built');
assert(/if\(typeof applyZoneVisibility==='function'\) applyZoneVisibility\(\);/.test(src), 'zone visibility is applied when the editor is built');

done('build 649: the 5 placeable volumes grouped under one Zones picker');
