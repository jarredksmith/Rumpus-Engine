// build 1392: reported from play — "This isn't working. The prop never breaks."
//
// Build 1390 taught `damageProp` that a static prop can opt in with `shootable`, and stopped there. Nothing
// that FIRES resolves a prop through `damageProp`: the bullet and turret walks look for `userData.phys` and
// the melee block both gated on and raycast `dynamicProps`. So the checkbox was ticked, the HP was set, and
// the plate never broke — build 1277's defect, and 1390's own probe walked past it by calling `damageProp`
// directly instead of driving a shot.
//
// This probe drives the REAL `shoot()` and `_meleeStrike()` against a real static target, with a dynamic
// control beside it so a null cannot be read as "the instrument works and the feature does not".
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    /* Two identical props 2 m in front of the spawn: one STATIC+shootable, one DYNAMIC (the control). */
    const mk = (x, z, dyn) => {
      const o = propModels.find(p => p && !p.userData.runtime && !p.userData._probe);
      return null;
    };
    /* take two ordinary level props and repurpose them, the way a creator would in the editor */
    const cands = propModels.filter(p => p && p.userData && !p.userData.runtime && !p.userData.phys);
    if(cands.length < 2) return { err:'not enough props', n:cands.length };
    const tgt = cands[0], ctl = cands[1];
    tgt.userData._probeRole='static'; ctl.userData._probeRole='dynamic';
    for(const o of [tgt, ctl]) o.scale.set(1,1,1);
    tgt.position.set(0, 1, 32); ctl.position.set(3, 1, 32);
    if(typeof setPropDynamic==='function') setPropDynamic(ctl, true);
    tgt.userData.shootable = true; tgt.userData.breakable = true;
    tgt.userData.maxHp = 30; tgt.userData.hp = 30;
    ctl.userData.breakable = true; ctl.userData.maxHp = 30; ctl.userData.hp = 30;
    if(typeof refreshPropCollider==='function'){ refreshPropCollider(tgt); refreshPropCollider(ctl); }
    return { staticIsDyn: dynamicProps.indexOf(tgt)>=0, ctlIsDyn: dynamicProps.indexOf(ctl)>=0,
             dmgSet: damageableProps().length, tgtBox: !!tgt.userData.box };
  })()`)));

  // ---------------------------------------------------------------- the BULLET path
  console.log('BULLET:', JSON.stringify(await P(`(function(){
    const tgt = propModels.find(o=>o&&o.userData&&o.userData._probeRole==='static');
    player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;   /* face +Z, at the target */
    camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    tgt.userData.hp = 30; tgt.userData._shattered=false; tgt.userData._destroyed=false;
    curWep='rifle'; const w=WEAPONS.rifle; w.mag = 30; lastShot = 0;
    const out=[];
    for(let i=0;i<4;i++){ lastShot = 0; shoot(); out.push(tgt.userData.hp); }
    return { hpAfterEachShot: out, shattered: !!tgt.userData._shattered, visible: tgt.visible };
  })()`)));

  // ------------------------------------------------------------------ the MELEE path
  // The first run of this read hp SYNCHRONOUSLY after meleeAttack() and measured ZERO on the static target
  // AND on the dynamic control. A null in the control is the instrument, not the feature: build 1303 split
  // the swing from the contact, so the blow lands on a windup timer (crowbar 160 ms). Wait for it.
  const swing = async (role) => {
    await P(`(function(){
      const o = propModels.find(x=>x&&x.userData&&x.userData._probeRole==='${role}');
      /* the bullet test above DESTROYED the static target. Hand-poking _shattered/_destroyed back to false
         left it in a half-restored state and the swing measured zero — my fault, not the engine's. Use the
         real restore (build 1391), which is also the thing a range booth's reset verb calls. */
      o.userData.maxHp = 200;
      if(typeof _restoreDestroyedProp==='function') _restoreDestroyedProp(o);
      o.userData.hp = 200; o.userData._shattered=false; o.userData._destroyed=false; o.visible=true;
      player.pos.set(o.position.x, EYE, o.position.z - 2); player.yaw = Math.PI; player.pitch = 0;
      camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
      _meleeT = 0; meleeAttack(WEAPONS.crowbar); return 1;
    })()`);
    await page.waitForTimeout(600);   /* past the 160 ms windup, with room for a slow frame */
    return P(`(function(){
      const o = propModels.find(x=>x&&x.userData&&x.userData._probeRole==='${role}');
      return { hp: o.userData.hp, damaged: +(200 - o.userData.hp).toFixed(1) };
    })()`);
  };
  console.log('MELEE static :', JSON.stringify(await swing('static')));
  console.log('MELEE control:', JSON.stringify(await swing('dynamic')));

  // ---------------------------------------------------------------- the BLAST path
  console.log('BLAST :', JSON.stringify(await P(`(function(){
    const tgt = propModels.find(o=>o&&o.userData&&o.userData._probeRole==='static');
    const ctl = propModels.find(o=>o&&o.userData&&o.userData._probeRole==='dynamic');
    for(const o of [tgt, ctl]){ o.userData.maxHp = 200;
      if(typeof _restoreDestroyedProp==='function') _restoreDestroyedProp(o);
      o.userData.hp = 200; o.userData._shattered=false; o.userData._destroyed=false; o.visible=true; }
    ctl.position.set(1.5, 1, 32);   /* beside the target, inside the same blast */
    if(typeof refreshPropCollider==='function') refreshPropCollider(ctl);
    /* NOT at (0,1,32): both sweeps guard d>0.01 so an exploding barrel cannot damage itself, and a blast
       placed exactly on the target's origin reads as a dead feature. Off-centre, inside the radius. */
    explodeAt(new THREE.Vector3(0.7, 1, 32), 6, 120, false, NET.myId);
    return { STATIC:{ hp: tgt.userData.hp, damaged:+(200-tgt.userData.hp).toFixed(1) },
             DYNAMIC_control:{ hp: ctl.userData.hp, damaged:+(200-ctl.userData.hp).toFixed(1) } };
  })()`)));

  // ------------------------------------------------------- and the negative control
  // An ordinary static prop that never opted in must stay indestructible, or this build has made every
  // wall in every existing level shootable.
  console.log('CONTROL (plain static wall, must NOT break):', JSON.stringify(await P(`(function(){
    const plain = propModels.find(o=>o && o.userData && !o.userData.phys && !o.userData.shootable && !o.userData._probeRole);
    if(!plain) return { err:'no plain prop' };
    plain.position.set(0, 1, 32); if(typeof refreshPropCollider==='function') refreshPropCollider(plain);
    plain.userData.maxHp = 50; plain.userData.hp = 50;
    player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
    curWep='rifle'; WEAPONS.rifle.mag = 30;
    for(let i=0;i<3;i++){ lastShot = 0; shoot(); }
    _meleeT = 0; meleeAttack(WEAPONS.crowbar);
    return { hp: plain.userData.hp, shattered: !!plain.userData._shattered, inDmgSet: damageableProps().indexOf(plain)>=0 };
  })()`)));
}, { settleMs: 9000 });
