import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();
// build 1272: reported from play — "there's no option under gameplay to set the melee weapon as the
// starting weapon." Correct, and it was a gap between two features rather than a bug in either.
//
// Build 976 added `startWeapon` as "the PRIMARY you spawn with" and filtered `!melee` out of the list;
// fists got their own "Start unarmed" checkbox, which also carries the stricter no-guns-at-all rule. The
// CROWBAR belonged to neither — melee, so excluded from the dropdown; not fists, so the checkbox did not
// give it. The standard survival-horror opener (start with a melee weapon, find a gun) was unauthorable.

const canStart = new Function('WEAPONS', extractFunction('_canStartWith') + '; return _canStartWith;')({
  rifle:   { name: 'RIFLE' },
  pistol:  { name: 'PISTOL' },
  crowbar: { name: 'CROWBAR', melee: true },
  hands:   { name: 'FISTS', melee: true, fists: true },
});

{ // THE REPORT
  eq(canStart('crowbar'), true, 'a melee weapon may now be the starting weapon — the reported gap');
  eq(canStart('rifle'), true, 'guns are unchanged');
  eq(canStart('pistol'), true);
}
{ // the fists slot stays with the checkbox that owns it
  eq(canStart('hands'), false, 'FISTS is not offered here — "Start unarmed" owns it, and carries the stricter no-guns rule');
  eq(canStart('nosuch'), false, 'an unknown key is refused, so a hostile level file cannot name one');
  eq(canStart(''), false);
  eq(canStart(undefined), false, '...and neither can a missing one');
}
{ // ONE predicate, asked by every site. Six copies of `!melee` is exactly how the crowbar got lost.
  // no startWeapon site spells the old condition out for itself. (Three unrelated `!melee` tests remain
  // and are correct: _loadoutWep remembering the last GUN, and an editor branch on the live weapon.)
  for (const m of src.match(/startWeapon[^;\n]{0,160}/g) || [])
    assert(!/\.melee/.test(m), 'no startWeapon expression still tests .melee itself: ' + m.slice(0, 90));
  const sites = (src.match(/_canStartWith\(/g) || []).length;
  /* build 1400: the two loaders became one, so one of the six call sites went with the duplication. */
  assert(sites >= 5, 'the dropdown, its current-value guard, the shared loader, the serializer and the deploy all ask it (' + sites + ')');
  assert(/const _guns=Object\.keys\(WEAPONS\)\.filter\(_canStartWith\)/.test(src), 'the dropdown is built from it');
  assert(/startWeapon: _canStartWith\(gameCfg\.startWeapon\) \? gameCfg\.startWeapon : 'rifle'/.test(src),
    'the serializer clamps through it');
  eq((src.match(/_canStartWith\(g\.startWeapon\)/g) || []).length, 1,
    'and BOTH level loaders sanitize through it — a level file is untrusted input');
}
{ // the deploy actually equips it
  assert(/const _sw=_canStartWith\(gameCfg\.startWeapon\) \? gameCfg\.startWeapon : 'rifle'; owned = \[_sw\]; curWep=_sw;/.test(src),
    'deploy spawns the player holding the chosen weapon, melee or not');
  assert(/if\(gameCfg\.unarmed\)\{ owned = \['hands'\]; curWep='hands'; \}/.test(src),
    '...and "Start unarmed" still wins outright, so the two features cannot both claim the slot');
}

// --- the consequence, fixed in the same build ---------------------------------------------------------
{
  // A melee weapon with no model of its own used to fall through wepModelUrl's fallback and put the
  // ENGINE'S GUN in the player's hands while they swung. Invisible before this build (nobody could start
  // with a crowbar), immediately visible after it — so it is fixed here rather than left as a surprise.
  const showsFists = new Function('WEAPONS', extractFunction('_wepShowsFists') + '; return _wepShowsFists;')({
    hands:    { melee: true, fists: true, model: '' },
    crowbar:  { melee: true, model: '' },
    crowbarM: { melee: true, model: 'crowbar.glb' },
    rifle:    { model: '' },
  });
  eq(showsFists('crowbar'), true, 'a melee weapon with no model is swung BARE-HANDED, not holding a rifle');
  eq(showsFists('crowbarM'), false, 'a creator’s own crowbar model wins (build 674) — the intended path');
  eq(showsFists('hands'), true, 'fists are unchanged');
  eq(showsFists('rifle'), false, 'a gun with no model of its own still falls back to the engine gun (1266)');
  // build 1266 shares this predicate with the third-person hand, so the body agrees with the viewmodel
  assert(/_wepShowsFists\(weaponKey\)/.test(extractFunction('attachAvatarGun')),
    'and the third-person body asks the same predicate, so it does not hold a rifle either');
  assert(/const isFists = _wepShowsFists\(key\);/.test(extractFunction('showWeaponModel')));
}
{ // the hint says what a creator needs to know
  assert(/A melee weapon works here too/.test(src), 'the panel says melee is allowed');
  assert(/or it is swung bare-handed/.test(src), '...and states the model consequence rather than letting it surprise them');
}

done('build 1272: a melee weapon can be the starting weapon — the crowbar fell between build 976’s gun-only dropdown and the fists-only "Start unarmed" checkbox and could not be chosen at all; one _canStartWith predicate now serves all six sites, and a melee weapon with no model is swung bare-handed instead of putting the engine’s rifle in the player’s hands');
