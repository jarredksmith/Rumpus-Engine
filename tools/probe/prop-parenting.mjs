// build 1309 (editor audit 4.5) — "a crate on a moving platform does not ride it, `moveprop` is a
// teleport, a rotating assembly must be authored as one mesh."
//
// Drives the REAL constraint in the REAL frame loop: builds a platform and a crate, parents them through
// the real setPropParent, moves the platform the way a mechanism does, and reads back where the crate
// ended up — plus its COLLIDER, because a crate whose mesh rides and whose collider does not is worse
// than no feature at all.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  /* two primitives placed the way the editor's Add-a-shape does */
  const mk = (x,y,z,name) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(2,1,2), new THREE.MeshStandardMaterial({color:0x888888}));
    g.add(m); g.position.set(x,y,z); g.userData.src='box'; g.userData.nid = genNid(); g.userData.name = name;
    scene.add(g); propModels.push(g); colliders.push(g);
    if(typeof refreshPropCollider==='function') refreshPropCollider(g);
    return g;
  };
  window.__PLAT = mk(0, 1, 34, 'platform');
  window.__CRATE = mk(0, 2, 34, 'crate');
  window.__LAMP  = mk(0, 3, 34, 'lamp');       /* a chain: lamp rides crate rides platform */
  return { props:propModels.length, plat:window.__PLAT.userData.nid, crate:window.__CRATE.userData.nid };
})()`;

const boxOf = (v) => `(function(){ const o=${v}; if(typeof refreshPropCollider==='function') refreshPropCollider(o);
  const b=o.userData.box; return { p:[+o.position.x.toFixed(3),+o.position.y.toFixed(3),+o.position.z.toFixed(3)],
    boxc:[+((b.min.x+b.max.x)/2).toFixed(3), +((b.min.y+b.max.y)/2).toFixed(3), +((b.min.z+b.max.z)/2).toFixed(3)] }; })()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(SETUP)));

  console.log('parent:', JSON.stringify(await P(`(function(){
    const ok1 = setPropParent(window.__CRATE, window.__PLAT);
    const ok2 = setPropParent(window.__LAMP,  window.__CRATE);
    return { crateToPlat:ok1, lampToCrate:ok2,
      cycleRefused: setPropParent(window.__PLAT, window.__LAMP),      /* would close a loop */
      selfRefused:  setPropParent(window.__PLAT, window.__PLAT) };
  })()`)));

  // one frame so the constraint captures the parent's starting pose, then MOVE the platform
  await page.waitForTimeout(600);
  console.log('before:', 'crate', JSON.stringify(await P(boxOf('window.__CRATE'))));

  console.log('slide 5m:', JSON.stringify(await P(`(function(){
    window.__PLAT.position.x += 5; if(typeof refreshPropCollider==='function') refreshPropCollider(window.__PLAT);
    _syncParentedProps();
    return { crate:[+window.__CRATE.position.x.toFixed(3), +window.__CRATE.position.z.toFixed(3)],
             lamp:[+window.__LAMP.position.x.toFixed(3), +window.__LAMP.position.z.toFixed(3)],
             chainInOneFrame: Math.abs(window.__LAMP.position.x - 5) < 1e-6 };
  })()`)));
  console.log('after :', 'crate', JSON.stringify(await P(boxOf('window.__CRATE'))));

  console.log('turn 90deg:', JSON.stringify(await P(`(function(){
    /* the audit's third case: a rotating assembly. The crate sits 0 off the axis in XZ, so put it out at
       +3 first so a rotation about the parent's origin is actually observable. */
    window.__CRATE.position.set(window.__PLAT.position.x + 3, 2, window.__PLAT.position.z);
    _syncParentedProps();
    window.__PLAT.rotateY(Math.PI/2);
    _syncParentedProps();
    const dx = window.__CRATE.position.x - window.__PLAT.position.x, dz = window.__CRATE.position.z - window.__PLAT.position.z;
    return { offset:[+dx.toFixed(3), +dz.toFixed(3)], radius:+Math.hypot(dx,dz).toFixed(3),
             crateTurned:+((new THREE.Euler().setFromQuaternion(window.__CRATE.quaternion,'YXZ')).y*180/Math.PI).toFixed(1) };
  })()`)));

  console.log('physics :', JSON.stringify(await P(`(function(){
    return { crateIsMover: !!_cgMobileNow(window.__CRATE), platIsMover: !!_cgMobileNow(window.__PLAT),
             lampIsMover: !!_cgMobileNow(window.__LAMP) };
  })()`)));

  console.log('save/load:', JSON.stringify(await P(`(function(){
    const lvl = JSON.parse(JSON.stringify(serializeLevel()));
    const kids = (lvl.props||[]).filter(p=>p && p.par);
    return { serializedChildren:kids.length, par:kids.map(k=>k.par).slice(0,2) };
  })()`)));

  // build 1305's dangling `else`: a prop carrying a hit sound stopped serializing everything the
  // breakable branch writes. Prove it round-trips now.
  console.log('1305 regr:', JSON.stringify(await P(`(function(){
    const o = window.__CRATE;
    o.userData.phys = o.userData.phys || {}; o.userData.breakable = true;
    o.userData.maxHp = 175; o.userData.breakStyle='puff'; o.userData.objective = true; o.userData.explosive = true; o.userData.blastRadius = 9;
    const noSnd = propEntry(o);
    o.userData.hitSnd = 'https://example.invalid/wood.mp3';
    const withSnd = propEntry(o);
    return { withoutSound:{ hp:noSnd.hp, bst:noSnd.bst, obj:noSnd.obj, exp:noSnd.exp },
             withSound:{ hp:withSnd.hp, bst:withSnd.bst, obj:withSnd.obj, exp:withSnd.exp, hsn:!!withSnd.hsn },
             identical: noSnd.hp===withSnd.hp && noSnd.bst===withSnd.bst && noSnd.obj===withSnd.obj && noSnd.exp===withSnd.exp };
  })()`)));

  console.log('release :', JSON.stringify(await P(`(function(){
    const at = window.__CRATE.position.x;
    const i = propModels.indexOf(window.__PLAT); if(i>=0) removeProp(i);
    return { crateStillThere: Math.abs(window.__CRATE.position.x - at) < 1e-9,
             parentCleared: !window.__CRATE.userData.parNid };
  })()`)));
}, { settleMs: 9000 });
