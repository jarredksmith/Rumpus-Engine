// build 1209: enemies acknowledge bullets — flinch, slow, and heavy-hit interrupt.
//
// The gameplay-feel critic's CRITICAL: a non-lethal hit was a 0.12s emissive flash and NOTHING else — a
// Brute ate 30 rounds at unchanged speed, and a melee wind-up or charger lunge telegraph could not be
// broken short of a kill, so shooting read as "my gun is weak" regardless of DPS. enemyHurt now applies
// three physical reactions, all host-side and reusing machinery that already replicates: a FLINCH shove
// along the shot direction via the evx/evz integrator (melee's own knockback), a brief SPEED SLOW the
// movement block multiplies in, and a HEAVY-hit (>= 1/4 max HP) INTERRUPT of a wind-up / lunge telegraph.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- enemyHurt reactions, executed
function run(en, dmg, sx, sz) {
  const body =
    'function killEnemy(){ en._killed = true; }\n' +
    'function _lgEnemyEvent(){}\n function _reactDir(){ return "Front"; }\n' +
    'const performance = { now: () => 0 };\n' +
    extractFunction('enemyHurt') + '\nreturn enemyHurt(en, dmg, sx, sz);';
  return new Function('en', 'dmg', 'sx', 'sz', body)(en, dmg, sx, sz);
}
const mkEn = (over) => Object.assign({ hp: 100, maxHp: 100, evx: 0, evz: 0, mesh: { position: { x: 10, y: 0, z: 0 }, rotation: { y: 0 }, userData: {} }, cooldown: 0 }, over);

{ // a hit from the LEFT (shooter at x=0, enemy at x=10) shoves the enemy to the RIGHT (+x)
  const en = mkEn({});
  run(en, 20, 0, 0);
  assert(en.evx > 0, 'the flinch shoves the enemy AWAY from the shooter (+x)');
  near(en.evz, 0, 1e-9, '...straight along the shot line');
  assert(en._slowT > 0, '...and applies a brief speed slow');
}
{ // the shove scales with the fraction of max HP taken, and is capped
  const light = mkEn({}); run(light, 5, 0, 0);
  const heavy = mkEn({}); run(heavy, 40, 0, 0);
  assert(heavy.evx > light.evx, 'a bigger hit shoves harder');
  const huge = mkEn({}); run(huge, 100000, 0, 0);   // (would kill — but test the clamp on a survivor)
  const survivor = mkEn({ hp: 1e9, maxHp: 1e9 }); run(survivor, 1e9, 0, 0);
  assert(survivor.evx <= 2.5 + 1e-9, 'the shove is capped so a minigun cannot launch anyone (' + survivor.evx.toFixed(2) + ')');
}
{ // a HEAVY hit interrupts a melee wind-up and a charger lunge; a light one does not
  const winding = mkEn({ _windupT: 999, _lungeWind: 999, _lungePending: true });
  run(winding, 30, 0, 0);   // 30/100 = 0.30 >= 0.25
  eq(winding._windupT, 0, 'a heavy hit breaks the melee wind-up');
  eq(winding._lungeWind, 0, '...and the charger lunge telegraph');
  eq(winding._lungePending, false, '...cancelling the pending dash');
  const light = mkEn({ _windupT: 999 });
  run(light, 10, 0, 0);     // 10/100 = 0.10 < 0.25
  eq(light._windupT, 999, 'a light hit does NOT interrupt — commitment only breaks under real pressure');
}
{ // a lethal hit still just kills (no reaction bookkeeping needed)
  const en = mkEn({ hp: 5 });
  const dead = run(en, 20, 0, 0);
  assert(dead === true && en._killed, 'a lethal hit kills as before');
}

// ---------------------------------------------------------------- the movement wiring
{
  assert(/const _stag = \(\(en\._slowT\|\|0\) > 0\) \? 0\.55 : 1;/.test(src),
    'the movement block reads a stagger factor from _slowT');
  assert(/const spd = \(td\.chase \? en\.speed : en\.speed\*0\.5\) \* _stag \*/.test(src),
    'the beeline/patrol speed folds in the stagger');
  // build 1308 routed every enemy translation through _enStep, so the stagger is now a term of the TARGET
  // velocity rather than of a per-frame position delta. Same four moves, same factor — count the targets.
  eq((src.match(/en\.speed\*_stag,/g) || []).length, 8,
    'the ranged cover/flank/standoff moves fold it in too (4 move statements = 8 x/z components)');
  assert(!/en\.speed\*_stag\*dt/.test(src),
    '...and none of them integrates position directly any more (build 1308)');
  assert(/if\(en\._slowT>0\) en\._slowT=Math\.max\(0, en\._slowT-dt\);/.test(src),
    'the slow decays in the per-enemy update, beside the knockback integrator');
}

done('build 1209: enemies acknowledge bullets — enemyHurt executed proving a flinch shove away from the shooter (scaled by HP fraction, capped at 2.5), a brief slow the movement block multiplies in at every approach site, and a heavy-hit (>=1/4 max HP) interrupt of the melee wind-up and charger lunge that a light hit leaves alone; a lethal hit still just kills');
