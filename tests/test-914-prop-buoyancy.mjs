// (build 914) PROPS NEVER FLOATED — _waterPropsStep (build 862) was wired ONLY into the multiplayer
// CLIENT physics path, where prop bodies are pinned to host poses with velocities zeroed each frame,
// so the impulse was erased before a single step; the solo/host simulation that OWNS dynamic props
// never called it. Moved to updatePhysics, removed from the pinned path, and buoyancy now scales to
// the prop's own height. Verified with REAL Rapier: a crate dropped over a 3m pool settles bobbing
// at y≈2.67 (surface 3.0) while a dry-land control falls to the ground.
import { gameSource, extractFunction, evalDecl, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// the call lives in the OWNED simulation, ahead of the substep loop…
const up = extractFunction('updatePhysics', src);
assert(/_waterPropsStep==='function'\) _waterPropsStep\(dt\);[\s\S]{0,220}while\(physAccum >= PHYS_DT/.test(up),
  'updatePhysics (solo + host) applies buoyancy before stepping');
// …and is gone from the client's pinned-body path
assert(!/_waterPropsStep/.test(extractFunction('stepClientPlayerPhys', src)),
  "the client path no longer calls it (bodies are pinned there; the impulse was wiped)");

// buoyancy scales with the prop's own height
const wp = extractFunction('_waterPropsStep', src);
assert(/hh=Math\.max\(0\.3, bx \? \(bx\.max\.y-bx\.min\.y\)\/2 : 0\.6\)/.test(wp) && /f=Math\.min\(1, w\.sub\/hh\)/.test(wp),
  'submersion fraction is relative to prop height (small crates float AT the surface)');
assert(/m\*GRAV\*1\.3\*f\*dt/.test(wp), 'slightly over-buoyant so props bob up and settle');

// executable: a submerged body gets an upward impulse + drag; a dry one is untouched
const mkBody=(y)=>{ const log={ imp:null, lv:{x:1,y:-2,z:1}, av:{x:1,y:1,z:1} };
  return { log, body:{ translation:()=>({x:0,y,z:0}), mass:()=>2,
    applyImpulse:(v)=>{ log.imp=v; }, linvel:()=>log.lv, setLinvel:(v)=>{ log.lv=v; }, angvel:()=>log.av, setAngvel:(v)=>{ log.av=v; } } };
};
const wet=mkBody(1.0), dry=mkBody(9.0);
const step=evalDecl(extractFunction('_waterAt', src)+'\n'+wp, '_waterPropsStep', {
  waterZones:[{ x:0, z:0, r:10, y:0, h:3 }],
  physWorld:{}, GRAV:30,
  dynamicProps:[
    { userData:{ box:{ max:{y:1.5}, min:{y:0.5} }, phys:{ body:wet.body } } },
    { userData:{ box:{ max:{y:9.5}, min:{y:8.5} }, phys:{ body:dry.body } } },
  ],
});
step(1/60);
assert(wet.log.imp && wet.log.imp.y>0, 'a submerged prop gets an upward impulse');
near(wet.log.imp.y, 2*30*1.3*1*(1/60), 1e-6, 'fully submerged (sub 2m > hh 0.5m) -> full buoyant impulse m*g*1.3*dt');
assert(wet.log.lv.y > -2 && Math.abs(wet.log.lv.x) < 1, 'water drag slows the submerged prop');
eq(dry.log.imp, null, 'a prop above the surface is untouched');

done('build 914: dynamic props finally float — buoyancy acts on the simulation that owns them');
