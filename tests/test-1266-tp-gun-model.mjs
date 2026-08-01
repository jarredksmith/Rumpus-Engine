import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1266: reported from play, twice — "I can't see the weapon in the Held gun grip (third-person)
// section. It shows up in the weapons tab, but not when trying to set the position in the player tab."
//
// The two views resolved their weapon model DIFFERENTLY. The first-person viewmodel asks wepModelUrl(),
// which falls back to the engine's own shipped gun. attachAvatarGun read WEAPONS[key].model directly and
// fell back only to ANOTHER WEAPON'S custom model — and every shipped weapon carries model:'', so on the
// stock loadout the resolved url was '' and `if(!url){ return; }` left the hand empty. Not just in the
// editor panel: in third-person play, and on every remote player and bot.
//
// Probed live before the fix, editor open on the Player tab, with any external .glb served from a stub:
//   curWep rifle · WEAPONS.rifle.model ""   viewmodelUrl ...6b50c09358bb.glb   vmLoaded ["rifle"]
//   previewAvatar true · gunKey "rifle" · HAS_GUN false · gunLoadUrl null
// The viewmodel is the control: it loaded from the same route, so this was never the network. After:
//   HAS_GUN true · gunLoadUrl ...6b50c09358bb.glb · visible true · NDC (0.04, 0.06) — on screen.

// --- ONE rule, asked by both views ------------------------------------------------------------------
const showsFists = new Function('WEAPONS', extractFunction('_wepShowsFists') + '; return _wepShowsFists;')({
  hands:    { fists: true, model: '' },
  handsMod: { fists: true, model: 'custom.glb' },
  crowbar:  { melee: true, model: '' },
  rifle:    { model: '' },
  rifleMod: { model: 'r.glb' },
});
{
  eq(showsFists('hands'), true, 'bare fists show no gun in either view');
  eq(showsFists('handsMod'), false, 'a creator’s own model for the fists slot wins (build 674/675)');
  eq(showsFists('rifle'), false, 'a gun with no model of its OWN is still a gun — it falls back, it does not become fists');
  eq(showsFists('crowbar'), false, 'a melee weapon that is not FISTS is unchanged');
  eq(showsFists('nosuch'), false, 'an unknown key never throws');
}

// --- the third-person hand resolves through the viewmodel's own resolver -----------------------------
const aag = extractFunction('attachAvatarGun');
{
  assert(/let url = _wepShowsFists\(weaponKey\) \? '' : \(wepModelUrl\(weaponKey\) \|\| ''\);/.test(aag),
    'THE FIX: the held model comes from wepModelUrl — the same function the first-person viewmodel uses');
  assert(!/for\(const k of Object\.keys\(WEAPONS\)\)\{ if\(WEAPONS\[k\] && WEAPONS\[k\]\.model\)/.test(aag),
    'the borrow-another-weapon’s-model fallback is gone: it was empty on the stock loadout and put a RIFLE in a punching character’s hand once any weapon had a model');
  assert(/const isFists = _wepShowsFists\(key\);/.test(extractFunction('showWeaponModel')),
    'and the viewmodel asks the same predicate, so the two can never drift apart');
}
{ // execute the resolver pair together: what the eye sees and what the hand holds must agree
  const mk = (weapons, gunUrl) => new Function('WEAPONS', 'gunModelUrl',
    extractFunction('wepModelUrl') + '\n' + extractFunction('_wepShowsFists') +
    "; return (k)=> _wepShowsFists(k) ? '' : (wepModelUrl(k)||'');")(weapons, gunUrl);
  const stock = mk({ rifle:{model:''}, pistol:{model:''}, hands:{fists:true,model:''}, crowbar:{melee:true,model:''} }, 'ENGINE_GUN');
  eq(stock('rifle'), 'ENGINE_GUN', 'THE REPORTED CASE: a stock rifle now puts the engine’s gun in the hand');
  eq(stock('pistol'), 'ENGINE_GUN', '...as does every other stock weapon');
  eq(stock('crowbar'), 'ENGINE_GUN', '...and the crowbar, exactly as the viewmodel does');
  eq(stock('hands'), '', 'but FISTS still holds nothing — a punching character must not sprout a rifle');

  const custom = mk({ rifle:{model:'MY_RIFLE'}, pistol:{model:''}, hands:{fists:true,model:''} }, 'ENGINE_GUN');
  eq(custom('rifle'), 'MY_RIFLE', 'a creator’s own model for a weapon always wins');
  eq(custom('pistol'), 'ENGINE_GUN', '...and does NOT leak onto a different weapon (the old borrow did exactly that)');
  eq(custom('hands'), '', '...nor into the fists slot');
}

// --- one load in flight per avatar -------------------------------------------------------------------
{
  // attachAvatarGun runs EVERY FRAME while the Player tab is open and per avatar in play. Before 1266 this
  // path was reached only by a creator who had set a custom model; it is now the common path, so without a
  // guard every frame between issuing the load and the callback landing queues another whole skinned clone.
  assert(/if\(g\.userData\._gunLoading === url\) return;/.test(aag),
    'a load already in flight for this url is not re-issued frame after frame');
  assert(/\(gltf\)=>\{\s*g\.userData\._gunLoading = null;/.test(aag), 'the flag clears on success');
  assert(/\(err\)=>\{ g\.userData\._gunLoading = null;/.test(aag),
    '...and on failure, or one bad url would wedge that avatar’s hand empty for the rest of the match');
  assert(/if\(g\.userData\._gunLoadUrl !== url \|\| g\.userData\.gunKey !== weaponKey\) return;/.test(aag),
    'and the weapon-changed-mid-load guard still stands (build 392)');
}
{ // switching to a weapon that resolves the SAME url must still re-attach — the guard must not eat it
  assert(/g\.userData\._gunLoading = null;/.test(aag.slice(aag.indexOf('(gltf)=>'))),
    'the flag is cleared before the mid-load guard can return, so a same-url weapon switch reloads from cache');
}

// --- the panel this was reported through ------------------------------------------------------------
assert(/Held gun grip \(third-person\)/.test(src), 'the grip panel is still where the report came from');
assert(/attachAvatarGun\(previewAvatar, \(typeof curWep!=='undefined'\?curWep:'rifle'\)\)/.test(src),
  'and the Player tab still attaches the held gun every frame so the sliders have something to position');

done('build 1266: the third-person hand resolves its weapon model through wepModelUrl — the same function the first-person viewmodel uses — so the stock loadout finally puts a gun in the character’s hand (the reported empty "Held gun grip" panel), fists still hold nothing, a creator’s model no longer leaks onto other weapons, and the now-common load path issues one request per avatar instead of one per frame');
