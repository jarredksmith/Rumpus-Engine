import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// builds 390-391: third-person characters hold a weapon model parented to the avatar, swapped to match the
// active weapon (WEAPONS[key].model), positioned by a tunable grip offset (no bone dependency).

// --- attach/swap mechanism ---
const aag = extractFunction('attachAvatarGun');
// build 1266: same intent — the held model comes from the weapon config with a fallback so the hands are
// never empty — but resolved through the SAME function as the first-person viewmodel rather than restated.
assert(/let url = _wepShowsFists\(weaponKey\) \? '' : \(wepModelUrl\(weaponKey\) \|\| ''\);/.test(aag),
  'gun model comes from the weapon config, with a fallback so the hands are never empty (build 392, via wepModelUrl since 1266)');
assert(/if\(g\.userData\.gunKey === weaponKey && g\.userData\.gun\)\{/.test(aag), 'no reload when the weapon has not changed');
assert(/if\(g\.userData\.gun\.parent\) g\.userData\.gun\.parent\.remove\(g\.userData\.gun\); g\.userData\.gun=null/.test(aag), 'swapping removes the previous gun from its parent (bone or group)');
assert(/if\(!url\)\{ return; \}/.test(aag), 'a weapon with no model = bare hands (no crash)');
assert(/loadGLTFCached\(url,/.test(aag), 'reuses the cached GLB loader');
assert(/if\(g\.userData\._gunLoadUrl !== url \|\| g\.userData\.gunKey !== weaponKey\) return;/.test(aag), 'guards against the weapon changing mid-load');
assert(/o\.raycast=\(\)=>\{\};/.test(aag), 'the held gun never blocks shots or picks');

// --- grip offset: parented placement, tunable + persisted ---
assert(/const TP_GUN_DEFAULT = \{ x:0\.28, y:1\.15, z:-0\.42, yaw:0, pitch:0, roll:0, scale:1 \};/.test(src) && /let tpGunGrips = \{\};/.test(src), 'per-weapon grip map + default exist (build 395)');
const grip = extractFunction('_applyGunGrip');
assert(/const gr = gripOverride \|\| tpGunGrip\(weaponKey\);/.test(grip) && /gun\.position\.set\(gr\.x, gr\.y, gr\.z\);/.test(grip) && /gun\.rotation\.set\(gr\.pitch, gr\.yaw, gr\.roll\);/.test(grip) && /gun\.scale\.setScalar\(\(gr\.scale\|\|1\) \* \(gun\.userData\.norm\|\|1\)\);/.test(grip), 'grip applies the per-weapon position + rotation + scale, normalized (build 520)');
assert(/function _saveTpGun\(\)\{ try\{ localStorage\.setItem\('breach_tp_gun_grips', JSON\.stringify\(tpGunGrips\)\)/.test(src), 'per-weapon grips persist to localStorage');

// --- live retune across all avatars ---
const refr = extractFunction('refreshAvatarGunGrips');
assert(/grp\.userData\.gun/.test(refr) && /_applyGunGripToHand/.test(refr) && /_ownAvatar/.test(refr) && /rp\.mesh/.test(refr) && /previewAvatar/.test(refr), 'grip retune hits own + remote + preview guns (bone or fixed)');

// --- wired into local, remote, and preview ---
assert(/attachAvatarGun\(a, curWep, activeCharGrip\(curWep\)\);/.test(src), 'local avatar holds the active weapon (authored char grip wins, build 524)');
assert(/attachAvatarGun\(rp\.mesh, rp\.wep\|\|'rifle', rp\.grip\|\|null\);/.test(src), 'remote players hold their synced weapon + grip');
assert(/attachAvatarGun\(previewAvatar, \(typeof curWep!=='undefined'\?curWep:'rifle'\)\)/.test(src), 'editor preview shows the held gun for tuning');

// --- the seven grip sliders are in the Player tab ---
assert((src.match(/_grip\('/g)||[]).length === 7, 'seven grip sliders (X/Y/Z, yaw/pitch/roll, scale)');
assert(/<b>Held gun grip \(third-person\)<\/b>/.test(src), 'a labelled grip slider group exists');
done();
