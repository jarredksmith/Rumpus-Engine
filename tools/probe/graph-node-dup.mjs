// Does the duplicate button exist, land, and produce a node that actually RUNS?
//
// The test drives `_lgDupNode` against a stub graph. This opens the real board, clicks the real button, and
// then FIRES the copy through the real dispatch — because build 1277's rule is that pinning the two ends of
// a wire proves nothing about the wire, and a duplicated node that cannot execute is the failure that
// matters here.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(28) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    if(!editorOpen) toggleEditor();
    return { build: BUILD_VERSION, editorOpen };
  })()`));

  console.log('\n--- author a node, open the board -----------------------------------------------------');
  say('one do node', await P(`(function(){
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    const n = _lgAddNode('do', 120, 140);
    n.p = { verb:'showprop', target:'plate1', amt:'25', who:'enemies', r:'12' };
    _lgOpen();   /* the board opener is named _lgOpen, not openLogicGraph — read the engine's own name */
    _lgRender();
    return { nodes: logicGraph.nodes.length, id: n.id, params: Object.keys(n.p).length };
  })()`));

  console.log('\n--- the button is on the header and CLICKS --------------------------------------------');
  say('click it', await P(`(function(){
    const el = _lgBoard.querySelector('[data-node="' + logicGraph.nodes[0].id + '"]');
    if(!el) return { err: 'node not rendered' };
    const spans = Array.from(el.querySelectorAll('span'));
    const dup = spans.find(s => s.title && /Duplicate/.test(s.title));
    if(!dup) return { err: 'no duplicate control', titles: spans.map(s => s.title).filter(Boolean) };
    const r = dup.getBoundingClientRect();
    const before = logicGraph.nodes.length;
    dup.onclick({ stopPropagation(){} });
    return { onScreen: r.width > 0 && r.height > 0, title: dup.title, glyph: dup.textContent,
             nodesBefore: before, nodesAfter: logicGraph.nodes.length };
  })()`));

  say('the copy', await P(`(function(){
    const a = logicGraph.nodes[0], b = logicGraph.nodes[1];
    return { distinctIds: a.id !== b.id, sameType: a.type === b.type,
             offset: [b.x - a.x, b.y - a.y],
             paramsMatch: JSON.stringify(a.p) === JSON.stringify(b.p),
             separateObjects: a.p !== b.p,
             renderedOnBoard: !!_lgBoard.querySelector('[data-node="' + b.id + '"]') };
  })()`));

  console.log('\n--- editing the copy must not edit the original ---------------------------------------');
  say('change one', await P(`(function(){
    const a = logicGraph.nodes[0], b = logicGraph.nodes[1];
    b.p.target = 'plate2';
    return { original: a.p.target, copy: b.p.target, independent: a.p.target !== b.p.target };
  })()`));

  console.log('\n--- and the COPY actually runs (build 1277: drive the wire, not its ends) --------------');
  say('fire both', await P(`(function(){
    /* wire an event into each, and point them at two real tagged props — then pulse the event and read the
       world, which is the only thing that proves a duplicated node is a working node */
    for(let i=propModels.length-1;i>=0;i--) if(propModels[i] && propModels[i].userData.__probeFix) removeProp(i);
    spawnProp('box', [30, 0, 30, 0, 0, 0, 1, 1, 1]);
    const p1 = propModels[propModels.length-1]; p1.userData.__probeFix = 1; p1.userData.tag = 'plate1';
    spawnProp('box', [34, 0, 30, 0, 0, 0, 1, 1, 1]);
    const p2 = propModels[propModels.length-1]; p2.userData.__probeFix = 1; p2.userData.tag = 'plate2';
    p1.visible = false; p2.visible = false;

    const a = logicGraph.nodes[0], b = logicGraph.nodes[1];
    a.p = { verb:'showprop', target:'plate1' };
    b.p = { verb:'showprop', target:'plate2' };
    const ev = _lgAddNode('event', 0, 0); ev.p = { name:'DUPTEST' };
    _lgAddWire(ev.id, 0, a.id, 0);
    _lgAddWire(ev.id, 0, b.id, 0);

    logicEvent('DUPTEST');
    return { originalShown: p1.visible, copyShown: p2.visible,
             note: 'the COPY has to move the world, not just exist in the graph' };
  })()`));

  console.log('\n--- it survives the file --------------------------------------------------------------');
  say('round trip', await P(`(function(){
    const json = JSON.stringify(serializeLevel());
    const n0 = logicGraph.nodes.length;
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    restoreLevel(JSON.parse(json));
    const targets = logicGraph.nodes.filter(n => n.type === 'do').map(n => n.p.target);
    return { before: n0, after: logicGraph.nodes.length, doTargets: targets };
  })()`));

  say('cleanup', await P(`(function(){
    let n=0; for(let i=propModels.length-1;i>=0;i--) if(propModels[i]&&propModels[i].userData.__probeFix){ removeProp(i); n++; }
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    return { removed: n };
  })()`));
}, { settleMs: 6000 });

console.log('');
