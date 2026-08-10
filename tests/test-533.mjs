import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 687: audio zones get a move handle (the transform gizmo). Selecting a zone (scene-click or the panel's
// "select" button) attaches the translate gizmo; dragging writes back the zone's x/z. Radius still lives in the panel.

// --- gizmo plumbing: read + write the selected zone's position ---
const gsp = extractFunction('getSelPos');
/* build 1466: this quoted the per-type line, and that line is gone — the zone type used to be written
   out by hand in five places and the last three each named six of the eight, which is how water zones and
   effect zones ended up selectable but un-draggable. What it means is asserted against the derived form. */
assert(/const _zd = ZONE_EDIT\[editorActive\];/.test(gsp) && /_zd\.markers\(\) \|\| \[\]\)\[_i\]/.test(gsp),
  'getSelPos returns the selected audio zone marker');
const ssp = extractFunction('setSelPos');
/* build 1326: the per-type branch became ZONE_EDIT + _zoneMove, which also writes Y and repaints through
   the table's own refresh/panel hooks. */
assert(/\} else if\(ZONE_EDIT\[editorActive\]\)\{[\s\S]{0,300}_zoneMove\(editorActive, v\);/.test(ssp), 'dragging writes the zone x/z + refreshes');
assert(/audiozones: \{ list:\(\)=>audioZones[\s\S]{0,200}refresh:\(\)=>refreshAudioZoneMarkers\(\)/.test(src), '...via the audio zone’s own refresh hook');

// --- the gizmo turns on for a selected audio zone, move-only ---
const ug = extractFunction('updateGizmo');
assert(/const _zsel = ZONE_EDIT\[editorActive\] \? \(ZONE_EDIT\[editorActive\]\.sel\(\) >= 0\) : false;/.test(ug), 'a selected audio zone is movable');
assert(/if\(ZONE_EDIT\[editorActive\]\) mode='translate';/.test(ug), 'audio zones use the move (translate) handle only');

// --- the panel can select a zone to grab its handle ---
const panel = extractFunction('renderAudioZonesPanel');
assert(/selB\.onclick=\(\)=>\{ selAudioZone=i; editorActive='audiozones';[\s\S]*?updateGizmo\(\)/.test(panel), 'the panel "select" button arms the handle');
assert(/i===selAudioZone\?'selected':'select'/.test(panel), 'the selected zone is marked in the panel');

done('build 687: audio zone move handles');
