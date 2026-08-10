// build 1475 — a timer widget can read a race, measured on the real HUD element.
//
// The Node harness executes the formatter. What it cannot show is the thing a creator sees: the same
// countdown, the same variable, rendered four ways on the actual widget — and that a speedrun course
// finally reads its own time instead of a whole second ahead of it.
//
// The CONTROL is `mmss` at both ends: it must print exactly what build 1474 printed.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    hudWidgets = [{ id:'clock', kind:'timer', label:'', value:'run', anchor:'tc', size:26, modal:'' }];
    logicVars.run = 0;
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { gameOn, widgets: _hwEls.length };
  })()`);

  const readAll = (v) => P(`(function(){
    logicVars.run = ${v};
    const out = {};
    for(const f of ['mmss','sec','sec1','sec2']){
      hudWidgets[0].tfmt = f;
      _hwRev++; _hwRebuild(); updateHudWidgets();
      const rec = _hwEls.find(r => r && r.w && r.w.id === 'clock');
      out[f] = rec && rec.lb ? rec.lb.textContent : null;
    }
    return { value:${v}, shown: out };
  })()`);

  const runs = [];
  for (const v of [12.34, 12.99, 0.999, 65.43, 20, 0]) runs.push(await readAll(v));

  // ...and a real countdown, read at hundredths as it falls
  const race = await P(`(function(){
    hudWidgets[0].tfmt = 'sec2'; _hwRev++; _hwRebuild();
    logicGraph.nodes = [
      { id:'e1', type:'event', x:0, y:0, p:{ name:'GO' } },
      { id:'t1', type:'timer', x:0, y:0, p:{ tmode:'start', tvar:'run', tsec:3, tev:'DONE' } },
      { id:'e2', type:'event', x:0, y:0, p:{ name:'DONE' } },
      { id:'v1', type:'setvar', x:0, y:0, p:{ name:'fin', value:1 } }
    ];
    logicGraph.wires = [{ a:'e1', o:0, b:'t1', i:0 }, { a:'e2', o:0, b:'v1', i:0 }];
    logicStart();
    logicEvent('GO');
    const seen = [];
    const rec = () => { updateHudWidgets();
      const r = _hwEls.find(x => x && x.w && x.w.id === 'clock');
      seen.push([Math.round((+logicVars.run||0)*1000)/1000, r && r.lb ? r.lb.textContent : null]); };
    rec();
    for(let i=0;i<40;i++){ updateLogic(1/60); }   rec();
    for(let i=0;i<60;i++){ updateLogic(1/60); }   rec();
    for(let i=0;i<200;i++){ updateLogic(1/60); }  rec();
    return { seen, fin: +logicVars.fin || 0,
             neverAhead: seen.every(([v, t]) => t === null || parseFloat(t) <= v + 1e-9) };
  })()`);

  console.log(JSON.stringify({ setup, runs, race }, null, 1));
});
