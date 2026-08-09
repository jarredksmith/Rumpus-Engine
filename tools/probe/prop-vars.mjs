// build 1461 — per-prop variables, driven through the REAL chain in the running game.
//
// Build 1277's rule: a test that pins the two ends of a wire proves nothing about the wire. So this
// fires a real prop SIGNAL (`damaged` -> `emit`) on one of eight props sharing one tag, and lets the
// real logic graph do the rest: On event -> Do setpropvar #self -> Read propvar #self.
//
// The CONTROL is the other seven doors: a build where `#self` resolved to the tag would move all eight,
// and a build where the context did not survive the `emit` would move none.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    /* eight doors, ONE tag */
    const before = propModels.length;
    for(let i = 0; i < 8; i++) spawnProp('box', [200 + i * 4, 0, 200, 1, 1, 1, 0, 0, 0]);
    const doors = propModels.slice(before);
    for(const d of doors){ d.userData.tag = 'door'; d.userData.hp = 100; d.userData.maxHp = 100; }
    /* each door reports its own hit into the graph */
    for(const d of doors) d.userData.signals = [{ when:'damaged', do:'emit', text:'DOORHIT' }];
    /* the graph: On event -> setpropvar #self +1 -> read it back into a global so we can see it */
    logicGraph.nodes = [
      { id:'e1', type:'event',  x:0, y:0, p:{ name:'DOORHIT' } },
      { id:'d1', type:'do',     x:0, y:0, p:{ verb:'setpropvar', target:'#self', pvn:'hits', pvv:1, pvop:'add' } },
      { id:'r1', type:'read',   x:0, y:0, p:{ stat:'propvar', item:'#self', pvn:'hits', name:'lastHits' } },
    ];
    logicGraph.wires = [ { a:'e1', o:0, b:'d1', i:0 }, { a:'d1', o:0, b:'r1', i:0 } ];
    logicStart();
    return { doors: doors.length, tag: doors[0].userData.tag };
  })()`);

  const hit = async (i, n) => P(`(function(){
    const doors = propModels.filter(o => o && o.userData && o.userData.tag === 'door');
    for(let k = 0; k < ${n}; k++) _lgPropEvent(doors[${i}], 'damaged', _propCtx(doors[${i}]));
    return doors.map(o => (o.userData._lv && o.userData._lv.hits) || 0);
  })()`);

  const base = await P(`(function(){
    const doors = propModels.filter(o => o && o.userData && o.userData.tag === 'door');
    return doors.map(o => (o.userData._lv && o.userData._lv.hits) || 0);
  })()`);

  const a = await hit(3, 3);
  const b = await hit(6, 1);

  const read = await P(`(function(){ return { lastHits: logicVars.lastHits }; })()`);

  const tagWrite = await P(`(function(){
    _applyWorldAction({ do:'setpropvar', target:'door', pvn:'hits', pvv:0, pvop:'set' });
    const doors = propModels.filter(o => o && o.userData && o.userData.tag === 'door');
    return doors.map(o => (o.userData._lv && o.userData._lv.hits) || 0);
  })()`);

  const restart = await P(`(function(){
    const doors = propModels.filter(o => o && o.userData && o.userData.tag === 'door');
    _lgPropEvent(doors[2], 'damaged', _propCtx(doors[2]));
    const mid = doors.map(o => (o.userData._lv && o.userData._lv.hits) || 0);
    logicStart();
    const after = doors.map(o => (o.userData._lv && o.userData._lv.hits) || 0);
    const residue = doors.map(o => ('_lv' in o.userData) ? 1 : 0).reduce((s,v)=>s+v,0);
    return { mid, after, residue };
  })()`);

  const reports = await P(`(function(){
    if(typeof _logicFailures !== 'undefined') _logicFailures.length = 0;
    _lgCtx = {};
    _applyWorldAction({ do:'setpropvar', target:'#self', pvn:'hits', pvv:1 });   /* no event */
    _applyWorldAction({ do:'setpropvar', target:'nope',  pvn:'hits', pvv:1 });   /* no such tag */
    const msgs = (typeof levelIssues === 'function' ? levelIssues() : []).filter(m => /setpropvar/.test(m));
    return { n: msgs.length, msgs };
  })()`);

  const serial = await P(`(function(){
    const doors = propModels.filter(o => o && o.userData && o.userData.tag === 'door');
    _lgPropVarSet(doors[0], 'hits', 42);
    const j = serializeLevel();
    const s = JSON.stringify(j);
    return { hasLv: /_lv/.test(s), has42: /"hits":42/.test(s), props: j.props.length };
  })()`);

  console.log(JSON.stringify({ setup, base, afterDoor3: a, afterDoor6: b, read, tagWrite, restart, reports, serial }, null, 1));
});
