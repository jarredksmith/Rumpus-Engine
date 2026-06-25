import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 687: audio zones get a move handle (the transform gizmo). Selecting a zone (scene-click or the panel's
// "select" button) attaches the translate gizmo; dragging writes back the zone's x/z. Radius still lives in the panel.

// --- gizmo plumbing: read + write the selected zone's position ---
const gsp = extractFunction('getSelPos');
assert(/editorActive==='audiozones'\)\{ return \(selAudioZone>=0 && audioZoneMarkers\[selAudioZone\]\)\?audioZoneMarkers\[selAudioZone\]\.position:null; \}/.test(gsp), 'getSelPos returns the selected audio zone marker');
const ssp = extractFunction('setSelPos');
assert(/editorActive==='audiozones'\)\{[\s\S]*?const z=audioZones\[selAudioZone\]; if\(!z\) return; z\.x=\+v\.x\.toFixed\(2\); z\.z=\+v\.z\.toFixed\(2\);[\s\S]*?refreshAudioZoneMarkers\(\)/.test(ssp), 'dragging writes the zone x/z + refreshes');

// --- the gizmo turns on for a selected audio zone, move-only ---
const ug = extractFunction('updateGizmo');
assert(/\(editorActive==='audiozones'&&selAudioZone>=0\)/.test(ug), 'a selected audio zone is movable');
assert(/editorActive==='audiozones'\) mode='translate'/.test(ug), 'audio zones use the move (translate) handle only');

// --- the panel can select a zone to grab its handle ---
const panel = extractFunction('renderAudioZonesPanel');
assert(/selB\.onclick=\(\)=>\{ selAudioZone=i; editorActive='audiozones';[\s\S]*?updateGizmo\(\)/.test(panel), 'the panel "select" button arms the handle');
assert(/i===selAudioZone\?'selected':'select'/.test(panel), 'the selected zone is marked in the panel');

done('build 687: audio zone move handles');
