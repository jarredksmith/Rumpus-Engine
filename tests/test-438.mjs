import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 583: weapon attachments — credit-unlocked, equipped per weapon per slot, modifying effective stats.

// --- run the REAL pure resolver against a test catalog/loadout ---
const resolve = new Function('return ('+extractFunction('_resolveAtt')+')')();
const CAT = {
  scope:  { slot:'optic',    mods:{ zoomMul:0.6, spreadMul:0.9 } },
  comp:   { slot:'muzzle',   mods:{ spreadMul:0.7 } },
  drum:   { slot:'magazine', mods:{ magMul:2.0 } },
  laser:  { slot:'tactical', mods:{ spreadMul:0.6, laser:true } },
};
const r = resolve('rifle', { rifle:{ optic:'scope', muzzle:'comp', magazine:'drum', tactical:'laser' } }, CAT);
eq(r.magMul, 2.0, 'drum doubles the magazine');
near(r.spreadMul, 0.9*0.7*0.6, 1e-9, 'spread multipliers stack across slots');
eq(r.zoomMul, 0.6, 'scope sets the ADS zoom');
eq(r.laser, true, 'laser flag propagates');
const empty = resolve('smg', {}, CAT);
eq(empty.magMul, 1, 'no attachments -> neutral mag'); eq(empty.spreadMul, 1, 'neutral spread'); eq(empty.zoomMul, 1, 'neutral zoom'); eq(empty.laser, false, 'no laser');
// unknown/missing ids are ignored, not crashed on
const safe = resolve('rifle', { rifle:{ optic:'nope' } }, CAT);
eq(safe.spreadMul, 1, 'unknown attachment id is skipped');

// --- model applyAttachments: effective stat from base * resolved ---
function applyMag(base, magMul){ return Math.max(1, Math.round(base*magMul)); }
eq(applyMag(30, 1.5), 45, 'extended mag 30 -> 45');
eq(applyMag(5, 2.0), 10, 'drum on a 5-round gun -> 10');
eq(applyMag(1, 1.5), 2, 'rounds up but at least 1');

// --- wiring + state ---
assert(/const ATT_SLOTS = \['optic','muzzle','magazine','tactical'\]/.test(src), 'four attachment slots');
assert(/const ATTACHMENTS = \{/.test(src) && /extmag:.*magMul:1\.5/.test(src) && /laser:.*laser:true/.test(src), 'catalog with real mods');
const aa = extractFunction('applyAttachments');
assert(/WEAPONS\[k\]\.magSize=newMag/.test(aa) && /if\(WEAPONS\[k\]\.mag>newMag\) WEAPONS\[k\]\.mag=newMag/.test(aa), 'mag capacity updated, current ammo clamped down');
assert(/WEAPONS\[k\]\.spread=base\.spread\*r\.spreadMul/.test(aa) && /_attZoom\[k\]=r\.zoomMul/.test(aa), 'spread + zoom applied from base snapshot');
assert(/const _attBase = \{\}/.test(src) && /_attBase\[k\]=\{ magSize:WEAPONS\[k\]\.magSize, spread:WEAPONS\[k\]\.spread, loud:/.test(src), 'base stats snapshotted once so re-apply is idempotent (build 964: + loudness)');
const buy = extractFunction('buyAttachment');
assert(/if\(credits<a\.cost\)/.test(buy) && /credits-=a\.cost; _ownedAtt\[id\]=true/.test(buy) && /_saveAtt\(\)/.test(buy), 'buying checks credits, unlocks, persists');
const eqp = extractFunction('equipAttachment');
assert(/if\(!a\|\|!_ownedAtt\[id\]\) return/.test(eqp) && /_attLoadout\[weaponKey\]\[a\.slot\]===id\) delete/.test(eqp) && /applyAttachments\(\); _saveAtt\(\)/.test(eqp), 'equip requires ownership, toggles the slot, re-applies + persists');
assert(/localStorage\.getItem\('breach_att_owned'\)/.test(src) && /localStorage\.getItem\('breach_att_loadout'\)/.test(src), 'ownership + loadout persist across sessions');
assert(/adsFovLive \* \(typeof _attZoomMul==='function' \? _attZoomMul\(curWep\) : 1\)/.test(src), 'scope zoom feeds the ADS fov (build 964: applied once, live at the camera blend)');
assert(/getElementById\('pauseLoadout'\)/.test(src) && /function openLoadout\(\)/.test(src), 'pause menu opens the loadout screen');
// startup must not crash: the init apply is gated until the aim/HUD systems exist
assert(/let _attAimReady = false;/.test(src) && /if\(_attAimReady && typeof applyWeaponAim/.test(src), 'startup apply is gated (no boot-time TDZ)');

done('weapon attachments: credit-unlocked, per-weapon per-slot, effective mag/spread/zoom with persistence (build 583)');
