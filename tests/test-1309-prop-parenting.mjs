import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1309 — editor audit 4.5, HIGH, verified still live:
//
//   "Zero greps for parentTo|attachTo|userData.parent|parentNid. Groups are a shared groupId; folders are
//    outliner metadata. Consequences that show in play, not just authoring: a crate on a moving platform
//    does not ride it, `moveprop` is a teleport, a rotating assembly must be authored as one mesh. Build
//    997's light-attach and build 1228's entry carry are a SPECIAL CASE of parenting implemented once;
//    generalising them is the structural fix."
//
// Verified end to end in the live game (tools/probe/prop-parenting.mjs): a platform slid 5 m carried its
// crate to x=5 with its COLLIDER centre at 5 (a mesh that rides while its collider does not is worse than
// no feature); a three-link chain resolved in ONE frame; a 90 deg turn swung a crate 3 m off-axis from
// (+3,0) to (0,-3) with its radius preserved and its own yaw turned 90; both children serialized; and
// deleting the parent released the child exactly where it stood.

// ---------------------------------------------------------------- the constraint, executed
const THREE = (() => {
  class V3 { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
    set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
    copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
    clone(){ return new V3(this.x,this.y,this.z); }
    add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
    sub(v){ this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
    lengthSq(){ return this.x*this.x+this.y*this.y+this.z*this.z; }
    applyQuaternion(q){   // three's own formula
      const x=this.x,y=this.y,z=this.z, qx=q.x,qy=q.y,qz=q.z,qw=q.w;
      const ix=qw*x+qy*z-qz*y, iy=qw*y+qz*x-qx*z, iz=qw*z+qx*y-qy*x, iw=-qx*x-qy*y-qz*z;
      this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy; this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz; this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;
      return this; } }
  class Q { constructor(x=0,y=0,z=0,w=1){ this.x=x; this.y=y; this.z=z; this.w=w; }
    copy(q){ this.x=q.x; this.y=q.y; this.z=q.z; this.w=q.w; return this; }
    clone(){ return new Q(this.x,this.y,this.z,this.w); }
    invert(){ this.x*=-1; this.y*=-1; this.z*=-1; return this; }
    _mul(a,b){ const qax=a.x,qay=a.y,qaz=a.z,qaw=a.w, qbx=b.x,qby=b.y,qbz=b.z,qbw=b.w;
      this.x=qax*qbw+qaw*qbx+qay*qbz-qaz*qby; this.y=qay*qbw+qaw*qby+qaz*qbx-qax*qbz;
      this.z=qaz*qbw+qaw*qbz+qax*qby-qay*qbx; this.w=qaw*qbw-qax*qbx-qay*qby-qaz*qbz; return this; }
    multiply(q){ return this._mul(this, q); }
    premultiply(q){ return this._mul(q, this); }
    setY(rad){ this.x=0; this.y=Math.sin(rad/2); this.z=0; this.w=Math.cos(rad/2); return this; } }
  return { Vector3: V3, Quaternion: Q };
})();

const mkProp = (nid, x, y, z) => ({ position: new THREE.Vector3(x, y, z), quaternion: new THREE.Quaternion(),
  userData: { nid, name: nid } });
const rig = (props) => {
  const st = { refreshed: [], physRebuilds: 0 };
  const api = new Function('THREE', 'propModels', 'genNid', 'refreshPropCollider', '_schedulePhysRebuild', 'ST',
    'const _pntKids = new Map(); let _pntDirty = true, _pntN = -1;\n' +
    'const _pntV=new THREE.Vector3(), _pntQ=new THREE.Quaternion(), _pntQI=new THREE.Quaternion(), _pntD=new THREE.Vector3();\n' +
    extractFunction('_pntMark') + '\n' + extractFunction('_pntDepth') + '\n' + extractFunction('_pntRebuild') + '\n' +
    extractFunction('canParentTo') + '\n' + extractFunction('setPropParent') + '\n' + extractFunction('clearPropParent') + '\n' +
    extractFunction('propByNidLocal') + '\n' + extractFunction('_syncParentedProps') + '\n' +
    'return { sync:_syncParentedProps, set:setPropParent, clear:clearPropParent, can:canParentTo, depth:_pntDepth };')(
    THREE, props, () => 'n' + Math.random(), (o) => st.refreshed.push(o.userData.nid), () => st.physRebuilds++, st);
  return { api, st };
};

{ // A CRATE ON A MOVING PLATFORM RIDES IT — the audit's first case
  const plat = mkProp('plat', 0, 1, 0), crate = mkProp('crate', 0, 2, 0);
  const { api, st } = rig([plat, crate]);
  eq(api.set(crate, plat), true, 'the crate takes the platform as its parent');
  eq(crate.userData.parNid, 'plat');
  api.sync();                                   // first pass only captures the parent's pose
  near(crate.position.x, 0, 1e-9, 'nothing moves on the frame the parent is captured');
  plat.position.x += 5;
  api.sync();
  near(crate.position.x, 5, 1e-9, 'the platform slides 5 m and the CRATE GOES WITH IT');
  near(crate.position.y, 2, 1e-9, '...keeping its own height');
  assert(st.refreshed.indexOf('crate') >= 0,
    'and its COLLIDER is refreshed — a mesh that rides while its collider stays put is worse than no feature');
  // ...and it keeps riding, frame after frame
  for (let i = 0; i < 10; i++) { plat.position.z += 0.5; api.sync(); }
  near(crate.position.z, 5, 1e-9, 'ten frames of travel arrive exactly where the platform did');
}
{ // A ROTATING ASSEMBLY — the audit's third case
  const turn = mkProp('turn', 0, 0, 0), gun = mkProp('gun', 3, 1, 0);
  const { api } = rig([turn, gun]);
  api.set(gun, turn); api.sync();
  turn.quaternion.setY(Math.PI / 2);
  api.sync();
  near(gun.position.x, 0, 1e-6, 'a quarter turn swings the child about the PARENT’S ORIGIN…');
  near(gun.position.z, -3, 1e-6, '…to (0,-3): +X maps to -Z, which is what a Y rotation does');
  near(Math.hypot(gun.position.x, gun.position.z), 3, 1e-9, '...at an unchanged radius');
  near(gun.position.y, 1, 1e-9, '...and an unchanged height');
  near(gun.quaternion.y, Math.sin(Math.PI / 4), 1e-6, 'and the child TURNS TOO — otherwise it slides round the turntable facing one way');
}
{ // a chain settles in ONE frame, not one frame per link
  const a = mkProp('a', 0, 0, 0), b = mkProp('b', 0, 1, 0), c = mkProp('c', 0, 2, 0);
  const { api } = rig([c, b, a]);          // deliberately in the WRONG order in propModels
  api.set(b, a); api.set(c, b); api.sync();
  a.position.x += 4;
  api.sync();
  near(b.position.x, 4, 1e-9, 'the middle link follows');
  near(c.position.x, 4, 1e-9, 'AND SO DOES THE TOP ONE, in the same frame — depth order, not list order');
}
{ // a child that is not moved costs nothing
  const plat = mkProp('plat', 0, 0, 0), crate = mkProp('crate', 1, 0, 0);
  const { api, st } = rig([plat, crate]);
  api.set(crate, plat); api.sync();
  for (let i = 0; i < 100; i++) api.sync();
  eq(st.refreshed.length, 0, 'a hundred frames of a stationary parent refresh no colliders');
}

// ---------------------------------------------------------------- it cannot tie itself in a knot
{
  const a = mkProp('a', 0, 0, 0), b = mkProp('b', 0, 0, 0), c = mkProp('c', 0, 0, 0);
  const { api } = rig([a, b, c]);
  eq(api.set(a, a), false, 'a prop cannot be its own parent');
  api.set(b, a);
  eq(api.set(a, b), false, 'and cannot take its own child as a parent');
  api.set(c, b);
  eq(api.set(a, c), false, '...however far down the chain the loop would close');
  eq(api.can(a, b), false); eq(api.can(a, c), false);
  eq(api.can(c, a), true, 'a legal re-parent up the chain is still allowed');
  // a hand-edited file could still contain one; the rebuild has to survive it rather than hang
  const x = mkProp('x', 0, 0, 0), y = mkProp('y', 0, 0, 0);
  const r2 = rig([x, y]);
  x.userData.parNid = 'y'; y.userData.parNid = 'x';
  r2.api.sync();
  assert(!x.userData.parNid || !y.userData.parNid, 'a cycle arriving from a level file is BROKEN rather than looping forever');
}
{ // and a dangling parent is simply ignored
  const lone = mkProp('lone', 0, 0, 0);
  const { api } = rig([lone]);
  lone.userData.parNid = 'a-prop-that-is-not-here';
  api.sync(); api.sync();
  eq(lone.position.x, 0, 'a child whose parent is missing stays exactly where it is');
}
{ // clearing releases in place
  const plat = mkProp('plat', 0, 0, 0), crate = mkProp('crate', 2, 0, 0);
  const { api } = rig([plat, crate]);
  api.set(crate, plat); api.sync(); plat.position.x += 3; api.sync();
  near(crate.position.x, 5, 1e-9);
  eq(api.clear(crate), true);
  plat.position.x += 100; api.sync();
  near(crate.position.x, 5, 1e-9, 'a released prop stays where it stood, not where it started');
  eq(api.clear(crate), false, 'clearing twice is a no-op');
}

// ---------------------------------------------------------------- why it is a constraint, not a re-parent
{
  assert(/IT IS A FOLLOW CONSTRAINT, NOT SCENE-GRAPH RE-PARENTING/.test(src),
    'the load-bearing decision is stated where it is made');
  assert(/`serializeLevel` writes `o\.position` as a WORLD transform, and the gizmo drags in world space/.test(src),
    '...with the three invariants re-parenting would have broken');
  const sync = extractFunction('_syncParentedProps');
  assert(!/\.add\(k\)|host\.attach\(/.test(sync), 'nothing is re-parented in the scene graph');
  assert(/k\.position\.copy\(_pntV\.copy\(k\.position\)\.sub\(prev\.p\)\.applyQuaternion\(_pntQ\)\.add\(prev\.p\)\); k\.quaternion\.premultiply\(_pntQ\);/.test(sync),
    'a turn rotates the child about the parent’s origin AND turns the child');
  assert(/hosts\.sort\(\(a,b\)=>_pntDepth\(a\)-_pntDepth\(b\)\);/.test(sync), 'parents resolve shallowest-first');
  assert(/const _pntV=new THREE\.Vector3\(\), _pntQ=new THREE\.Quaternion\(\), _pntQI=new THREE\.Quaternion\(\), _pntD=new THREE\.Vector3\(\);/.test(src),
    'and the scratch vectors are module scope (build 1168)');
}

// ---------------------------------------------------------------- it inherits the mover story, not a copy
{
  assert(/function _cgMobileNow\(c\)\{[\s\S]{0,220}\|\| !!u\.parNid; \}/.test(src),
    'a parented prop counts as a MOVER for the static spatial grid, or its per-frame collider refresh would rebuild the grid every frame (build 1188)');
  assert(/if\(o\.userData && \(\(o\.userData\.xa && o\.userData\.xa\.on\) \|\| o\.userData\.parNid\)\)\{/.test(src),
    'and takes the same KINEMATIC body a mechanism-animated prop takes…');
  assert(/updatePhysics's\n     existing kinematic driver sweeps it/.test(src),
    '…so updatePhysics carries and launches a dynamic crate resting on it, inherited rather than reimplemented');
  assert(/if\(typeof _syncParentedProps==='function'\) _syncParentedProps\(\);.*BEFORE the lights/.test(src),
    'it runs before build 997’s light sync, so a light on a child prop follows in the same frame');
  const i = src.indexOf('_syncParentedProps();   // build 1309'), j = src.indexOf('_syncAttachedLights();   // build 997');
  assert(i > 0 && j > i, '...which is the actual ordering');
}

// ---------------------------------------------------------------- it survives a save and a deletion
{
  assert(/if\(o\.userData\.parNid\) e\.par = String\(o\.userData\.parNid\);/.test(src), 'serialized as `par`');
  assert(/Top level — a STATIC crate on a lift is the commonest case/.test(src),
    '...at the TOP LEVEL of propEntry, not inside the dynamic-props block — a static crate on a lift is the commonest case of all');
  assert(/if\(p\.par\)\{ obj\.userData\.parNid = String\(p\.par\)\.slice\(0,64\);/.test(src), 'and re-read, length-capped');
  assert(/a deleted parent RELEASES its children where they stand/.test(src),
    'a deleted parent releases its children rather than leaving them pointing at a dead nid');
  assert(/if\(obj\.userData\.nid\)\{ for\(const q of propModels\)\{ if\(q && q\.userData && q\.userData\.parNid===obj\.userData\.nid\)\{ delete q\.userData\.parNid;/.test(src),
    '...in removeProp, which every deletion path goes through');
}

// ---------------------------------------------------------------- THE BUG THIS BUILD'S PROBE FOUND IN 1305
{
  // `if(breakable===false) e.brk=false;` … `else { hp, breakStyle, objective, explosive }`. Build 1305
  // inserted the impact-sound line BETWEEN them, so the `else` silently re-bound to it: any prop carrying
  // a hit sound stopped serializing its health, break style, objective flag and explosive settings.
  const pe = extractFunction('propEntry');
  const iSnd = pe.indexOf('e.hsn = String'), iBrk = pe.indexOf('if(o.userData.breakable===false) e.brk=false;'), iElse = pe.indexOf('else { if(o.userData.maxHp!=null)');
  assert(iSnd > 0 && iBrk > iSnd, 'the impact sound is written BEFORE the breakable test…');
  assert(iElse > iBrk && iElse - iBrk < 140, '…so the `else` binds to the test it belongs to, with nothing between them');
  assert(/DO NOT put a statement between this `if` and its `else`/.test(src),
    'and the trap is written down where the next person will insert a line');
  // measured live: with and without a hit sound, the entry is identical in every other field
}

done('build 1309 (editor audit 4.5): props can ride other props — the scene was flat, so a crate on a moving platform did not ride it, `moveprop` was a teleport, and a rotating assembly had to be authored as one mesh. A child names its parent by nid and follows the parent\'s per-frame DELTA — a follow constraint, deliberately NOT scene-graph re-parenting, because a prop (unlike build 997\'s light) has world-space colliders, a world-space serialized transform and a world-space gizmo, all three of which re-parenting silently turns local. Depth-ordered so a chain settles in one frame; cycle-refusing; released in place when the parent is deleted; and it inherits the existing mover story (kinematic body, mobile spatial-grid class) rather than reimplementing it. Verified live: a 5 m slide carried the crate AND its collider, a 90 deg turn swung it about the parent\'s origin at an unchanged radius with its own yaw turned, a three-link chain settled in one frame. The probe also caught a build 1305 regression: the impact-sound line had landed between an `if` and its `else`, so any prop with a hit sound had stopped serializing its health, break style, objective flag and explosive settings');
