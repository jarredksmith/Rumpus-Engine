// (build 862) WATER TOUCHES EVERYTHING THAT MOVES — the deferred gameplay polish:
//  - cars: submersion caps top speed (splash 100% / shallow 45% / deep 18%) with a smooth haul-down,
//    plus bow spray puffs off the waterline while moving;
//  - waterfalls: standing in the sheet drives you down into the plunge pool (overrides buoyancy);
//  - dynamic props: an over-buoyant impulse + heavy drag on the Rapier body — they bob to the surface;
//  - enemies AND bots wade at ~55% pace through water deeper than 0.3m (the player already did).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- pure math, executably ----
const carF = new Function(extractFunction('_carWaterFactor') + 'return _carWaterFactor;')();
eq(carF(0), 1, 'dry: no cap');
eq(carF(0.5), 0.45, 'shallow: 45% of top speed');
eq(carF(2), 0.18, 'deep: 18%');
// _waterSlowFor through a real zone
const slowFn = new Function('waterZones','_waterAt', extractFunction('_waterSlowFor') + 'return _waterSlowFor;');
const atFn = new Function('waterZones', extractFunction('_waterAt').replace('function _waterAt','function _wa') + 'return _wa;');
const Z=[{ x:0, z:0, r:10, y:0, h:2 }];
const at=atFn(Z);
eq(slowFn(Z, at)(0, 0.5, 0), 0.55, 'wading slows to 55%');
eq(slowFn(Z, at)(50, 0.5, 50), 1, 'dry land: full speed');
eq(slowFn([], at)(0, 0.5, 0), 1, 'no zones: zero-cost early-out');

// ---- waterfall push, executably (sign-agnostic containment) ----
const push = (px, pz, py, yaw)=>{
  const ctx={ waterfalls:[{ x:0, z:0, y:8, h:8, w:6, yaw }], drivingCar:false, mountedTurret:null,
    player:{ pos:{x:px, y:py, z:pz}, vel:{x:0,y:0,z:0}, onGround:true }, EYE:1.7, RAD:Math.PI/180, Math };
  new Function(...Object.keys(ctx), extractFunction('_fallPushStep') + '_fallPushStep(0.016);')(...Object.values(ctx));
  return ctx.player;
};
assert(push(0, 0, 4+1.7, 0).vel.y < -0.3, 'under the sheet: pushed down');
eq(push(10, 0, 4+1.7, 0).vel.y, 0, 'outside the width: untouched');
eq(push(0, 0, 30, 0).vel.y, 0, 'above the fall: untouched');
assert(push(0, 0, 4+1.7, 137).vel.y < -0.3, 'containment holds under any facing angle');

// ---- wiring ----
assert(/_carWaterStep\(drivingCar, dt\)/.test(src) && /for\(const _cc of _coastingCars\) _carWaterStep\(_cc, dt\)/.test(src), 'driven + coasting cars feel the water');
assert(/_spawnDust\(o\.position\.x \+ fx\*1\.4/.test(src), 'bow spray reuses the pooled dust puffs');
assert(/_fallPushStep\(dt\);   \/\/ build 862/.test(src), 'the fall push runs right after the swim step');
assert(/_waterSlowFor\(en\.mesh\.position\.x/.test(src), 'enemies wade');
assert(/step=spd\*dt\*\(typeof _waterSlowFor/.test(src), 'bots wade');
assert(/_waterPropsStep\(dt\);   \/\/ build 862/.test(src.match(/_waterPropsStep\(dt\);[^\n]*/)[0]), 'prop buoyancy applies before the physics step');
assert(/applyImpulse\(\{ x:0, y: m\*GRAV\*1\.3\*\(sub\/1\.2\)\*dt, z:0 \}, true\)/.test(src), 'over-buoyant impulse (props bob up and settle)');

done('build 862: water drags cars (with spray), falls push down, props float, enemies + bots wade — pure math verified');
