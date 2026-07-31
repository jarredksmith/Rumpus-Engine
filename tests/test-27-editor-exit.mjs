// (build 43) From the editor you can jump straight to play or back to the start menu — no save+reload.
import { extractFunction, gameSource, done, assert } from './harness.mjs';
const src = gameSource();

// the editor panel exposes both buttons, wired to the right actions
assert(/id="edPlay"/.test(src) && /id="edMenu"/.test(src), 'editor has Play level + Main menu buttons');
assert(/querySelector\('#edPlay'\)\.onclick = \(\)=>\{ if\(typeof autoSaveNow==='function'\) autoSaveNow\('before play'\);[^\n]*startGame\(\); \}/.test(src), 'Play level autosaves then deploys the live build');   // build 1224: the handler also reads the start-at-wave field between the two — same intent, autosave first, deploy last
assert(/querySelector\('#edMenu'\)\.onclick = \(\)=>\{ editorToMenu\(\); \}/.test(src), 'Main menu returns to the start page');

// editorToMenu leaves cleanly and shows the menu without auto-starting a wave
const e2m = extractFunction('editorToMenu');
assert(/if\(editorOpen\) toggleEditor\(\)/.test(e2m), 'closes the editor (restores play rendering + physics)');
assert(/gameOn=false/.test(e2m), 'drops out of the running game so no wave auto-starts');
assert(/wave=0; toSpawn=0; spawnQueue=\[\]/.test(e2m), 'resets waves so Deploy starts fresh');
assert(/enemies\.length=0/.test(e2m), 'clears any enemies left in the scene');
assert(/showMainMenu\(\)/.test(e2m), 'shows the start overlay');

// showMainMenu restores the FULL menu (death/win screens overwrite it with Redeploy-only)
const sm = extractFunction('showMainMenu');
assert(/ov\.innerHTML = MENU_HTML/.test(sm), 'rebuilds the original menu markup');
assert(/bindMenu\(\)/.test(sm), 're-binds Deploy / Build / multiplayer');

// the menu HTML is captured once, before any screen replaces it
assert(/MENU_HTML===null\)\{ const ov0=document\.getElementById\('overlay'\); if\(ov0\) MENU_HTML = ov0\.innerHTML/.test(src), 'menu markup captured once in bindMenu');

// startGame already does full editor teardown, so Play level is safe (spot-check a couple of teardown bits)
const sg = extractFunction('startGame');
assert(/editorOpen=false/.test(sg) && /setSpawnMarkersVisible\('?false'?|setSpawnMarkersVisible\(false\)/.test(sg.replace(/\s+/g,' ')) , 'startGame exits editor state + hides markers');
done('editor -> play / main menu without save+reload');
