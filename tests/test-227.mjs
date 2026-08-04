import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 319: sniper rifle with a true scope
assert(/sniper:\s*\{ name:'SNIPER',\s*drawMs:\d+, mag:5,/.test(src), 'sniper weapon entry exists');   // build 1172: entries gained per-weapon drawMs
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
// build 1140: the viewmodel's early-outs moved into _vmWanted(), which the post chain asks one step
// earlier so it can decide whether to composite the weapon. Same rule, one caller more.
assert(/_scopedNow\) return false;   \/\/ looking through the optic: no viewmodel/.test(extractFunction('_vmWanted')), 'gun viewmodel hidden while scoped');

// feel: heavier kick, deep report, key slots, resets
{ const _kv = (k) => { const m = src.match(new RegExp(k + ':\\s*\\{[^\\n]*kickV:([\\d.]+)')); return m ? +m[1] : NaN; };
  assert(_kv('sniper') > _kv('rifle') && _kv('sniper') > _kv('smg') && _kv('sniper') > _kv('pistol'),
    'scoped shot kicks harder (build 1362: per-weapon kickV replaced the scope-only x2.4 - the sniper carries the heaviest gun kick)'); }
assert(/sniper: \{ sub:\[45/.test(src), 'sniper has its own shot sound (a _SHOT_LAYERS entry since 1211 — deepest sub, longest tail)');
assert(/Digit4' && owned\[3\]/.test(src) && /Digit5' && owned\[4\]/.test(src), 'weapon slots 4+5 bound');
assert(/_w\.mag=_w\.magSize; _w\.reserve=Math\.min\(_w\.reserve0!=null\?_w\.reserve0:_w\.reserve, _w\.reserveMax\);/.test(src), 'fresh-run ammo reset (per-sheet loop since 1190 — sniper resets 5/20 from its factory sheet, proven executable in test-1190)');
assert(/let l=\['pistol','rifle','smg','shotgun','sniper','launcher','crowbar'\]\.filter/.test(src), 'duel loadout includes the sniper');
done();
