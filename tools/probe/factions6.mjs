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

  // an ALLY's bolt at a hostile — with a real frame between, so the target list is fresh
  console.log('both       ', await P(reset(`
    spawnEnemy({x:0,z:6,  mode:'hold',type:'gunner',fac:0,mark:{}});
    spawnEnemy({x:0,z:9,  mode:'hold',type:'gunner',fac:1,mark:{}});`)));
  await P(frames(2));
  console.log('ally fires ', await P(`(()=>{ const tgt=_combatTargets().find(t=>t.en===enemies[1]);
     enemyShots.length=0; fireEnemyShot(enemies[0], tgt, 0);
     for(let i=0;i<300 && enemyShots.length;i++) updateEnemyShots(1/120);
     return JSON.stringify({ allyHp:Math.round(enemies[0].hp), hostileHp:Math.round(enemies[1].hp), playerHp:Math.round(player.hp) }); })()`));

  // the wave-clear accounting: allies must not hold a wave open
  console.log('\nmixed      ', await P(reset(`
    spawnEnemy({x:0,z:20,mode:'hold',type:'grunt',fac:0,mark:{}});
    spawnEnemy({x:4,z:20,mode:'hold',type:'grunt',fac:0,mark:{}});
    spawnEnemy({x:8,z:20,mode:'hold',type:'grunt',fac:1,mark:{}});
    spawnEnemy({x:12,z:20,mode:'hold',type:'grunt',fac:1,friendly:true,mark:{}});`)));
  console.log('counts     ', await P(`JSON.stringify({ enemies:enemies.length, hostileAlive:_hostileAlive(), note:'2 allies + 1 hostile + 1 pacifist' })`));
  await P(`(()=>{ for(const e of enemies) if(e.faction===1 && !e.friendly) e.hp=0; return 'x'; })()`);
  console.log('kill the 1 ', await P(`JSON.stringify({ hostileAlive:_hostileAlive(), stillInList:enemies.length })`));

  // serialization round trip through the real marker + serializer
  console.log('\nround trip ', await P(`(()=>{
     const g = buildSpawnMarker({ t:[5,5], mode:'patrol', type:'brute', fac:2 });
     const before = JSON.stringify({ fac:g.userData.mark.fac, col:'0x'+g.userData.post.material.color.getHexString() });
     const d = descFromMarker(g);
     const g2 = buildSpawnMarker({ t:[5,5], mode:'patrol', type:'brute', fac:d.fac });
     const dflt = buildSpawnMarker({ t:[0,0], mode:'hunt' });
     return before + ' -> desc fac ' + d.fac + ' -> rebuilt ' + g2.userData.mark.fac
        + ' | default marker fac ' + dflt.userData.mark.fac
        + ' | junk fac -> ' + buildSpawnMarker({ t:[0,0], fac:99 }).userData.mark.fac
        + ' | negative -> ' + buildSpawnMarker({ t:[0,0], fac:-4 }).userData.mark.fac; })()`));

  // the editor control exists and only for non-pacifists
  console.log('\neditor     ', await P(`(()=>{ if(!editorOpen) toggleEditor();
     const g = buildSpawnMarker({ t:[3,3], mode:'hunt', fac:0 }); scene.add(g); spawnMarkers.push(g);
     editorActive='spawns'; editorTargets.spawns.idx = spawnMarkers.length-1; selSpawns=[g]; renderEditorFields();
     const sels=[...document.querySelectorAll('#editor select')].filter(s=>[...s.options].some(o=>o.textContent.indexOf('Your side')>=0));
     const hints=[...document.querySelectorAll('#editor .hint')].map(h=>h.textContent).filter(t=>t.indexOf('never you')>=0);
     return JSON.stringify({ facSelect:sels.length, value:sels[0]?sels[0].value:null,
        options:sels[0]?[...sels[0].options].map(o=>o.textContent):[], allyHint:hints.length }); })()`));
}, { settleMs: 2500 });
