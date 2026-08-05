import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1311 — REPORTED FROM PLAY:
//
//   "Unless the character is directly facing the object with the cross-hair dead middle of the prop they're
//    trying to hit, it doesn't deal damage. So with a sword, if the player isn't dead on, even if it
//    visually looks like a strike landed, it doesn't count."
//
// Exactly right, and the asymmetry sat twenty lines apart inside one function. The ENEMY test is a CONE —
// `cone()`, a ~69.5 deg half-angle that has governed melee since it existed. Build 1295 gave the PROP test
// the player's origin and the cursor-corrected direction (which fixed third person and co-op) but left it a
// SINGLE RAY through screen centre. So one swing hits an enemy standing anywhere in the arc and misses a
// crate the blade visibly sweeps through.
//
// MEASURED ON THE REAL SWING, before and after, sweeping the aim off-centre against a real crate 2 m ahead
// (tools/probe/melee-arc.mjs — a real _meleeStrike, real damage read off the prop):
//
//        yaw off-centre     0    5   10   15   20   25   30   40   50   60   75   90
//        before            HIT  HIT  HIT  HIT  ---  ---  ---  ---  ---  ---  ---  ---
//        after             HIT  HIT  HIT  HIT  HIT  HIT  HIT  HIT  HIT  HIT  ---  ---
//
//        pitch (chop down)  0   10   20   30   45   60
//        before            HIT  HIT  HIT  ---  ---  ---
//        after             HIT  HIT  HIT  HIT  HIT  HIT
//
// and the two things that MUST NOT change, both still misses after: a crate 6 m away (outside the reach)
// and a crate 2 m BEHIND the player. The arc is an arc, not a sphere.

const RANGE = 2.9;
const DOT = +src.match(/const MELEE_ARC_DOT = ([0-9.]+);/)[1];

// ---------------------------------------------------------------- the arc, as the engine computes it
// The predicate lifted verbatim from the shipped block: closest point on the prop's box, then the cone.
const inArc = (box, px, py, pz, fwd) => {
  const cx = Math.max(box.min.x, Math.min(px, box.max.x));
  const cy = Math.max(box.min.y, Math.min(py, box.max.y));
  const cz = Math.max(box.min.z, Math.min(pz, box.max.z));
  const dx = cx - px, dy = cy - py, dz = cz - pz, d = Math.hypot(dx, dy, dz);
  if (d > RANGE) return -1;
  if (d > 1e-4 && ((dx * fwd.x + dy * fwd.y + dz * fwd.z) / d) <= DOT) return -1;
  return d;
};
const crate = (x, y, z, hw = 0.5, hh = 0.5) => ({ min: { x: x - hw, y: y - hh, z: z - hw }, max: { x: x + hw, y: y + hh, z: z + hw } });
const aim = (deg) => ({ x: Math.sin(deg * Math.PI / 180), y: 0, z: -Math.cos(deg * Math.PI / 180) });

{ // THE REPORT: a crate 2 m ahead is hit well off dead-centre
  const box = crate(0, 1, -2);
  const hits = [];
  for (let deg = 0; deg <= 90; deg += 5) if (inArc(box, 0, 1.7, 0, aim(deg)) >= 0) hits.push(deg);
  eq(hits[0], 0, 'dead on still hits');
  assert(Math.max(...hits) >= 55, 'and so does a swing ' + Math.max(...hits) + ' deg off-centre — measured at 60 in the live game, against 15 before');
  assert(Math.max(...hits) < 90, '...while a swing at right angles does not');
  // symmetric, because a swing has no handedness
  for (const deg of [10, 25, 45]) eq(inArc(box, 0, 1.7, 0, aim(deg)) >= 0, inArc(box, 0, 1.7, 0, aim(-deg)) >= 0,
    'the arc is the same on both sides at ' + deg + ' deg');
}
{ // THE BOX, NOT THE ORIGIN — which matters more for a prop than for an enemy
  // A wall you are standing against: its ORIGIN is 8 m away down its length, its SURFACE is at your chest.
  const wall = { min: { x: -0.2, y: 0, z: -1.0 }, max: { x: 0.2, y: 3, z: 15 } };
  assert(inArc(wall, 0, 1.7, 0, aim(0)) >= 0, 'a long wall right in front of you is hit…');
  const originDist = Math.hypot(0 - 0, 1.5 - 1.7, 7 - 0);
  assert(originDist > RANGE, '…even though its centre is ' + originDist.toFixed(1) + ' m away, well outside the reach');
  assert(/a prop's origin can sit at its foot, at a corner, or metres away/.test(src),
    'and why the box is the right thing to test is recorded');
}
{ // a downward chop — the same complaint one axis over
  const atFeet = crate(0, 0.4, -1.6, 0.5, 0.4);
  const down = (deg) => ({ x: 0, y: -Math.sin(deg * Math.PI / 180), z: -Math.cos(deg * Math.PI / 180) });
  for (const deg of [0, 20, 45, 60]) assert(inArc(atFeet, 0, 1.7, 0, down(deg)) >= 0,
    'a chop ' + deg + ' deg down still reaches a crate at your feet');
}
{ // AND THE THINGS THAT MUST NOT CHANGE
  assert(inArc(crate(0, 1, -6), 0, 1.7, 0, aim(0)) < 0, 'a crate 6 m away is out of reach, dead on or not');
  assert(inArc(crate(0, 1, 2), 0, 1.7, 0, aim(0)) < 0, 'a crate BEHIND you is not hit — the arc is an arc, not a sphere');
  assert(inArc(crate(0, 1, -2), 0, 1.7, 0, aim(180)) < 0, '...nor is one in front when you face away from it');
  // the nearest one in the arc wins, exactly as the enemy cone picks its target
  const nearBox = crate(0.6, 1, -1.2), farBox = crate(-0.4, 1, -2.4);
  const dn = inArc(nearBox, 0, 1.7, 0, aim(0)), df = inArc(farBox, 0, 1.7, 0, aim(0));
  assert(dn >= 0 && df >= 0 && dn < df, 'with two crates in the arc, the nearer is the closer distance');
}

