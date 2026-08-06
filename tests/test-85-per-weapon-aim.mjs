// (build 123) Per-weapon aim: each weapon stores its own ADS pose (aimByWep). Switching weapons loads
// that weapon's pose live; the editor Aim tab edits the equipped weapon and has a per-weapon picker.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/const aimByWep = \{\};/.test(src) && /const AIM_DEFAULT =/.test(src), 'per-weapon storage + default');
assert(/function getWeaponAim\(key\)\{ if\(!aimByWep\[key\]\)/.test(src), 'lazy per-weapon default');
const aw = extractFunction('applyWeaponAim');
assert(/ADS_AIM\.set\(a\.x,a\.y,a\.z\); ADS_ROT\.set\(a\.rx\*Math\.PI\/180/.test(aw), 'applies the weapon pose to the live globals');

const sw = extractFunction('switchWeapon');
assert(/applyWeaponAim\(key\);/.test(sw), 'switching weapons loads its aim');
assert(/editorActive==='aim' && editorTargets\.aim\.syncFromWeapon/.test(sw), 'editor aim tab re-syncs on switch');
assert(/applyWeaponAim\(curWep\)/.test(extractFunction('giveDuelLoadout')), 'duel loadout applies aim for the equipped gun (build 1014: first ALLOWED gun under host match rules)');

// editor aim target
assert(/perWeapon: true,\s*syncFromWeapon\(\)\{ Object\.assign\(this\.state, getWeaponAim\(curWep\)\); \}/.test(src), 'aim target is per-weapon + syncs');
assert(/apply\(\)\{ const s=this\.state; const w=getWeaponAim\(curWep\); w\.x=s\.x;/.test(src), 'aim apply saves to the current weapon');
assert(/if\(tgt\.perWeapon && !tgt\.urlField\)\{/.test(src), 'aim tab renders a weapon picker');

// persistence
/* build 1420: only the poses a creator CHANGED are written. `getWeaponAim` creates an entry lazily on
   first aim, so the old whole-map copy grew the file by a full seven-field pose per weapon simply from
   PLAYING the level — and a level saved after play differed from the same level saved before it. The
   intent here (a per-weapon pose survives a save) is unchanged; omitting the defaults is lossless because
   a weapon with no entry gets AIM_DEFAULT on demand. */
assert(/aimWep:  \(function\(\)\{ const o=\{\}; let any=false;/.test(src), 'per-weapon aim serialized');
assert(/if\(level\.aimWep\)\{ for\(const k in level\.aimWep\) aimByWep\[k\]=/.test(src), 'per-weapon aim restored');
assert(/if\(!level\.aimWep\)\{ for\(const k of Object\.keys\(WEAPONS\)\) aimByWep\[k\]=Object\.assign\(\{\}, level\.aim\.state\)/.test(src), 'old single-aim levels seed every weapon (back-compat)');
// regression: per-weapon aim must be restored from the level on page-load init (not just the editor load path)
assert(/for\(const k in savedLevel\.aimWep\) aimByWep\[k\]=Object\.assign/.test(src), 'init restores the per-weapon aim map from savedLevel.aimWep');
assert(/if\(chg\)\{ o\[k\]=Object\.assign\(\{\}, a\); any=true; \}/.test(src),
  'save serializes every per-weapon pose that DIFFERS from the default — the full map minus the entries ' +
  'that carry no information');
done('per-weapon aim');
