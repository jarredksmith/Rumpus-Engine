// Is the feature sweep's melee check measuring the feature, or its own fixture?
//
// It sets `userData.phys = true` BY HAND, which is not the same as being a physics body: build 1392 made
// every damage consumer resolve through `damageableProps()` — dynamic props plus static shootables — and a
// prop that merely carries the flag is in neither list. Before believing a null, prove the instrument can
// produce a positive (build 1316).
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  console.log('three fixtures, one swing each:');
  console.log('  ', JSON.stringify(await P(`(function(){
    paused = false; gameOn = true;
    const mk = (z, setup) => { let o=null; spawnProp('box',[0,0,z,0,0,0,2,2,2],(b)=>{o=b;});
      o.userData.hp=100; o.userData.maxHp=100; o.userData.breakable=true; if(setup) setup(o);
      if(typeof refreshPropCollider==='function') refreshPropCollider(o); return o; };

    const flagOnly = mk(-3, o=>{ o.userData.phys = true; });                 /* the sweep's fixture */
    const target   = mk(-9, o=>{ o.userData.shootable = true; });           /* build 1390's opt-in */
    let dynamic    = mk(-15, o=>{ if(typeof setPropDynamic==='function') setPropDynamic(o, true); });

    const swingAt = (o) => {
      const p = o.position;
      player.pos.set(p.x, 1.7, p.z + 2.2); player.yaw = 0; player.pitch = 0;
      camera.position.copy(player.pos); camera.rotation.set(0, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);
      curWep = 'crowbar'; const w = WEAPONS.crowbar;
      const before = o.userData.hp;
      _meleeStrike(w, w.reach, w.dmg);
      return { before, after: o.userData.hp, damaged: o.userData.hp < before };
    };

    const dp = damageableProps();
    return {
      flagOnly: { inDamageable: dp.indexOf(flagOnly) >= 0, swing: swingAt(flagOnly) },
      target:   { inDamageable: dp.indexOf(target)   >= 0, swing: swingAt(target)   },
      dynamic:  { inDamageable: dp.indexOf(dynamic)  >= 0, inDynamicProps: dynamicProps.indexOf(dynamic) >= 0,
                  swing: swingAt(dynamic) }
    };
  })()`)));
}, { settleMs: 9000 });
