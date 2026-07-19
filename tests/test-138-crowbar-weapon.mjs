// (build 195) Crowbar: a real melee WEAPON slot (distinct from the universal panic-punch). No ammo, big
// reach + knockback, buyable from the shop, swung with fire. Routes through the same meleeAttack, now
// parameterized by the weapon's reach/damage.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/crowbar: \{ name:'CROWBAR'.*melee:true, reach:3\.4, loud:0 \}/.test(src), 'crowbar weapon defined (melee, reach 3.4)');

const sh = extractFunction('shoot');
assert(/if\(w\.melee\)\{ if\(!w\.auto && firingLatch\) return; firingLatch=true; touchFireBufT=0; lastShot=now; triggerGunAnim\('shoot'\); meleeAttack\(w\); return; \}/.test(sh), 'firing a melee weapon swings it (before the ammo path)');

const m = extractFunction('meleeAttack');
assert(/function meleeAttack\(wep\)/.test(src), 'meleeAttack takes an optional weapon');
assert(/const RANGE = \(wep && wep\.reach\) \|\| MELEE_RANGE, DMG = \(wep && wep\.dmg\) \|\| MELEE_DMG;/.test(m), 'melee uses the weapon reach/damage, fists fall back to constants');
assert(/if\(now - _meleeT < \(wep \? 0 : MELEE_CD\)\) return;/.test(m), 'weapon gated by fireRate; fist by MELEE_CD');
assert(/botHurt\(best, DMG,/.test(m) && /if\(dist>RANGE\) return -1;/.test(m), 'damage + range use the parameterized values');

assert(/id:'crowbar'.*giveWeapon\('crowbar'\), oneTime:true/.test(src), 'crowbar buyable in the shop');
assert(/let l=\['pistol','rifle','smg','shotgun','sniper','launcher','crowbar'\]\.filter/.test(src), 'duel loadout includes the crowbar');

const hud = extractFunction('updateHUD');
assert(/w\.melee \? '\u221e'/.test(hud) && /w\.melee \? 'MELEE'/.test(hud), 'HUD shows a melee indicator instead of ammo');

done();
