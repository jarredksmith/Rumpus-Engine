import { gameSource, extractFunction, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const page = readFileSync(new URL('../breach.html', import.meta.url), 'utf8');
// build 363: leaving the editor (P / Play level / Main menu) tears down ALL editor visuals — gizmo,
//            selection box, spawn-radius rings, pickup pads, audio-zone rings.
// build 364: Play level reads primary; the two "exit/main menu" buttons read as a distinct caution color.

// --- 363: the shared play-transition block hides every marker family ---
// build 1499: the per-type audio call became the table-derived zone sweep, which covers audio zones and
// every other zone type at once — the intent (audio rings hidden on both transitions) is unchanged.
const playHide = 'if(typeof setSpawnMarkersVisible===\'function\') setSpawnMarkersVisible(false); if(typeof setPickupMarkersVisible===\'function\') setPickupMarkersVisible(false); if(typeof setLootMarkersVisible===\'function\') setLootMarkersVisible(false); if(typeof _edZoneMarkersVisible===\'function\') _edZoneMarkersVisible(false);';
assert((src.split(playHide).length - 1) === 2, 'both editor->play transitions hide spawn/pickup/loot + every zone marker');
assert(/function setAudioZoneMarkersVisible\(v\)\{ for\(const g of audioZoneMarkers\) g\.visible=v; \}/.test(src), 'audio-zone rings get a visibility toggle (no rebuild)');
assert(/if\(typeof gr!=='undefined' && gr\)\{ gr\.translate\.visible=gr\.scale\.visible=gr\.rotate\.visible=false; \}/.test(src), 'gizmo rig handles hidden on play');
assert(/if\(typeof selBox!=='undefined' && selBox\) selBox\.visible=false;/.test(src), 'selection box hidden on play');

// --- 364: button styling ---
assert(/\.pBtnExit \{/.test(page) && /color:#ffd9a8; background:rgba\(255,140,60,\.12\)/.test(page), 'a distinct exit/caution button class exists');
assert(/<button id="pauseExit" class="pBtnExit">/.test(page), 'pause Exit-to-menu uses the caution color');
assert(/<button id="edPlay" style="background:var\(--accent\);color:#05070a;font-weight:700;border:none">▶ Play level<\/button>/.test(page), 'editor Play level reads as the primary action (themable accent)');
assert(/<button id="edMenu" style="background:rgba\(255,140,60,\.14\);color:#ffd9a8[^"]*">⌂ Main menu<\/button>/.test(page), 'editor Main menu reads as caution');
done();
