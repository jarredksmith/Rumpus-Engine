import { withGame } from './driver.mjs';
await withGame(async (P) => {
  const reset = (spec) => `(()=>{
    for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
    toSpawn=0; if(typeof spawnQueue!=='undefined') spawnQueue.length=0; enemyShots.length=0;
    player.pos.set(0,1.7,0); camera.position.set(0,1.7,0); player.hp=player.maxHp;
    ${spec}
    for(const e of enemies){ e.hp=e.maxHp=400; e.home={x:e.mesh.position.x,z:e.mesh.position.z}; }
    return enemies.map(e=>e.faction).join(','); })()`;
  const frames = (n) => `new Promise(r=>{ let k=0; const t=()=>{ toSpawn=0; if(typeof spawnQueue!=='undefined') spawnQueue.length=0;
     if(++k>${n}) return r('done'); requestAnimationFrame(t); }; requestAnimationFrame(t); })`;

  console.log('fps sanity ', await P(`(async()=>{ const t0=performance.now(); await new Promise(r=>{let k=0;const t=()=>{ if(++k>20) return r(); requestAnimationFrame(t); }; requestAnimationFrame(t);});
     return JSON.stringify({ msPer20Frames:Math.round(performance.now()-t0) }); })()`));

  console.log('\n-- bolt at close range hits an ally (long range TUNNELS at 1 fps) --');
  console.log('both       ', await P(reset(`
    spawnEnemy({x:0,z:6,  mode:'hold',type:'gunner',fac:0,mark:{}});
    spawnEnemy({x:0,z:9,  mode:'hold',type:'gunner',fac:1,mark:{}});`)));
  await P(frames(2));
  console.log('  fired    ', await P(`(()=>{ const tgt=_combatTargets().find(t=>t.en===enemies[0]);
     enemyShots.length=0; fireEnemyShot(enemies[1], tgt, 0);
     const s=enemyShots[0]; return JSON.stringify({ boltFac:s.fac, tgtFac:tgt.fac, speed:+s.vel.length().toFixed(1), gap:3 }); })()`));
  await P(`(()=>{ /* step the bolt in SMALL dt slices, the way a 60fps frame would */
     for(let i=0;i<200 && enemyShots.length;i++) updateEnemyShots(1/60);
     return 'ok'; })()`);
  console.log('  after    ', await P(`JSON.stringify({ allyHp:Math.round(enemies[0].hp), hostileHp:Math.round(enemies[1].hp), playerHp:Math.round(player.hp), boltsLeft:enemyShots.length })`));

  console.log('\n-- and the reverse: an ALLY bolt at a hostile --');
  await P(`(()=>{ enemies[0].hp=enemies[1].hp=400; enemyShots.length=0;
     const tgt=_combatTargets().find(t=>t.en===enemies[1]); fireEnemyShot(enemies[0], tgt, 0);
     for(let i=0;i<200 && enemyShots.length;i++) updateEnemyShots(1/60); return 'ok'; })()`);
  console.log('  after    ', await P(`JSON.stringify({ allyHp:Math.round(enemies[0].hp), hostileHp:Math.round(enemies[1].hp), playerHp:Math.round(player.hp) })`));

  console.log('\n-- melee: why did two brutes not connect? --');
  console.log('brutes     ', await P(reset(`
    spawnEnemy({x:0,z:40,  mode:'hunt',type:'brute',fac:0,mark:{}});
    spawnEnemy({x:2.0,z:40,mode:'hunt',type:'brute',fac:1,mark:{}});`)));
  await P(frames(120));
  console.log('  state    ', await P(`JSON.stringify(enemies.map(e=>({ f:e.faction, chase:!!e._chase, d:+e._dist.toFixed(2),
      reach:e._reach||2.4, cd:+(e.cooldown||0).toFixed(2), wind:e._windupT?1:0, hasHurt:!!(e._near&&e._near.hurt),
      sep:+Math.hypot(enemies[0].mesh.position.x-enemies[1].mesh.position.x, enemies[0].mesh.position.z-enemies[1].mesh.position.z).toFixed(2) })))`));
  await P(frames(240));
  console.log('  after    ', await P(`JSON.stringify({ hp:enemies.map(e=>Math.round(e.hp)), playerHp:Math.round(player.hp) })`));
}, { settleMs: 2500 });
