// build 1328 — reported: "If signals are created for a prop in the editor panel, make it show as nodes in
// the signal node modal."
//
// Two authoring systems that had never met: a SIGNAL is {when,do,target} on a prop; the GRAPH is nodes and
// wires. Open the graph on a level wired entirely with signals and it says "no nodes yet" — false.
//
// This drives the REAL board: builds props with real signals, opens the real modal, reads the real DOM.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('open editor:', JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor(); return { editorOpen }; })()`)));
  await page.waitForTimeout(800);

  console.log('\n--- BEFORE: a level wired only with signals, opened in the graph ---');
  console.log(JSON.stringify(await P(`(function(){
    logicGraph.nodes = []; logicGraph.wires = [];
    /* three props, five signals between them */
    const made = [];
    for(let i=0;i<3;i++) spawnProp('box', [i*4, 0, 0, 0,0,0, 1,1,1], (o)=>{ made.push(o); });
    made[0].userData.name = 'vault door';
    made[0].userData.signals = [ { when:'interacted', do:'unlock', target:'vault' },
                                 { when:'destroyed',  do:'win' } ];
    made[1].userData.name = 'pressure plate';
    made[1].userData.signals = [ { when:'contact', do:'open', target:'gate' } ];
    made[2].userData.tag = 'barrel';
    made[2].userData.signals = [ { when:'destroyed', do:'toggle', target:'lights' },
                                 { when:'destroyed', do:'cutscene', target:'intro' } ];
    return { props: made.length, graphNodes: logicGraph.nodes.length,
             signalsInTheLevel: _lgSigMirror().length };
  })()`)));

  console.log('\n--- THE BOARD ---');
  console.log(JSON.stringify(await P(`(function(){ _lgOpen(); return { open: !!document.getElementById('lgBoard') }; })()`)));
  await page.waitForTimeout(500);
  console.log(JSON.stringify(await P(`(function(){
    const cards = [...document.querySelectorAll('#lgBoard [data-signode]')];
    return { realNodes: document.querySelectorAll('#lgBoard [data-node]').length,
             mirroredSignalCards: cards.length,
             text: cards.map(c=>c.textContent.replace(/\\s+/g,' ').trim().slice(0,54)) };
  })()`), null, 1));

  console.log('\n--- THEY ARE A VIEW, NOT GRAPH NODES ---');
  console.log(JSON.stringify(await P(`(function(){
    const lvl = serializeLevel();
    return { graphStillEmpty: logicGraph.nodes.length,
             serializedGraphNodes: ((lvl.logic&&lvl.logic.nodes)||[]).length,
             notInTheNodeSelector: document.querySelectorAll('#lgBoard [data-node]').length,
             tracePaintCannotSeeThem: !String(_lgTracePaint).includes('data-signode') };
  })()`)));

  console.log('\n--- THE COLUMN SITS CLEAR OF THE GRAPH ---');
  console.log(JSON.stringify(await P(`(function(){
    logicGraph.nodes = [ { id:'n1', type:'setvar', x:400, y:100, p:{} },
                         { id:'n2', type:'addvar', x:900, y:220, p:{} } ];
    _lgRender();
    const cards = [...document.querySelectorAll('#lgBoard [data-signode]')];
    const xs = cards.map(c=>parseInt(c.style.left,10));
    const nodeXs = logicGraph.nodes.map(n=>n.x);
    return { columnX: xs[0], leftmostRealNode: Math.min(...nodeXs),
             clearOfTheGraph: xs.every(x=>x < Math.min(...nodeXs)),
             stacked: cards.map(c=>parseInt(c.style.top,10)) };
  })()`)));

  console.log('\n--- CLICKING ONE GOES TO THE PROP ---');
  console.log(JSON.stringify(await P(`(function(){
    selProps = [];
    const card = document.querySelector('#lgBoard [data-signode]');
    card.click();
    return { boardClosed: document.getElementById('lgModal').style.display === 'none',
             selected: selProps.length,
             selectedName: selProps[0] ? selProps[0].userData.name : null,
             mode: editorMode, target: editorActive };
  })()`)));

  console.log('\n--- CAPS AND EMPTY CASES ---');
  console.log(JSON.stringify(await P(`(function(){
    /* the first run of this probe deleted signals from propModels.slice(0,3) -- the STOCK level's first
       three props, which never had any. Remove them from the props that actually carry them. */
    const before = _lgSigMirror().length;
    for(const o of propModels.filter(Boolean)) if(Array.isArray(o.userData.signals)) delete o.userData.signals;
    const after = _lgSigMirror().length;
    _lgOpen(); _lgRender();
    const none = document.querySelectorAll('#lgBoard [data-signode]').length;
    /* and a level with far too many */
    const o = propModels.filter(Boolean)[0];
    o.userData.signals = []; for(let i=0;i<400;i++) o.userData.signals.push({ when:'destroyed', do:'toggle', target:'t'+i });
    const capped = _lgSigMirror().length;
    delete o.userData.signals;
    return { before, afterRemoving: after, cardsWhenNone: none, cappedAt: capped };
  })()`)));
}, { settleMs: 9000 });
