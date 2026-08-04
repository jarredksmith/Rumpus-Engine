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

  // ---- THE BASE CASE: a hostile's bolt must still hit the player, exactly as before this build
  console.log('hostile fac', await P(reset(`spawnEnemy({x:0,z:6,mode:'hold',type:'gunner',fac:1,mark:{}});`)));
  await P(`fireEnemyShot(enemies[0], allPlayers()[0], 0); JSON.stringify({fac:enemyShots[0].fac, dmg:enemyShots[0].dmg})`)
    .then(r=>console.log('  bolt     ', r));
  await P(frames(30));
  console.log('  player   ', await P(`JSON.stringify({ hp:Math.round(player.hp), boltsLeft:enemyShots.length })`));

  // ---- an ALLY's bolt must pass the player by
  console.log('ally fac   ', await P(reset(`spawnEnemy({x:0,z:6,mode:'hold',type:'gunner',fac:0,mark:{}});`)));
  await P(`fireEnemyShot(enemies[0], allPlayers()[0], 0); JSON.stringify({fac:enemyShots[0].fac})`)
    .then(r=>console.log('  bolt     ', r));
  await P(frames(30));
  console.log('  player   ', await P(`JSON.stringify({ hp:Math.round(player.hp), boltsLeft:enemyShots.length })`));

  // ---- a hostile's bolt must hit an ALLY standing in the way
  console.log('both       ', await P(reset(`
    spawnEnemy({x:0,z:6,  mode:'hold',type:'gunner',fac:0,mark:{}});
    spawnEnemy({x:0,z:30, mode:'hold',type:'gunner',fac:1,mark:{}});`)));
  await P(frames(2));
  console.log('  fire     ', await P(`(()=>{ const tgt=_combatTargets().find(t=>t.en===enemies[0]);
     fireEnemyShot(enemies[1], tgt, 0); return JSON.stringify({ boltFac:enemyShots[0].fac, targetFac:tgt.fac, allyHp:enemies[0].hp }); })()`));
  await P(frames(60));
  console.log('  after    ', await P(`JSON.stringify({ allyHp:Math.round(enemies[0].hp), hostileHp:Math.round(enemies[1].hp), playerHp:Math.round(player.hp), boltsLeft:enemyShots.length })`));

  // ---- and MELEE across factions, through the real wind-up/strike path
  console.log('melee      ', await P(reset(`
    spawnEnemy({x:0,z:40,  mode:'hunt',type:'brute',fac:0,mark:{}});
    spawnEnemy({x:1.5,z:40,mode:'hunt',type:'brute',fac:1,mark:{}});`)));
  await P(frames(240));
  console.log('  after 4 s', await P(`JSON.stringify({ hp:enemies.map(e=>({f:e.faction,hp:Math.round(e.hp)})), playerHp:Math.round(player.hp) })`));
}, { settleMs: 2500 });
