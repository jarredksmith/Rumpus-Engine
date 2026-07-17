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
assert(/if\(gameCfg\.unarmed\)\{ owned = \['hands'\]; curWep='hands'; \} else \{ const _sw=\(gameCfg\.startWeapon && WEAPONS\[gameCfg\.startWeapon\] && !WEAPONS\[gameCfg\.startWeapon\]\.melee\) \? gameCfg\.startWeapon : 'rifle'; owned = \[_sw\]; curWep=_sw; \}/.test(src), 'startGame picks the fists/starting-weapon loadout');

// --- a strict unarmed level (no pickups) refuses guns ---
const gw = extractFunction('giveWeapon');
assert(/if\(gameCfg\.unarmed && !gameCfg\.allowPickup && key!=='hands' && !\(WEAPONS\[key\]&&WEAPONS\[key\]\.fists\)\) return;/.test(gw), 'a strict unarmed level blocks giving guns');

// --- procedural first-person fists + punch lunge ---
assert(/function _buildFists\(\)\{/.test(src) && /function _setFistsVisible\(v\)\{/.test(src) && /function _punchFists\(\)\{/.test(src) && /function _animFists\(\)\{/.test(src), 'fist viewmodel + punch helpers exist');
const sw = extractFunction('showWeaponModel');
assert(/const isFists = !\(WEAPONS\[key\] && WEAPONS\[key\]\.model\) && \(key==='hands' \|\| \(WEAPONS\[key\] && WEAPONS\[key\]\.fists\)\);/.test(sw), 'showWeaponModel swaps to the fists viewmodel (unless a custom model overrides it)');
assert(/if\(isFists\)\{[\s\S]*?gunModel=null; sight=null;[\s\S]*?return; \}/.test(sw), 'fists hide every gun model');
const ma = extractFunction('meleeAttack');
assert(/if\(wep && wep\.fists\)\{[\s\S]*?_punchFists\(\);[\s\S]*?triggerFistAnim\(_fistSide<0 \? 'punchL' : 'punchR'\);[\s\S]*?\}/.test(ma), 'a fist melee alternates the punch + plays the mapped clip');

// --- held flashlight (L), gated on the level enabling it ---
assert(/function ensureFlashlight\(\)\{/.test(src) && /new THREE\.SpotLight\(fc\.color/.test(src), 'a camera-parented flashlight spotlight');
const tf = extractFunction('toggleFlashlight');
assert(/if\(!gameCfg\.flashlight\) return;/.test(tf), 'the flashlight only works when the level enables it');
assert(/if\(e\.code===BINDS\.flashlight && !e\.repeat\) toggleFlashlight\(\);/.test(src) && /flashlight:'KeyL'/.test(src), 'L (rebindable) toggles the flashlight');

// --- persistence: serialized with the level + restored in both load paths ---
assert(/unarmed: !!gameCfg\.unarmed, startWeapon: [^,]+, allowPickup: gameCfg\.allowPickup!==false, flashlight: !!gameCfg\.flashlight,/.test(src), 'serialized with the level');
assert((src.match(/gameCfg\.unarmed = !!level\.game\.unarmed; gameCfg\.startWeapon = [^;]+; gameCfg\.allowPickup = level\.game\.allowPickup!==false; gameCfg\.flashlight = !!level\.game\.flashlight;/g)||[]).length===2, 'restored in both load paths');

// --- editor exposes the toggles in the Gameplay panel ---
assert(/Start unarmed<\/b> \(fists only/.test(src), 'editor: Start unarmed toggle');
assert(/Flashlight<\/b> \(players toggle a held light with <b>L<\/b>\)/.test(src), 'editor: Flashlight toggle');

done('build 672: hands / unarmed mode (fists, carry, flashlight)');
