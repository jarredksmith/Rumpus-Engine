// build 1474 — a countdown in the logic graph, driven as a real timed booth.
//
// The Node harness executes the tick. What it cannot show is the thing this build exists for: that a
// creator wires ONE node, binds a HUD timer widget to its variable, and gets a round that ends by itself.
//
// The CONTROL is the same graph with the countdown never started: the widget must read nothing and the
// end-of-round event must never fire.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + '(function(){ return 1; })()');

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    __wavesOff && __wavesOff();
    /* a booth: press start, twenty seconds, the round ends by itself */
    hudWidgets = [{ id:'clock', kind:'timer', label:'', value:'left', anchor:'tc', size:26, modal:'' }];
    logicGraph.nodes = [
      { id:'e1', type:'event', x:0, y:0, p:{ name:'ROUND' } },
      { id:'t1', type:'timer', x:0, y:0, p:{ tmode:'start', tvar:'left', tsec:20, tev:'TIMEUP' } },
      { id:'e2', type:'event', x:0, y:0, p:{ name:'TIMEUP' } },
      { id:'v1', type:'setvar', x:0, y:0, p:{ name:'ended', value:1 } }
    ];
    logicGraph.wires = [{ a:'e1', o:0, b:'t1', i:0 }, { a:'e2', o:0, b:'v1', i:0 }];
    logicStart();
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { gameOn, nodes: logicGraph.nodes.length, widget: _hwEls.length };
  })()`);

  const read = (label) => P(`(function(){
    updateHudWidgets();
    const rec = _hwEls.find(r => r && r.w && r.w.id === 'clock');
    return { label:${JSON.stringify(label)},
      left: logicVars.left == null ? null : +logicVars.left,
      ended: +logicVars.ended || 0,
      hudText: rec && rec.lb ? rec.lb.textContent : null,
      live: Object.keys(_lgCountdowns).length };
  })()`);

  // THE CONTROL FIRST: nothing started, so nothing counts and nothing ends
  await P(`(function(){ __drive(120); return 1; })()`);
  const control = await read('CONTROL — two seconds of frames with no countdown started');

  await P(`(function(){ logicEvent('ROUND'); return 1; })()`);
  const started = await read('the moment it starts');

  await P(`(function(){ __drive(300); return 1; })()`);       // 5 simulated seconds
  const fiveIn = await read('five seconds in');

  // pausing must stop the clock — the correctness a `read time` countdown cannot have
  const whilePaused = await P(`(function(){
    const before = +logicVars.left;
    paused = true;
    for(let i=0;i<600;i++){ try{ updateLogic(1/60); }catch(e){} }   /* the loop would not call it at all */
    paused = false;
    return { before, after: +logicVars.left, note: 'updateLogic called directly; the frame loop skips it entirely while paused' };
  })()`);

  await P(`(function(){ __drive(60*16); return 1; })()`);      // past zero
  const done = await read('after the full twenty seconds');

  await P(`(function(){ __drive(180); return 1; })()`);
  const after = await read('three seconds later — it cannot fire twice or go negative');

  // a deploy clears it
  const redeploy = await P(`(function(){
    logicEvent('ROUND'); __drive(60);
    const armed = { left:+logicVars.left, live:Object.keys(_lgCountdowns).length };
    logicStart();
    return { armed, afterDeploy: { left: logicVars.left == null ? null : +logicVars.left,
                                   live: Object.keys(_lgCountdowns).length } };
  })()`);

  console.log(JSON.stringify({ setup, control, started, fiveIn, whilePaused, done, after, redeploy }, null, 1));
});
