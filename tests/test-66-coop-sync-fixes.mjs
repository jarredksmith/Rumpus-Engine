// (builds 94-97) Boss bar clears the wave panel; no firing while paused; co-op clients adopt the host's
// world + hide editor route lines; co-op clients play the host's custom SFX.
import { html, gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// 94: boss bar moved below the wave panel
assert(/#bossBar \{[^}]*top:122px/.test(html), 'boss bar sits below the wave panel (desktop)');
assert(/body\.touch #bossBar \{ top:158px/.test(html), 'boss bar below the wave panel (mobile)');

// 95: paused blocks the fire input
assert(/addEventListener\('mousedown', e=>\{\n  if\(radialOpen\)\{ if\(e\.button===0\) closeRadial\(true\); return; \}\n  if\(typeof buildMode!=='undefined' && buildMode\)\{[\s\S]{0,340}?\n  if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen\) return;/.test(src), 'mousedown ignores fire while paused (build 928: the build-mode branch sits between)');

// 96: client adopts host world + hides spawn/route visuals
const ll = extractFunction('loadLevelFromNet');
assert(/if\(level\.world\)\{ worldCfg = Object\.assign\(\{\}, DEFAULT_WORLD, level\.world\); _skyHdriUrl = null; applyWorldCfg\(\);/.test(ll), 'client applies host world (sky/ground/fog), resetting the sky guard');
assert(/setSpawnMarkersVisible\(editorOpen\)/.test(ll), 'client hides spawn markers + route lines during play');

// 97: host SFX sync
assert(/function curSounds\(\)\{ return \(typeof NET!=='undefined' && NET\.sounds\)/.test(src), 'curSounds prefers the host override');
assert(/if\(playSample\(\(curSounds\(\)\.shoot\|\|\{\}\)\[curWep\], \{vary:0\.04\}\)\)/.test(src), 'shoot SFX uses the active set');
assert(/sounds:audioSettings\.sounds, music:audioSettings\.musicUrl/.test(src), 'host sends its sounds in the welcome');
assert(/NET\.sounds=_sanitizeSounds\(NET\.pendingSounds\)/.test(src), 'client adopts the host sounds for the session');
done('co-op sync + HUD/pause fixes');
