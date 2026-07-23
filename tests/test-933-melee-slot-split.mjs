// (build 933) "FIRE AND MELEE LIGHT USE THE SAME ANIMATION" — with a melee-class weapon equipped
// (fists, knife, crowbar), the fire button routes through meleeAttack, and the weapon swing shared
// the meleeLight slot with the bare melee key — so separate picks for attack/meleeLight could never
// show. The weapon's swing now has its OWN slot: meleeCombo for light melee weapons, meleeHeavy for
// heavy hitters (dmg>=50), while the bare melee key keeps meleeLight and gun fire keeps attack —
// four independently pickable animations.
// Verified live: rifle fire -> 'attack' (Pistol_Shoot); fists fire -> 'meleeCombo'; heavy weapon
// swing -> 'meleeHeavy'; bare melee key -> 'meleeLight' (Punch_Jab); all distinct.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const ma = extractFunction('meleeAttack', src);
assert(/const _mslot = wep \? \(wep\.dmg>=50\?'meleeHeavy':'meleeCombo'\) : 'meleeLight';/.test(ma),
  "a weapon's swing uses meleeCombo/meleeHeavy; the bare melee key keeps meleeLight");
assert(!/\(wep && wep\.dmg>=50\)\?'meleeHeavy':'meleeLight'/.test(ma), 'the shared-slot selection is gone');

done('build 933: gun fire, weapon swing, heavy swing and bare melee are four separate animation slots');
