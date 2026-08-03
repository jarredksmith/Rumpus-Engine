// (build 164) Grenade pickup kind; custom GLB models for any pickup kind (scaled, in place of the icon);
// gamepad access to the radial deploy menu (hold View/Back, right stick selects, release deploys).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// grenade pickup
assert(/grenade:\{ c:0x9be15a, label:'\+GRENADE' \}/.test(src), 'grenade pickup kind');
const ap = extractFunction('applyPowerupLocal');
assert(/else if\(kind==='grenade'\)\{ grenadeCount \+= 1;/.test(ap), 'grenade pickup grants a grenade');
assert(/\['grenade','Grenade'\]/.test(src), 'grenade in the editor kind list');

// custom models
assert(/let pickupModels =/.test(src), 'pickup model config');
const bm = extractFunction('buildPowerupMesh');
assert(/const pm = pickupModels\[kind\];/.test(bm) && /if\(pm && pm\.url && kind!=='item'\)\{/.test(bm) && /m\.scale\.setScalar\(pm\.scale\|\|1\)/.test(bm), 'custom scaled model replaces the icon (except item pads, which use per-item models)');
const sl = extractFunction('serializeLevel');
assert(/pickupModels: Object\.keys\(pickupModels\)/.test(sl), 'pickup models saved');
/* build 1325: the raw JSON.parse(JSON.stringify(...)) became _sanPickupModels — level data is untrusted
   and was the only dictionary with no coercion, cap or hasOwnProperty guard. Same claim, and STRONGER: it
   now also restores in restoreLevel, which never loaded it at all. */
assert(/pickupModels = _sanPickupModels\(level\.pickupModels\)/.test(src), 'pickup models restored on load');
assert(/pickupModels = _sanPickupModels\(level\.pickupModels\)/.test(extractFunction('restoreLevel')),
  '...including on a plain level load, which used to keep the PREVIOUS level’s models');
assert(/newPickupKind\+' model \.glb URL/.test(src), 'editor model URL field per kind');

// gamepad radial
assert(/let padRadialPrev = false;/.test(src), 'pad radial state');
assert(/function radialStick\(x,y\)/.test(src), 'stick-driven radial selection');
assert(/const radNow = down\(8\);\s*\n\s*if\(radNow && !padRadialPrev\) openRadial\(\);/.test(src), 'hold View/Back opens the radial');
assert(/if\(radialOpen\)\{ radialStick\(rx, ry\); if\(!radNow\) closeRadial\(true\);/.test(src), 'stick selects; release deploys');
done('grenade pickup + custom models + gamepad radial');
