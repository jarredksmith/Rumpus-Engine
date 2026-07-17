import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 319: sniper rifle with a true scope
assert(/sniper:\s*\{ name:'SNIPER',\s*mag:5,/.test(src), 'sniper weapon entry exists');
assert(/sniper:[^\n]*scope:true/.test(src), 'sniper flagged as scoped');
assert(/fireRate:1400/.test(src) && /dmg:95/.test(src), 'bolt-action cadence + heavy damage');
assert(/id:'sniper',\s*name:'SNIPER RIFLE',[^\n]*cost:400[^\n]*giveWeapon\('sniper'\), oneTime:true/.test(src), 'sniper purchasable in the shop');

// scope zoom: per-weapon default ADS fov is a hard zoom
assert(/aimByWep\.sniper = Object\.assign\(\{\}, AIM_DEFAULT, \{ fov: 12 \}\)/.test(src), 'sniper default ADS fov is a real zoom');

// scoped sensitivity
assert(/const SCOPE_SENS = 0\.00045/.test(src), 'scope sensitivity const');
assert(/WEAPONS\[curWep\]\.scope\) \? SCOPE_SENS : ADS_SENS/.test(src), 'look sens drops under the scope');

// overlay machinery
const so = extractFunction('_setScopeOverlay');
assert(/radial-gradient\(circle at 50% 50%, transparent/.test(so), 'circular vignette');
assert(/border-radius:50%/.test(so), 'center reticle ring');
assert(/_scopedNow = !!\(\(ads \|\| padAds \|\| touchAds\) && WEAPONS\[curWep\] && WEAPONS\[curWep\]\.scope && adsBlend > 0\.6 && gameOn && !editorOpen\)/.test(src), 'scope state derived from ADS blend in the loop (every aim input since build 913)');
assert(/_setScopeOverlay\(_scopedNow\)/.test(src), 'overlay toggled each frame');
assert(/crosshairEl\.style\.opacity = _scopedNow \? '0'/.test(src), 'normal crosshair hidden under the scope');
assert(/_scopedNow\) return;   \/\/ looking through the optic: no viewmodel/.test(src), 'gun viewmodel hidden while scoped');

// feel: heavier kick, deep report, key slots, resets
assert(/\(w\.scope\?2\.4:1\)/.test(src), 'scoped shot kicks harder');
assert(/curWep==='sniper'/.test(src), 'sniper has its own shot sound');
assert(/Digit4' && owned\[3\]/.test(src) && /Digit5' && owned\[4\]/.test(src), 'weapon slots 4+5 bound');
assert(/WEAPONS\.sniper\.mag=5; WEAPONS\.sniper\.reserve=20;/.test(src), 'fresh-run ammo reset');
assert(/owned=\['pistol','rifle','smg','shotgun','sniper','launcher','crowbar'\]/.test(src), 'duel loadout includes the sniper');
done();
