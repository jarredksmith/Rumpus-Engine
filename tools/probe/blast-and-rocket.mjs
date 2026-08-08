// Two reports from play, measured: "grenades don't seem to cause dynamic props to react" and "some
// imported props let the rocket pass right through them."
//
// They share a root. A prop with PHYSICS on is spliced out of `colliders` by setPropDynamic and lives in
// `dynamicProps`, so every consumer has to ask for both lists — the bullet ray always did, the rocket ray
// never did. And `explodeGrenade` is a SEPARATE detonator from `explodeAt` that referenced props zero
// times, so build 1405's damage-and-throw reached every blast in the game except the grenade.
import { withGame } from './driver.mjs';
const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  const setup = await P(`(function(){
    paused = false; gameOn = true;
    window.__mk = function(x, z, dyn){
      let o = null;
      spawnProp('box', [x, 1.2, z, 0,0,0, 1,1,1], (p)=>{ o = p; });
      if(!o) return null;
      o.userData.maxHp = 500; o.userData.hp = 500; o.userData.breakable = true;
      if(dyn) setPropDynamic(o, true);
      return o;
    };
    return { ok:true };
  })()`);
  if (!setup.ok) { console.log('! setup failed'); return; }

  console.log('\n--- 1. a grenade beside a dynamic crate ----------------------------------------');
  const nade = await P(`(function(){
    const B = 44;
    const dyn = __mk(B, B, true), stat = __mk(B+30, B, false);
    const before = { dynIn: colliders.indexOf(dyn) >= 0, dynInDyn: dynamicProps.indexOf(dyn) >= 0,
                     hp: dyn.userData.hp, x: +dyn.position.x.toFixed(3), z: +dyn.position.z.toFixed(3) };
    /* a real grenade, detonated through the real path */
    explodeGrenade({ mesh: { position: new THREE.Vector3(B + 1.2, 1.2, B) }, by: 0, fuse: 0 });
    const after = { hp: dyn.userData.hp, x: +dyn.position.x.toFixed(3), z: +dyn.position.z.toFixed(3),
                    vel: dyn.userData._physBody ? 'has a body' : 'no body' };
    /* the CONTROL: an identical crate 30 m away, outside the blast — if it moved, the rig moved it */
    const ctl = { hp: stat.userData.hp, x: +stat.position.x.toFixed(3) };
    return { before, after, ctl,
             damaged: before.hp - after.hp, moved: +Math.hypot(after.x-before.x, after.z-before.z).toFixed(3) };
  })()`);
  say('crate before', nade.before);
  say('crate after', nade.after);
  say('damage dealt', nade.damaged);
  say('CONTROL 30 m away', nade.ctl);

  console.log('\n--- 2. a rocket fired at a dynamic prop ----------------------------------------');
  const rk = await P(`(async function(){
    const B = -44;
    const dyn = __mk(B, B, true);
    const o = new THREE.Vector3(B - 14, 1.2, B);
    const d = new THREE.Vector3(1, 0, 0);
    const n0 = rockets.length;
    fireRocket(o, d, 0, true, 7, 60);
    /* drive the rocket's own update until it detonates or gives up */
    let f = 0;
    while(rockets.length > n0 && f < 200){ updateRockets(1/60); f++; }
    return { frames: f, detonated: rockets.length === n0,
             hp: dyn.userData.hp, damaged: 500 - dyn.userData.hp,
             inColliders: colliders.indexOf(dyn) >= 0, inDynamic: dynamicProps.indexOf(dyn) >= 0 };
  })()`);
  say('rocket', rk);
}, { settleMs: 5000 });
console.log('');
