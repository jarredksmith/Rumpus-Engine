// build 1428: "decoration only" means the physics too.
//
// Build 1324 gave a prop `noCol` — a real, serialized decoration-only flag, so a bush cannot block a
// doorway. It empties the collider box list and neutralises the raycast, and `addStaticColliderFor` never
// heard about it: a noCol prop still got a fixed Rapier body, on both the primitive and the model path.
//
// Measured (tools/probe/nocol-physics.mjs): 5-12 ms of build for a 4,000-triangle decoration, and every
// branch that creates that body attaches a REAL collider — so it is solid to dynamic props. That is the
// same shape as the bug build 1194 recorded, where `hideprop` left a body behind and made an invisible
// physics wall.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed: who gets a body
const rig = (ud) => {
  const st = { bodies: 0, colliders: 0 };
  const RAPIER = {
    RigidBodyDesc: {
      fixed: () => ({ setTranslation(){ return this; }, setRotation(){ return this; } }),
      kinematicPositionBased: () => ({ setTranslation(){ return this; }, setRotation(){ return this; } }),
    },
    ColliderDesc: { cuboid: () => ({ setFriction(){ return this; }, setRestitution(){ return this; }, setTranslation(){ return this; } }) },
  };
  const o = { userData: Object.assign({}, ud), position: { x:0, y:0, z:0, clone: () => ({}) },
    quaternion: { x:0, y:0, z:0, w:1, clone: () => ({}) }, updateMatrixWorld(){}, traverse(){} };
  const fn = new Function('o', 'physWorld', 'RAPIER', 'isShapePrimitive', 'propShapeInfo', 'colliderDescFor',
    'trimeshDescFor', 'THREE', '_psize', '_pcenter', 'console',
    extractFunction('addStaticColliderFor') + '; addStaticColliderFor(o); return o;')(
    o,
    { createRigidBody: () => { st.bodies++; return { id: st.bodies }; },
      createCollider: () => { st.colliders++; } },
    RAPIER,
    (s) => s === 'box',
    () => ({ off: { x:0, y:0, z:0 } }),
    () => ({ setTranslation(){ return this; }, setFriction(){ return this; }, setRestitution(){ return this; } }),
    () => ({ setFriction(){ return this; }, setRestitution(){ return this; } }),
    { Box3: class { setFromObject(){ return this; } getSize(v){ v.x=v.y=v.z=1; } getCenter(v){ v.x=v.y=v.z=0; } } },
    { x:1, y:1, z:1 }, { x:0, y:0, z:0 },
    { warn(){} });
  return { bodies: st.bodies, colliders: st.colliders,
           statik: !!fn.userData._physStatic, kinematic: !!fn.userData._kbody };
};

{ // CONTROLS: everything that should still get a body, still does
  const prim = rig({ src: 'box' });
  eq(prim.bodies, 1, 'CONTROL: an ordinary primitive gets a static body');
  eq(prim.colliders, 1, '...with a real collider on it');
  assert(prim.statik, '...and is stamped');

  const model = rig({ src: 'x.glb' });
  eq(model.bodies, 1, 'CONTROL: an ordinary model gets one too');
  assert(model.statik, '...and is stamped');
}
{ // THE FIX
  const deco = rig({ src: 'box', noCol: true });
  eq(deco.bodies, 0, 'a decoration-only PRIMITIVE gets no body at all');
  eq(deco.colliders, 0, '...and therefore no collider to be solid with');
  assert(!deco.statik, '...and is not stamped, so nothing thinks it has one');

  const decoModel = rig({ src: 'x.glb', noCol: true });
  eq(decoModel.bodies, 0, 'and neither does a decoration-only MODEL — the case that matters, because a ' +
    'non-primitive builds a trimesh of its real triangles');
  eq(decoModel.colliders, 0);
}
{ // THINGS THAT MOVE ARE DELIBERATELY UNTOUCHED — a drivable car or a moving platform is not "decoration"
  const car = rig({ src: 'x.glb', noCol: true, vehicle: { headlights: false } });
  eq(car.bodies, 1, 'a noCol VEHICLE still gets its kinematic body, or it would stop driving');
  assert(car.kinematic, '...a kinematic one');

  const lift = rig({ src: 'box', noCol: true, xa: { on: true } });
  eq(lift.bodies, 1, 'a noCol animated mechanism still gets its kinematic body, or it stops carrying things');
  const towed = rig({ src: 'box', noCol: true, parNid: 'p1' });
  eq(towed.bodies, 1, '...and so does a parented prop (build 1309)');
}
{ // the existing exemptions are unchanged
  const fx = rig({ src: 'box', fx: { kind: 'dust' } });
  eq(fx.bodies, 0, 'an emitter still gets nothing (build 1250)');
  const already = rig({ src: 'box', _physStatic: {} });
  eq(already.bodies, 0, 'and a prop already in THIS world is still idempotent (build 1194)');
}

// ---------------------------------------------------------------- where the guard sits, and why
{
  const fn = extractFunction('addStaticColliderFor');
  assert(/if\(o\.userData && o\.userData\.noCol\) return;/.test(fn), 'the guard exists');
  const iFx = fn.indexOf("o.userData.fx) return;");
  const iVeh = fn.indexOf('o.userData.vehicle){');
  const iKin = fn.indexOf('o.userData.xa && o.userData.xa.on');
  const iNo = fn.indexOf('o.userData.noCol) return;');
  const iPrim = fn.indexOf('isShapePrimitive(o.userData.src)');
  assert(iFx > 0 && iVeh > 0 && iKin > 0 && iNo > 0 && iPrim > 0, 'every branch located');
  assert(iNo > iVeh && iNo > iKin,
    'it sits AFTER the vehicle and kinematic branches — those are for props that MOVE, and skipping their ' +
    'bodies would stop a car driving and a platform carrying');
  assert(iNo < iPrim, '...and BEFORE both static paths, which is the whole of what the flag means');
  assert(/A moving\s*\n?\s*noCol prop keeping its kinematic body is a stated limit/.test(fn) ||
         /stated limit, not an oversight/.test(fn),
    'and that scope is written down as a decision rather than left to be rediscovered');
}
{ // build 1324's half is untouched — the boxes and the raycast
  const rp = extractFunction('refreshPropCollider');
  assert(/noCol/.test(rp), 'the collider derivation still knows about the flag');
  assert(/if\(o\.userData\.noCol\) e\.nc=1;/.test(src), 'and it still serializes');
}

done('build 1428: a prop marked decoration-only gets no physics body — the flag now means what it says');
