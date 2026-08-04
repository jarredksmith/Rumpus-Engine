import { withGame } from './driver.mjs';
await withGame(async (P) => {
  const reset = (spec) => `(()=>{
    for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
    toSpawn=0; if(typeof spawnQueue!=='undefined') spawnQueue.length=0;
    player.pos.set(0,1.7,0); camera.position.set(0,1.7,0); player.hp=player.maxHp;
    ${spec}
    for(const e of enemies){ e.hp=e.maxHp=400; e.home={x:e.mesh.position.x,z:e.mesh.position.z}; }
    return enemies.map(e=>e.faction).join(','); })()`;
  const frames = (n) => `new Promise(r=>{ let k=0; const t=()=>{ toSpawn=0; if(typeof spawnQueue!=='undefined') spawnQueue.length=0;
     if(++k>${n}) return r('done'); requestAnimationFrame(t); }; requestAnimationFrame(t); })`;

  console.log('env        ', await P(`JSON.stringify({ gameOn, editorOpen, paused, duelDead, god:(typeof god!=='undefined'?god:'n/a') })`));

  // CONTROL: can this rig hurt the player at all? (build 1316 — prove the instrument first)
  console.log('control    ', await P(reset(`spawnEnemy({x:0,z:8,mode:'hunt',type:'gunner',fac:1,mark:{}});`)));
  console.log('  direct   ', await P(`(()=>{ const b=player.hp; applyEnemyDamageToSelf(7, 0, 8); return JSON.stringify({from:b,to:Math.round(player.hp)}); })()`));
  await P(`player.hp=player.maxHp; 'ok'`);
  await P(frames(240));
  console.log('  hostile  ', await P(`JSON.stringify({ playerHp:Math.round(player.hp), chase:!!enemies[0]._chase, see:!!enemies[0]._see,
      aware:!!enemies[0].aware, noTgt:!!enemies[0]._noTgt, mode:enemies[0].mode, ranged:!!enemies[0].ranged,
      tgtIsPlayer:!!(enemies[0]._near && !enemies[0]._near.en), d:+enemies[0]._dist.toFixed(1),
      pos:[+enemies[0].mesh.position.x.toFixed(1),+enemies[0].mesh.position.z.toFixed(1)] })`));
}, { settleMs: 2500 });
