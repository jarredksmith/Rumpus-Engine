// (build 193) Explosions launch the local player too, completing the set (enemies + bots + you). Rocket and
// exploding-prop blasts (explodeAt) shove you away + pop you up on top of the existing self-damage; your own
// grenade flings you (grenade-jump) with no self-damage. Knockback uses player.extVel/vel.y and scales with
// Launch Power, same channel the trebuchet uses.
import { gameSource, extractFunction, done, assert } from './harness.mjs';

const ex = extractFunction('explodeAt');
assert(/player\.extVel\.x\+=kx\/kh\*kb; player\.extVel\.z\+=kz\/kh\*kb; player\.vel\.y=Math\.max\(player\.vel\.y,\(5\+R\*0\.6\)\*f\*LP\); player\.onGround=false;/.test(ex), 'explodeAt launches the player');
assert(/applyEnemyDamageToSelf\(pd, pos\.x, pos\.z\)/.test(ex), 'explodeAt still applies self-damage alongside the launch');

const eg = extractFunction('explodeGrenade');
assert(/player\.extVel\.x\+=kx\/kh\*kb;.*player\.vel\.y=Math\.max\(player\.vel\.y,\(5\+R\*0\.6\)\*f\*LP\); player\.onGround=false;/.test(eg), 'grenade-jump: own grenade flings the player');
// build 1006: PvP grenades now damage the host player — but ONLY someone else's grenade. Your own
// blast stays a damage-free grenade-jump: the sole damage call is guarded by by!==NET.myId.
assert(!/applyEnemyDamageToSelf/.test(eg), 'grenade-jump adds no co-op self-damage');
assert(/if\(by!==NET\.myId && !duelDead\)\{ const d=player\.pos\.distanceTo\(pos\); if\(d<R\) applyPvpDamage\(/.test(eg), 'PvP damage to self only from an OPPONENT’s grenade (own stays a free grenade-jump)');

done();
