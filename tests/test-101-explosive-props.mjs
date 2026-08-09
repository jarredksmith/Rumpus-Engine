// (build 148) Explosive prop toggle: a breakable prop flagged Explosive detonates when destroyed —
// playing the explosion sprite-sheet flipbook and dealing grenade-style AoE (linear falloff) to enemies,
// players and bots, with kill credit to whoever destroyed it. Chain-reacts nearby explosives. For
// propane / gas-can props. Editor exposes the toggle + blast Radius/Damage; saved + synced to co-op.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

assert(/function explodeAt\(pos, R, dmg, byId\)/.test(src), 'shared blast fn exists');
const ex = (extractFunction('explodeAt') + extractFunction('_blastProps'));
assert(/playFlipbook\('explosion', _vp/.test(ex), 'plays the explosion sprite sheet');
assert(/if\(NET\.mode==='client'\) return;/.test(ex), 'clients show visuals only; host authors damage');
assert(/alertEnemy\(en, pos\.x, pos\.z\); _blastLaunch\(en, pos\.x,pos\.y,pos\.z, R, f\); enemyHurt\(en, dmg\*f, pos\.x, pos\.z\)/.test(ex), 'co-op: falloff AoE damages + alerts + launches enemies (build 389)');
assert(/bt\.grounded=false;[\s\S]*?if\(botHurt\(bt, dmg\*f, pos\.x, pos\.z\)\) registerDuelKill\(byId,bt\.id\)/.test(ex), 'PvP: damages bots (falloff) + credits destroyer');
assert(/sendToPlayer\(\+id, \{t:'pvpHit', d:dmg\*\(1-d\/R\), from:byId\}\)/.test(ex), 'PvP: damages remote players');
assert(/if\(!pvpMode\(\)\) applyEnemyDamageToSelf\(pd, pos\.x, pos\.z\); else if\(!duelDead\) applyPvpDamage\(pd, byId\)/.test(ex), 'the blast hits the local player too (correct death path per mode)');
assert(/sameTeam\(byId,bt\.id\)/.test(ex) && /sameTeam\(byId,\+id\)/.test(ex), 'no friendly fire');
// build 1405: the loop became multi-line and now THROWS as well as damages. What this has always asserted —
// that a blast damages the dynamic props around it with the same falloff, which is what chains a barrel to
// its neighbour — is unchanged; the falloff is a named `f` now instead of being written out twice.
assert(/for\(const o of dynamicProps\.slice\(\)\)\{/.test(ex) &&
       /const f=1-d\/R;/.test(ex) && /damageProp\(o, dmg\*f, null, null, 6, byId\)/.test(ex),
  'chain-detonates nearby breakable props');
assert(/if\(!broke\) _blastShoveProp\(o, pos, R, f\);/.test(ex),
  '...and throws the ones it did not destroy (build 1405)');

// build 1443 added a trailing `showNum` to damageProp. The subject here is the DESTROYER ID, so the pin
// asserts byId reaches both functions rather than quoting an arity that will keep moving.
assert(/function damageProp\(obj, dmg, point, dir, power, byId\b/.test(src) && /function shatterProp\(obj, point, dir, power, byId\)/.test(src), 'destroyer id threaded through destruction');
assert(/if\(obj\.userData\.explosive\)\{ explodeAt\(_shCtr\.clone\(\), obj\.userData\.blastRadius\|\|7, obj\.userData\.blastDmg\|\|70, byId\); \}/.test(src), 'destruction detonates an explosive prop');
assert(/const broke = damageProp\(dprop, w\.dmg\*dmgMul, hp, dir, power, NET\.myId\b/.test(src), 'shots credit the shooter as destroyer');
assert(/exp:obj\.userData\.explosive\?1:0, br:obj\.userData\.blastRadius\|\|7/.test(src), 'break message carries the explosive flag + radius');
assert(/if\(msg\.exp\)\{ explodeAt\(ctr\.clone\(\), msg\.br\|\|7, 0, null\); \}/.test(src), 'clients render the blast on break');

assert(/if\(o\.userData\.explosive\)\{ e\.exp=1;/.test(src), 'explosive saved to the level');
assert(/if\(p\.exp\)\{ obj\.userData\.explosive=true;/.test(src), 'explosive restored on spawn');
assert(/<b>\\ud83d\\udca5 Explosive<\/b>/.test(src) || /Explosive<\/b>/.test(src), 'editor has an Explosive toggle');
assert(/sel\.userData\.explosive=excb\.checked;/.test(src), 'editor toggle wired');
done('explosive props');