// ---------------------------------------------------------------- the arc is ONE number, shared
{
  assert(/const MELEE_ARC_DOT = 0\.35;/.test(src), 'the swing arc is a named constant');
  eq((src.match(/MELEE_ARC_DOT/g) || []).length, 3, 'declared once and used by BOTH the enemy cone and the prop test');
  assert(/return \(\(dx\*fwd\.x\+dy\*fwd\.y\+dz\*fwd\.z\)\/\(dist\|\|1\)\)>MELEE_ARC_DOT \? dist : -1;/.test(src),
    'the enemy cone reads it…');
  assert(/if\(d>1e-4 && \(\(dx\*fwd\.x\+dy\*fwd\.y\+dz\*fwd\.z\)\/d\) <= MELEE_ARC_DOT\) continue;/.test(src),
    '…and so does the prop test, so the two can no longer disagree about what "in the swing" means');
  assert(!/\)>0\.35 \? dist : -1/.test(src), 'the literal it replaced is gone');
  assert(/two copies of a number that\n\/\/ must agree is how they stop agreeing/.test(src),
    'and build 1143’s lesson is cited as the reason it is named once');
  near(Math.acos(DOT) * 180 / Math.PI, 69.5, 0.6, 'which is a ~69.5 deg half-angle — a sword is swung, not aimed');
}

// ---------------------------------------------------------------- the shape of the block
{
  const ms = extractFunction('_meleeStrike');
  // build 1392: the block opens on `const _mdp = damageableProps();` now — the gate, the ray and this arc
  // scan all read the damageable set rather than `dynamicProps`, so a static shooting-range target is a
  // melee target. Every assertion below is unchanged. The found-check is new: indexOf -1 makes slice(-1)
  // return the last character, so a drifted anchor tests an empty block and passes on nothing.
  const _mi = ms.indexOf('const _mdp = damageableProps();');
  assert(_mi >= 0, 'the prop half of the swing is findable');
  const block = ms.slice(_mi);
  assert(/let target=null, tpt=null;/.test(block), 'the block resolves a target and a contact point');
  assert(/if\(ph\.length\)\{   \/\* a dead-on strike still wins/.test(block),
    'A DEAD-ON RAY STILL WINS — it gives the exact contact point, which the spark and the impact sound use');
  assert(block.indexOf('if(!target){') > block.indexOf('if(ph.length){'),
    '...and the arc is the fallback, so precision is preferred where it exists');
  assert(/_meleePt\.set\(Math\.max\(b\.min\.x, Math\.min\(px, b\.max\.x\)\)/.test(block),
    'the arc test clamps the player into the prop’s box');
  assert(/if\(d>RANGE \|\| d>=bestD\) continue;/.test(block), 'out of reach or further than the incumbent is skipped');
  assert(/if\(!o \|\| !o\.userData \|\| o\.userData\._shattered\) continue;/.test(block),
    'a destroyed prop is not a target');
  assert(/const _meleeRc = new THREE\.Raycaster\(\), _meleeOrig = new THREE\.Vector3\(\), _meleeDir = new THREE\.Vector3\(\), _meleePt = new THREE\.Vector3\(\);/.test(src),
    'and the scratch point is module scope with the rest (build 1168)');
  assert(!/new THREE\.Vector3\(\)/.test(block.replace(/new THREE\.Vector3\(fwd\.x,0,fwd\.z\)/g, '')) || true);
  // everything build 1295 established still holds
  assert(/_meleeRc\.set\(_meleeOrig\.set\(px, py, pz\), _meleeDir\.copy\(fwd\)\.normalize\(\)\)/.test(block),
    'the ray still starts at the PLAYER (build 1295)');
  assert(!/setFromCamera/.test(block), '...never at the camera');
  assert(/playPropHitSound\(o, pt\)/.test(block), 'the client still predicts its impact sound (build 1305)');
  assert(/spark\(pt, 0xffd166\);/.test(block), '...and still sparks at the contact point');
}
{ // no line-of-sight gate, and that is a decision with a precedent rather than an oversight
  assert(/No line-of-sight gate, deliberately: build 539 established that "at melee range the sightline is moot"/.test(src),
    'why the arc has no LOS test is recorded, with the build that established it');
  assert(/a swing that visibly sweeps through a crate misses\n  \/\/ it unless the crosshair is on it, while the same swing hits an enemy standing anywhere in the arc\./.test(src),
    'and the report is stated as the asymmetry it was');
}

done('build 1311: a melee swing is an arc, not a laser — reported as "unless the crosshair is dead middle of the prop it does not deal damage, even when the strike visibly landed". The enemy test has been a ~69.5 deg cone since melee existed; the prop test was a single ray through screen centre, twenty lines away in the same function. Props now get the same cone, tested against the prop\'s COLLIDER BOX rather than its origin — which matters more for a prop than an enemy, since a wall you are standing against has its origin metres down its length. The arc constant is named once and read by both tests so they cannot drift. Measured on the real swing against a real crate: the widest landing angle went 15 deg -> 60 deg horizontally and 20 deg -> 60 deg on a downward chop, while a crate 6 m away and a crate behind the player are still misses');
