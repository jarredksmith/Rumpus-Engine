import { withGame } from './driver.mjs';
await withGame(async (P) => {
  await P(`(()=>{ for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
    toSpawn=0; if(typeof spawnQueue!=='undefined') spawnQueue.length=0; enemyShots.length=0;
    player.pos.set(0,1.7,0); camera.position.set(0,1.7,0); player.hp=player.maxHp;
    spawnEnemy({x:0,z:6, mode:'hold',type:'gunner',fac:0,mark:{}});
    spawnEnemy({x:0,z:9, mode:'hold',type:'gunner',fac:1,mark:{}});
    for(const e of enemies){ e.hp=e.maxHp=400; e.home={x:e.mesh.position.x,z:e.mesh.position.z}; } return 'ok'; })()`);
  await P(`new Promise(r=>{let k=0;const t=()=>{ toSpawn=0; if(++k>3) return r(); requestAnimationFrame(t);};requestAnimationFrame(t);})`);

  console.log('list       ', await P(`JSON.stringify(_combatTargets().map(t=>({ fac:(t.fac||0), en:!!t.en,
     pos:[+t.pos.x.toFixed(2),+(t.pos.y!=null?t.pos.y:0).toFixed(2),+t.pos.z.toFixed(2)], eyeY:+(t.eyeY||0).toFixed(2), hurt:typeof t.hurt })))`));

  console.log('trace      ', await P(`(()=>{
     const tgt=_combatTargets().find(t=>t.en===enemies[1]);
     enemyShots.length=0; fireEnemyShot(enemies[0], tgt, 0);
     const s=enemyShots[0];
     const log=[{ boltFac:s.fac, from:[+s.mesh.position.x.toFixed(2),+s.mesh.position.y.toFixed(2),+s.mesh.position.z.toFixed(2)],
                  vel:[+s.vel.x.toFixed(2),+s.vel.y.toFixed(2),+s.vel.z.toFixed(2)] }];
     for(let i=0;i<40 && enemyShots.length;i++){
       updateEnemyShots(1/120);
       if(i%4===0 && enemyShots.length) log.push([+enemyShots[0].mesh.position.z.toFixed(2), +enemyShots[0].mesh.position.y.toFixed(2)]);
     }
     log.push({ boltsLeft:enemyShots.length, hostileHp:Math.round(enemies[1].hp), allyHp:Math.round(enemies[0].hp) });
     return JSON.stringify(log); })()`));
}, { settleMs: 2500 });
