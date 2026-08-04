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

  console.log('two gunners', await P(reset(`
    spawnEnemy({x:-3,z:20,mode:'hunt',type:'gunner',fac:0,mark:{}});
    spawnEnemy({x: 3,z:20,mode:'hunt',type:'gunner',fac:1,mark:{}});`)));
  await P(frames(2));
  console.log('  picked   ', await P(`JSON.stringify(enemies.map(e=>({me:e.faction,tgt:(e._near&&e._near.fac!=null)?e._near.fac:0,isEnemy:!!(e._near&&e._near.en)})))`));
  await P(frames(300));
  console.log('  5 s      ', await P(`JSON.stringify({ hp:enemies.map(e=>({f:e.faction,hp:Math.round(e.hp)})), playerHp:Math.round(player.hp), runKills, alive:_hostileAlive() })`));

  console.log('\ndefault    ', await P(reset(`
    spawnEnemy({x:20,z:0,mode:'hunt',type:'grunt',mark:{}});
    spawnEnemy({x:24,z:0,mode:'hunt',type:'grunt',mark:{}});`)));
  await P(frames(2));
  console.log('  list     ', await P(`JSON.stringify({ targets:_combatTargets().length, players:allPlayers().length, isEnemy:enemies.map(e=>!!(e._near&&e._near.en)) })`));

  console.log('\nmixed      ', await P(reset(`
    spawnEnemy({x:0, z:20,mode:'hold',type:'grunt',fac:0,mark:{}});
    spawnEnemy({x:4, z:20,mode:'hold',type:'grunt',fac:0,mark:{}});
    spawnEnemy({x:8, z:20,mode:'hold',type:'grunt',fac:1,mark:{}});
    spawnEnemy({x:12,z:20,mode:'hold',type:'grunt',friendly:true,mark:{}});`)));
  console.log('  counts   ', await P(`JSON.stringify({ enemies:enemies.length, hostileAlive:_hostileAlive(), want:1 })`));
  console.log('  pending  ', await P(`(()=>{ toSpawn=4; spawnQueue.length=0; spawnQueue.push({},{friendly:true},{},{});
     const a=_hostilePending(); spawnQueue.length=0; toSpawn=0; return JSON.stringify({ pending:a, want:3, note:'queue entries carry no fac at all' }); })()`));

  console.log('\nround trip ', await P(`(()=>{
     const g=buildSpawnMarker({t:[5,5],mode:'patrol',type:'brute',fac:2});
     const d=descFromMarker(g);
     return JSON.stringify({ built:g.userData.mark.fac, col:'0x'+g.userData.post.material.color.getHexString(), desc:d.fac,
       rebuilt:buildSpawnMarker({t:[5,5],fac:d.fac}).userData.mark.fac,
       dflt:buildSpawnMarker({t:[0,0],mode:'hunt'}).userData.mark.fac,
       junk:buildSpawnMarker({t:[0,0],fac:99}).userData.mark.fac,
       neg:buildSpawnMarker({t:[0,0],fac:-4}).userData.mark.fac,
       nan:buildSpawnMarker({t:[0,0],fac:'x'}).userData.mark.fac,
       dfltCol:'0x'+buildSpawnMarker({t:[0,0],mode:'hunt'}).userData.post.material.color.getHexString() }); })()`));

  console.log('\neditor     ', await P(`(()=>{ if(!editorOpen) toggleEditor();
     const g=buildSpawnMarker({t:[3,3],mode:'hunt',fac:0}); scene.add(g); spawnMarkers.push(g);
     editorActive='spawns'; editorTargets.spawns.idx=spawnMarkers.length-1; selSpawns=[g]; renderEditorFields();
     const sels=[...document.querySelectorAll('#editor select')].filter(s=>[...s.options].some(o=>o.textContent.indexOf('Your side')>=0));
     return JSON.stringify({ facSelect:sels.length, value:sels[0]?sels[0].value:null, options:sels[0]?[...sels[0].options].map(o=>o.textContent):[] }); })()`));
}, { settleMs: 2500 });
