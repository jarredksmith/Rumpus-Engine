import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 675: fix — a custom imported viewmodel for the FISTS slot was ignored (showWeaponModel forced the
// procedural hands and returned early). Now a fists weapon only shows the procedural hands when it has NO model;
// once the creator imports one, it loads through the normal per-weapon viewmodel path.

const sw = extractFunction('showWeaponModel');
// the procedural-fists gate now requires the absence of a custom model
// build 1266: the gate is now the shared _wepShowsFists — the same predicate the third-person hand asks,
// so the two views can never disagree about whether the player is holding a gun. Executed, not just pinned.
assert(/const isFists = _wepShowsFists\(key\);/.test(sw), 'isFists is false when the weapon has an imported model');
{
  const showsFists = new Function('WEAPONS', extractFunction('_wepShowsFists') + '; return _wepShowsFists;')({
    hands:   { fists:true, model:'' },
    handsMod:{ fists:true, model:'x.glb' },
    crowbar: { melee:true, model:'' },
    crowbarM:{ melee:true, model:'crowbar.glb' },
    rifle:   { model:'' },
    rifleMod:{ model:'r.glb' },
  });
  assert(showsFists('hands') === true, 'bare fists show the procedural hands');
  assert(showsFists('handsMod') === false, 'a creator’s imported model for the fists slot wins (build 675)');
  assert(showsFists('rifle') === false, 'a gun with no model of its own is still a gun, not fists');
  assert(showsFists('rifleMod') === false, '...and so is one with a model');
  // build 1272 CHANGED this deliberately: a melee weapon with no model of its own is swung
  // bare-handed rather than putting the engine's rifle in the player's hands. What is unchanged is
  // the rule that a creator's own model always wins.
  assert(showsFists('crowbar') === true, 'a melee weapon with no model shows hands, not a rifle (build 1272)');
  assert(showsFists('crowbarM') === false, '...and a creator\u2019s own melee model still wins (build 674)');
  assert(showsFists('nosuch') === false, 'an unknown key never throws');
}
// when not fists, the function falls through to the cached/loading viewmodel path (no early return)
assert(/if\(isFists\)\{[\s\S]*?return; \}\s*\n\s*for\(const k in gunModelByWep\)\{ if\(gunModelByWep\[k\]\) gunModelByWep\[k\]\.visible = \(k===key\); \}/.test(sw),
  'a fists weapon with a model continues into the normal model path');
// the model URL resolver already honours a per-weapon override (so hands loads its imported model)
assert(/function wepModelUrl\(key\)\{ const w=WEAPONS\[key\]; return \(w && w\.model\) \? w\.model : gunModelUrl; \}/.test(src),
  'wepModelUrl returns the weapon’s own model when set');
// setting a model for the active weapon refreshes the viewmodel live
assert(/if\(key === curWep\) showWeaponModel\(key\);/.test(src), 'assigning a model refreshes the live viewmodel');

done('build 675: imported model overrides the procedural fists');
