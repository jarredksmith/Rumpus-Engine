// WEAPONS table is well-formed and internally consistent.
import { extractConst, evalIn, done, assert, eq } from './harness.mjs';
const W = evalIn(extractConst('WEAPONS'));
const need = ['name','mag','magSize','reserve','reserveMax','fireRate','dmg','pellets','spread','auto','reloadMs','color','refillAmt','refillCost','model','view'];
eq(Object.keys(W).length, 7, 'seven weapons (5 guns + crowbar + fists)');
for (const k of Object.keys(W)) {
  const w = W[k];
  for (const f of need) assert(f in w, `${k} has field ${f}`);
  eq(w.mag, w.magSize, `${k} starts with a full mag`);
  assert(w.reserve <= w.reserveMax, `${k} reserve <= reserveMax`);
  assert(w.dmg > 0 && w.fireRate > 0, `${k} positive dmg/fireRate`);
  if(w.melee){
    assert(w.reach > 0, `${k} (melee) positive reach`);
  } else {
    assert(w.magSize > 0 && w.reserveMax > 0, `${k} positive capacities`);
    assert(w.pellets >= 1, `${k} >=1 pellet`);
    assert(w.reloadMs > 0, `${k} positive reload`);
    assert(w.refillAmt > 0 && w.refillCost > 0, `${k} positive refill amt/cost`);
  }
}
assert(W.shotgun.pellets > 1 && W.shotgun.spread > 0, 'shotgun is a spread weapon');
assert(W.rifle.auto && W.smg.auto && !W.shotgun.auto, 'auto flags as designed');
done('WEAPONS table integrity');
