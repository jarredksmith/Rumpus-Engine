import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 536: turrets get their own fire sound (Freesound search), stored alongside the other custom SFX.
assert(/function _emptySounds\(\)\{ return \{ shoot:\{\}, reload:\{\}, explode:'', coin:'', hit:'', kill:'', hurt:'', turret:'' \}; \}/.test(src), 'turret slot exists in the sounds shape (reload is now a per-weapon map, build 748)');
assert(/'explode','coin','hit','kill','hurt','turret'\]\)\{ if\(typeof s\[k\]==='string'\)/.test(src), 'sanitizeSounds keeps the turret URL');
assert(/'explode','coin','hit','kill','hurt','turret'\]\) loadSound/.test(src), 'preloadCustomSounds preloads the turret sound');
assert(/else if\(typeof s\.reload==='string' && s\.reload\)\{ o\.reload\._all=s\.reload; \}/.test(src), 'build 748: a legacy shared reload clip migrates to _all');
assert(/if\(!\(curSounds\(\)\.turret && playSample\(curSounds\(\)\.turret\)\)\) SFX\.shoot\(\);/.test(src), 'turretFire plays the custom turret sound, else the default shoot SFX');
assert(/\['Turret fire','turret'\]/.test(src), 'master sound editor lists a Turret fire slot');
assert(/_sndRow\('Turret fire', \(\)=>audioSettings\.sounds\.turret/.test(src), 'turret tab exposes the fire-sound row');
assert(/renderFreesoundBrowser\(urlHost, \(\)=>renderEditorFields\(\), \{ label:'Turret fire'/.test(src), 'turret tab mounts the Freesound browser for the fire sound');
done();
