// build 1397: a shooting-range target that can report a HIT.
//
// Verified before building: a prop could signal `destroyed`, `interacted` and `contact` and nothing else.
// So a plate could only ever score by being DESTROYED — which is the exact opposite of what builds 1390
// (a target that stays bolted down) and 1391 (a target that comes back) were for.
//
// This drives the WHOLE chain, because pinning the ends proves nothing about the wire (build 1277):
//   a real shot -> damageProp -> the `damaged` signal -> the `emit` verb -> logicEvent -> an `On event`
//   node -> a Math node reading the payload -> a logic variable a HUD widget could show.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    const cands = propModels.filter(p => p && p.userData && !p.userData.runtime && !p.userData.phys);
    const tgt = cands[0];
    tgt.userData._role = 'plate';
    tgt.scale.set(1,1,1); tgt.position.set(0, 1, 32);
    tgt.userData.shootable = true; tgt.userData.breakable = true;
    tgt.userData.maxHp = 60; tgt.userData.hp = 60;
    /* the authoring a creator would do: two signals on the plate, one per event */
    tgt.userData.signals = [
      { when:'damaged',   do:'emit', text:'plateHit' },
      { when:'destroyed', do:'emit', text:'plateDown' },
    ];
    if(typeof refreshPropCollider==='function') refreshPropCollider(tgt);

    /* and the graph a creator would wire: count the hits, and remember how hurt the plate was */
    logicGraph.nodes = [
      { id:'e1', type:'event', x:0, y:0,   p:{ name:'plateHit' } },
      { id:'m1', type:'math',  x:200, y:0, p:{ name:'score', a:'score', op:'+', b:'1' } },
      { id:'m2', type:'math',  x:400, y:0, p:{ name:'lastHpf', a:'#hpf', op:'+', b:'0' } },
      { id:'m3', type:'math',  x:600, y:0, p:{ name:'hitX',    a:'#x',   op:'+', b:'0' } },
      { id:'e2', type:'event', x:0, y:200, p:{ name:'plateDown' } },
      { id:'m4', type:'math',  x:200, y:200,p:{ name:'downs', a:'downs', op:'+', b:'1' } },
    ];
    logicGraph.wires = [
      { a:'e1', o:0, b:'m1', i:'in' }, { a:'m1', o:0, b:'m2', i:'in' }, { a:'m2', o:0, b:'m3', i:'in' },
      { a:'e2', o:0, b:'m4', i:'in' },
    ];
    logicVars = {};
    return { hp: tgt.userData.hp, signals: tgt.userData.signals.length, nodes: logicGraph.nodes.length };
  })()`)));

  const vars = () => P(`(function(){ return { score: logicVars.score||0, downs: logicVars.downs||0,
    lastHpf: logicVars.lastHpf!=null ? +logicVars.lastHpf.toFixed(2) : null,
    hitX: logicVars.hitX!=null ? +logicVars.hitX.toFixed(2) : null,
    hp: (propModels.find(o=>o&&o.userData&&o.userData._role==='plate')||{userData:{}}).userData.hp }; })()`);

  const shoot = (n) => P(`(function(){
    const tgt = propModels.find(o=>o&&o.userData&&o.userData._role==='plate');
    player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
    curWep='rifle'; WEAPONS.rifle.mag = 30;
    for(let i=0;i<${n};i++){ _lgBudget=0; lastShot = 0; shoot(); }
    return 1;
  })()`);

  console.log('\\nfresh          ', JSON.stringify(await vars()));
  await shoot(1);
  console.log('after 1 shot   ', JSON.stringify(await vars()));
  await shoot(2);
  console.log('after 3 shots  ', JSON.stringify(await vars()));
  // the rifle does 15, so shot 4 is the lethal one at hp 0
  await shoot(1);
  console.log('after 4 (lethal)', JSON.stringify(await vars()));

  console.log('\\nreset and shoot again:', JSON.stringify(await P(`(function(){
    const tgt = propModels.find(o=>o&&o.userData&&o.userData._role==='plate');
    _restoreDestroyedProp(tgt);
    player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
    curWep='rifle'; WEAPONS.rifle.mag = 30; _lgBudget=0; lastShot=0; shoot();
    return { hp: tgt.userData.hp, score: logicVars.score, downs: logicVars.downs };
  })()`)));

  // ---- a DYNAMIC prop is the control: the new event must not be target-only ----------------------
  console.log('\\ndynamic control:', JSON.stringify(await P(`(function(){
    const cands = propModels.filter(p => p && p.userData && !p.userData._role && !p.userData.phys && !p.userData.runtime);
    const crate = cands[0];
    if(typeof setPropDynamic==='function') setPropDynamic(crate, true);
    crate.userData.breakable = true; crate.userData.maxHp = 200; crate.userData.hp = 200;
    crate.userData.signals = [{ when:'damaged', do:'emit', text:'plateHit' }];
    const before = logicVars.score||0;
    _lgBudget=0; damageProp(crate, 10, null, null, 0, NET.myId);
    return { scoreBefore: before, scoreAfter: logicVars.score||0, crateHp: crate.userData.hp };
  })()`)));

  // ---- and the payload really is the PROP's, not a leftover ---------------------------------------
  console.log('\\npayload unwinds:', JSON.stringify(await P(`(function(){
    const tgt = propModels.find(o=>o&&o.userData&&o.userData._role==='plate');
    tgt.position.set(17, 1, -25); tgt.userData.hp = 30; tgt.userData.maxHp = 60;
    _lgBudget=0; damageProp(tgt, 6, null, null, 0, NET.myId);
    return { hitX: +logicVars.hitX.toFixed(2), lastHpf: +logicVars.lastHpf.toFixed(2),
             wanted: { hitX: 17, lastHpf: +((30-6)/60).toFixed(2) },
             ctxAfter: (typeof _lgCtx!=='undefined' && _lgCtx && _lgCtx.x!=null) ? 'LEAKED' : 'unwound' };
  })()`)));

  // ---- a prop with no signals costs nothing --------------------------------------------------------
  console.log('\\nno signals:', JSON.stringify(await P(`(function(){
    const tgt = propModels.find(o=>o&&o.userData&&o.userData._role==='plate');
    tgt.userData.signals = [];
    const before = logicVars.score||0;
    _lgBudget=0; damageProp(tgt, 5, null, null, 0, NET.myId);
    return { unchanged: (logicVars.score||0) === before };
  })()`)));
}, { settleMs: 9000 });
