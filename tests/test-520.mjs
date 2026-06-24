import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 672: "hands / unarmed" mode. A level can start the player with bare fists instead of a gun, turning BREACH
// into a fist-fight / adventure / puzzle base: punch (left-click), grab & carry & throw (G), and a held flashlight (L).

// --- a FISTS pseudo-weapon in the registry (melee, no ammo) ---
assert(/hands:   \{ name:'FISTS',[\s\S]*?melee:true, fists:true, reach:2\.3,/.test(src), 'WEAPONS.hands is a bare-fist melee weapon');

// --- per-level config: unarmed / allowPickup / flashlight (defaulted + sanitized off savedLevel) ---
assert(/unarmed: !!\(savedLevel && savedLevel\.game && savedLevel\.game\.unarmed\)/.test(src), 'gameCfg.unarmed defaults off');
assert(/allowPickup: \(savedLevel && savedLevel\.game && savedLevel\.game\.allowPickup!=null\) \? !!savedLevel\.game\.allowPickup : true/.test(src), 'gameCfg.allowPickup defaults on');
assert(/flashlight: !!\(savedLevel && savedLevel\.game && savedLevel\.game\.flashlight\)/.test(src), 'gameCfg.flashlight defaults off');

// --- the unarmed loadout: start on fists, no guns; otherwise the usual rifle ---
assert(/if\(gameCfg\.unarmed\)\{ owned = \['hands'\]; curWep='hands'; \} else \{ owned = \['rifle'\]; curWep='rifle'; \}/.test(src), 'startGame picks the fists/rifle loadout');

// --- a strict unarmed level (no pickups) refuses guns ---
const gw = extractFunction('giveWeapon');
assert(/if\(gameCfg\.unarmed && !gameCfg\.allowPickup && key!=='hands' && !\(WEAPONS\[key\]&&WEAPONS\[key\]\.fists\)\) return;/.test(gw), 'a strict unarmed level blocks giving guns');

// --- procedural first-person fists + punch lunge ---
assert(/function _buildFists\(\)\{/.test(src) && /function _setFistsVisible\(v\)\{/.test(src) && /function _punchFists\(\)\{/.test(src) && /function _animFists\(\)\{/.test(src), 'fist viewmodel + punch helpers exist');
const sw = extractFunction('showWeaponModel');
assert(/const isFists = \(key==='hands' \|\| \(WEAPONS\[key\] && WEAPONS\[key\]\.fists\)\);/.test(sw), 'showWeaponModel swaps to the fists viewmodel');
assert(/if\(isFists\)\{[\s\S]*?gunModel=null; sight=null;[\s\S]*?return; \}/.test(sw), 'fists hide every gun model');
const ma = extractFunction('meleeAttack');
assert(/if\(wep && wep\.fists && typeof _punchFists==='function'\) _punchFists\(\);/.test(ma), 'a fist melee triggers the punch lunge');

// --- held flashlight (L), gated on the level enabling it ---
assert(/function ensureFlashlight\(\)\{/.test(src) && /new THREE\.SpotLight\(0xfff0d4/.test(src), 'a camera-parented flashlight spotlight');
const tf = extractFunction('toggleFlashlight');
assert(/if\(!gameCfg\.flashlight\) return;/.test(tf), 'the flashlight only works when the level enables it');
assert(/if\(e\.code==='KeyL' && !e\.repeat\) toggleFlashlight\(\);/.test(src), 'L toggles the flashlight');

// --- persistence: serialized with the level + restored in both load paths ---
assert(/unarmed: !!gameCfg\.unarmed, allowPickup: gameCfg\.allowPickup!==false, flashlight: !!gameCfg\.flashlight,/.test(src), 'serialized with the level');
assert((src.match(/gameCfg\.unarmed = !!level\.game\.unarmed; gameCfg\.allowPickup = level\.game\.allowPickup!==false; gameCfg\.flashlight = !!level\.game\.flashlight;/g)||[]).length===2, 'restored in both load paths');

// --- editor exposes the toggles in the Gameplay panel ---
assert(/Start unarmed<\/b> \(fists only/.test(src), 'editor: Start unarmed toggle');
assert(/Flashlight<\/b> \(players toggle a held light with <b>L<\/b>\)/.test(src), 'editor: Flashlight toggle');

done('build 672: hands / unarmed mode (fists, carry, flashlight)');
