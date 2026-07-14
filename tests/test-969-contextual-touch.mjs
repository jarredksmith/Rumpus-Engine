// (build 969) CONTEXT-AWARE MOBILE CONTROLS. The touch HUD showed every button on every level —
// melee/crouch/reload/grenade sat on screen during a race, combat clutter on a puzzle.
// _touchCtxTick (which already hid flash/inv/chat) now also hides buttons the level can't use:
// race hides the on-foot combat + melee/crouch/nade (the driving cluster swaps in while driving);
// a gun-less level hides FIRE/AIM/RELOAD/WEAPON/GRENADE but keeps MELEE (fists); an empty build
// radial hides BUILD; top/side camera hides CROUCH. Gun combat levels are unchanged, and the
// touch-layout editor (hudPreview) force-shows everything so you can still arrange them.
// Verified live (touch forced): combat shows all; race hid fire/reload/nade/melee/crouch;
// unarmed hid guns but kept melee; empty radial hid build; hudPreview showed all.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// the extension lives in the existing contextual-visibility tick
assert(/if\(document\.body && document\.body\.classList\.contains\('hudPreview'\)\) return;/.test(src),
  'the layout editor is exempt (shows every button to arrange)');
assert(/const _race=_oa==='race';/.test(src), 'race is detected');
assert(/const _hasGuns = !\(typeof gameCfg!=='undefined' && gameCfg && gameCfg\.unarmed && !gameCfg\.allowPickup\)/.test(src),
  'a level with no guns is detected');
assert(/const _combat = !_race && _hasGuns;/.test(src), 'combat = has guns and not a race');
assert(/s\('tFire',   _combat\); s\('tAim', _combat\); s\('tReload', _combat\); s\('tWeapon', _combat\); s\('tNade', _combat\);/.test(src),
  'the gun cluster follows _combat');
assert(/s\('tMelee',  !_race\);/.test(src), 'melee hides only on a race (fists still work on foot elsewhere)');
assert(/s\('tCrouch', !_race && _vm==='fps'\);/.test(src), 'crouch hides on race and in top/side views');
assert(/s\('tBuild',  !!\(typeof radialCfg!=='undefined' && radialCfg && radialCfg\.length\)\);/.test(src),
  'build hides when there is nothing to place');

done('build 969: mobile controls match the level — no melee/crouch on a race, no guns unarmed');
