// Can the logic graph act on a COMPUTED name?
//
// A shooting gallery is N plates that pop up one at a time in a random order. Every piece exists: `showprop`
// / `hideprop` / `resetprop` by tag, a random draw via Set variable's min/max, `damaged` events (1397) to
// score with. What is missing is the join between them — the tag field takes a LITERAL, so "show plate<n>"
// cannot be said, and eight plates need eight hand-wired branches.
//
// `{var}` interpolation exists in exactly ONE place: the toast node's text. This measures whether it reaches
// anything that names a thing in the world, with a hardcoded tag as the positive control — before believing
// a null, prove the instrument can produce a positive (build 1316).
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  await P(`(function(){
    paused = false; gameOn = true;
    window.__plates = [];
    for(let i=1;i<=3;i++){
      let o=null; spawnProp('box',[i*4, 0, -8, 0,0,0, 1.5,1.5,0.4],(b)=>{o=b;});
      o.userData.tag = 'plate'+i; o.userData.shootable = true;
      o.userData.hp = 30; o.userData.maxHp = 30; o.userData.breakable = true;
      __plates.push(o);
    }
    window.__state = () => __plates.map(p=>({ tag:p.userData.tag, visible:p.visible }));
    /* Re-show through the REAL verb. show/hide track their own state (build 1170: a hidden prop also loses
       its collider and its body), so hand-poking the visible flag desyncs it and the next hide early-returns
       — which reads exactly like the feature not working. */
    window.__showAll = () => { for(const p of __plates) _lgPropVerb('show', p.userData.tag, ''); };
    window.__hideAll = () => { for(const p of __plates) _lgPropVerb('hide', p.userData.tag, ''); };
    window.__fire = (node) => {
      logicGraph.nodes = [ { id:'ev', type:'event', x:0, y:0, p:{ name:'GO' } },
                           Object.assign({ id:'n1', x:100, y:0 }, node) ];
      logicGraph.wires = [ { a:'ev', o:0, b:'n1', i:'in' } ];
      _lgFireEvents('event','GO');   /* the real event router — pulsing the node by hand is not the same wire */
    };
    return 'rig ready';
  })()`);

  console.log('three plates, all visible:', JSON.stringify(await P(`__state()`)));

  console.log('\nCONTROL — a literal tag (this has always worked):');
  console.log('  ', JSON.stringify(await P(`(function(){
    __showAll();
    __fire({ type:'do', p:{ verb:'hideprop', target:'plate2' } });
    return __state();
  })()`)));

  console.log('\nEFFECT — a COMPUTED tag, which is what a gallery needs:');
  console.log('  ', JSON.stringify(await P(`(function(){
    __showAll();
    logicVars = { n: 2 };
    __fire({ type:'do', p:{ verb:'hideprop', target:'plate{n}' } });
    return { plates: __state(), reported: (typeof logicFailures!=='undefined' && logicFailures) ? JSON.stringify(logicFailures).slice(0,200) : null };
  })()`)));

  console.log('\nthe PLACE field, same question (spawn/teleport at a computed mark):');
  console.log('  ', JSON.stringify(await P(`(function(){
    let mark=null; spawnProp('box',[60,0,60,0,0,0,1,1,1],(b)=>{mark=b;}); mark.userData.tag='mark7';
    logicVars = { k: 7 };
    const lit = _lgPlaceAt('mark7');
    const comp = _lgPlaceAt('mark{k}');
    return { literal: lit && {x:Math.round(lit.x), z:Math.round(lit.z)}, computed: comp };
  })()`)));

  console.log('\nthe whole gallery loop, authored with FOUR nodes instead of one branch per plate:');
  console.log('  ', JSON.stringify(await P(`(function(){
    /* draw a plate at random -> pop it up -> the shot scores -> the next draw. The nodes never name a
       plate; they name plate{n}, and n is a number the graph rolled. */
    __hideAll();
    logicGraph.nodes = [
      { id:'ev',   type:'event', x:0,   y:0, p:{ name:'NEXT' } },
      { id:'roll', type:'setvar', x:100, y:0, p:{ name:'n', rand:1, min:1, max:3 } },   /* the real param is rand, not mode */
      { id:'pop',  type:'do',     x:200, y:0, p:{ verb:'showprop', target:'plate{n}' } },
    ];
    logicGraph.wires = [ { a:'ev', o:0, b:'roll', i:'in' }, { a:'roll', o:0, b:'pop', i:'in' } ];
    const drew = {};
    for(let i=0;i<24;i++){
      __hideAll();
      _lgFireEvents('event','NEXT');
      const up = __plates.filter(p=>p.visible).map(p=>p.userData.tag);
      if(up.length === 1) drew[up[0]] = (drew[up[0]]||0) + 1; else drew['BAD:'+up.length] = (drew['BAD:'+up.length]||0)+1;
    }
    return { over24Draws: drew, distinctPlatesHit: Object.keys(drew).filter(k=>k.indexOf('BAD')<0).length };
  })()`)));

  console.log('\nand a computed tag that resolves to NOTHING is reported by its real name (build 1214):');
  console.log('  ', JSON.stringify(await P(`(function(){
    const before = (logicFailures && logicFailures.size) || 0;
    logicVars = { n: 99 };
    __fire({ type:'do', p:{ verb:'hideprop', target:'plate{n}' } });
    const msgs = [];
    if(logicFailures && logicFailures.forEach) logicFailures.forEach((v,k)=>msgs.push(String(k)));
    return { reported: msgs.filter(m=>m.indexOf('plate')>=0).slice(-1) };
  })()`)));

  console.log('\nwhere {var} interpolation DOES reach today:');
  console.log('  ', JSON.stringify(await P(`(function(){
    logicVars = { score: 42 };
    let seen = null; const real = flashToast; flashToast = (m)=>{ seen = m; };
    try { __fire({ type:'toast', p:{ text:'Score {score}' } }); } finally { flashToast = real; }
    return { toast: seen };
  })()`)));
}, { settleMs: 9000 });
