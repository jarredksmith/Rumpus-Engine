import { withGame } from './driver.mjs';
const J = o => JSON.stringify(o);
await withGame(async (P) => {
  // reach: are the new symbols at module scope?
  console.log('reach       ', await P(`J({ ct: typeof _combatTargets, fac: typeof _facOf, names: typeof FACTION_NAMES })`.replace('J','JSON.stringify')));

  const spawn2 = `
    (()=>{ for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
      player.pos.set(0,1.7,0); camera.position.set(0,1.7,0);
      spawnEnemy({ x:6,  z:0, mode:'hunt', type:'gunner', fac:0, mark:{} });   // ally, ranged
      spawnEnemy({ x:14, z:0, mode:'hunt', type:'gunner', fac:1, mark:{} });   // hostile, ranged
      for(const e of enemies){ e.mesh.position.y = 1.4; e.home = {x:e.mesh.position.x, z:e.mesh.position.z}; }
      return 'ok'; })()`;
  console.log('spawned     ', await P(spawn2));
  console.log('factions    ', await P(`JSON.stringify(enemies.map(e=>({f:e.faction,t:e.type,hp:e.hp})))`));

  // one frame of the real loop, then read who each one picked
  await P(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  console.log('targets     ', await P(`JSON.stringify(enemies.map(e=>({
      me:e.faction, tgtFac:(e._near&&e._near.fac!=null)?e._near.fac:0,
      tgtIsEnemy:!!(e._near&&e._near.en), dist:+((e._dist||0).toFixed(1)), noTgt:!!e._noTgt })))`));

  // let them fight for ~4 s of real frames
  console.log('hostileAlive before', await P(`String(_hostileAlive())`));
  const hp0 = await P(`JSON.stringify(enemies.map(e=>e.hp))`);
  await P(`new Promise(r=>{ let n=0; const t=()=>{ if(++n>240) return r('done'); requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
  console.log('hp  ' + hp0 + ' -> ' + await P(`JSON.stringify(enemies.map(e=>({f:e.faction,hp:Math.round(e.hp)})))`));
  console.log('player hp   ', await P(`String(Math.round(player.hp))+' / '+String(player.maxHp)`));
  console.log('runKills    ', await P(`String(runKills)`));
  console.log('hostileAlive', await P(`String(_hostileAlive())`));

  // ---- the compatibility guarantee: a level with only default enemies never builds the enemy list
  console.log('\n-- default-only level --');
  await P(`(()=>{ for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
    spawnEnemy({x:20,z:0,mode:'hunt',type:'grunt',mark:{}}); spawnEnemy({x:24,z:0,mode:'hunt',type:'grunt',mark:{}}); return 'ok'; })()`);
  await P(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  console.log('list len    ', await P(`JSON.stringify({ targets:_combatTargets().length, players:allPlayers().length, fac:enemies.map(e=>e.faction) })`));
  console.log('they target ', await P(`JSON.stringify(enemies.map(e=>({ tgtIsEnemy:!!(e._near&&e._near.en), noTgt:!!e._noTgt })))`));

  // ---- an ally alone: nothing to fight, must NOT hunt the player
  console.log('\n-- a lone ally --');
  await P(`(()=>{ for(let i=enemies.length-1;i>=0;i--){ scene.remove(enemies[i].mesh); enemies.splice(i,1); }
    spawnEnemy({x:8,z:0,mode:'hunt',type:'brute',fac:0,mark:{}}); enemies[0].home={x:8,z:0}; return 'ok'; })()`);
  await P(`new Promise(r=>{ let n=0; const t=()=>{ if(++n>90) return r('done'); requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
  console.log('lone ally   ', await P(`JSON.stringify({ noTgt:!!enemies[0]._noTgt, aware:!!enemies[0].aware, chase:!!enemies[0]._chase,
      distToPlayer:+Math.hypot(enemies[0].mesh.position.x-player.pos.x, enemies[0].mesh.position.z-player.pos.z).toFixed(1),
      playerHp:Math.round(player.hp), hostileAlive:_hostileAlive() })`));
}, { settleMs: 2500 });
