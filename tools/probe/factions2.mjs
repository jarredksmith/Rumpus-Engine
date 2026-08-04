import { withGame } from './driver.mjs';
await withGame(async (P) => {
  // a controlled arena: no wave spawning at all, so every hp change is one of MY four creatures
  const reset = (spec) => `(()=>{
    for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
    toSpawn = 0; if(typeof spawnQueue!=='undefined') spawnQueue.length = 0;
    player.pos.set(0,1.7,0); camera.position.set(0,1.7,0); player.hp = player.maxHp;
    ${spec}
    for(const e of enemies){ e.hp = e.maxHp = 400; e.home={x:e.mesh.position.x,z:e.mesh.position.z}; }
    return enemies.map(e=>e.faction).join(','); })()`;
  const frames = (n) => `new Promise(r=>{ let k=0; const t=()=>{ toSpawn=0; if(typeof spawnQueue!=='undefined') spawnQueue.length=0;
     if(++k>${n}) return r('done'); requestAnimationFrame(t); }; requestAnimationFrame(t); })`;

  console.log('== two gunners, opposite sides, 6 m apart ==');
  console.log('factions   ', await P(reset(`
    spawnEnemy({ x:-3, z:20, mode:'hunt', type:'gunner', fac:0, mark:{} });
    spawnEnemy({ x: 3, z:20, mode:'hunt', type:'gunner', fac:1, mark:{} });`)));
  await P(frames(2));
  console.log('picked     ', await P(`JSON.stringify(enemies.map(e=>({ me:e.faction, tgtFac:(e._near&&e._near.fac!=null)?e._near.fac:0, isEnemy:!!(e._near&&e._near.en), d:+e._dist.toFixed(1) })))`));
  await P(frames(300));
  console.log('after 5 s  ', await P(`JSON.stringify({ hp:enemies.map(e=>({f:e.faction,hp:Math.round(e.hp)})),
    playerHp:Math.round(player.hp), bolts:enemyShots.length, runKills, alive:_hostileAlive() })`));

  console.log('\n== the player is never a target of either side... except the hostile ==');
  console.log('factions   ', await P(reset(`
    spawnEnemy({ x:0, z:8, mode:'hunt', type:'gunner', fac:0, mark:{} });`)));
  await P(frames(300));
  console.log('lone ally  ', await P(`JSON.stringify({ playerHp:Math.round(player.hp), noTgt:!!enemies[0]._noTgt, chase:!!enemies[0]._chase, aware:!!enemies[0].aware, shotsFired:enemyShots.length })`));
  console.log('factions   ', await P(reset(`
    spawnEnemy({ x:0, z:8, mode:'hunt', type:'gunner', fac:1, mark:{} });`)));
  await P(frames(300));
  console.log('lone hostl ', await P(`JSON.stringify({ playerHp:Math.round(player.hp), noTgt:!!enemies[0]._noTgt, chase:!!enemies[0]._chase, aware:!!enemies[0].aware })`));

  console.log('\n== rewards: who gets credit ==');
  await P(reset(`spawnEnemy({ x:0, z:30, mode:'hold', type:'grunt', fac:1, mark:{} });`));
  await P(`runKills=0; credits=0; enemies[0].hp=1; 'ok'`);
  console.log('ally kill  ', await P(`(()=>{ const before={k:runKills,c:coins.length}; enemyHurt(enemies[0], 50, 0, 29, true);
     return JSON.stringify({ runKills:runKills-before.k, coinsDropped:coins.length-before.c, note:'byEnemy=true' }); })()`));
  await P(reset(`spawnEnemy({ x:0, z:30, mode:'hold', type:'grunt', fac:1, mark:{} });`));
  await P(`runKills=0; enemies[0].hp=1; 'ok'`);
  console.log('your kill  ', await P(`(()=>{ const before={k:runKills,c:coins.length}; enemyHurt(enemies[0], 50, 0, 29);
     return JSON.stringify({ runKills:runKills-before.k, coinsDropped:coins.length-before.c, note:'byEnemy absent' }); })()`));
  await P(reset(`spawnEnemy({ x:0, z:30, mode:'hold', type:'grunt', fac:0, mark:{} });`));
  await P(`runKills=0; enemies[0].hp=1; 'ok'`);
  console.log('kill ally  ', await P(`(()=>{ const before={k:runKills,c:coins.length}; enemyHurt(enemies[0], 50, 0, 29);
     return JSON.stringify({ runKills:runKills-before.k, coinsDropped:coins.length-before.c, note:'you shot your own ally' }); })()`));
}, { settleMs: 2500 });
