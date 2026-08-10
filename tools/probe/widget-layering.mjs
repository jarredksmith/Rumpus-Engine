// build 1476 — widgets can be restacked, measured on the real DOM.
//
// The Node harness executes the swap. What it cannot say is the thing the build is about: WHICH WIDGET
// COVERS WHICH on screen. `elementFromPoint` at a shared spot answers it directly — and it is also how the
// nastier half shows up, that art over a button hides a control which still works.
//
// The CONTROL is the same two widgets restacked back again: the topmost element must return.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    /* a card face and a buy button at the SAME anchor and offset, so they genuinely overlap */
    hudWidgets = [
      { id:'buy', kind:'button', label:'BUY', anchor:'tc', dy:120, size:16, event:'BUY', modal:'' },
      { id:'art', kind:'image',  label:'',    anchor:'tc', dy:120, iw:220, ih:90, img:'', modal:'' }
    ];
    logicGraph.nodes = [
      { id:'e1', type:'event',  x:0, y:0, p:{ name:'BUY' } },
      { id:'v1', type:'setvar', x:0, y:0, p:{ name:'bought', value:1 } }
    ];
    logicGraph.wires = [{ a:'e1', o:0, b:'v1', i:0 }];
    logicStart();
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { gameOn, widgets: hudWidgets.length, els: _hwEls.length };
  })()`);

  const shot = (label) => P(`(function(){
    const order = hudWidgets.map(w => w.id).join(',');
    const host = document.getElementById('hudWidgets');
    const dom = host ? Array.from(host.children).map(c => c.textContent.trim() || 'img').join(',') : null;
    const rec = _hwEls.find(r => r && r.w && r.w.id === 'buy');
    const art = _hwEls.find(r => r && r.w && r.w.id === 'art');
    const el = rec && rec.el;
    const kids = host ? Array.from(host.children) : [];
    /* PAINT ORDER is the measurand. These are absolutely positioned siblings with no z-index of their own,
       so the later child paints in front — the DOM index IS the layer.
       elementFromPoint is deliberately NOT used: the host is pointer-events:none and only buttons opt in,
       so it would skip the image in every condition and answer "BUY" whatever the stacking. A row that
       reads the same in all three conditions is not evidence, and reporting it as one is how this repo has
       published wrong findings before. */
    logicVars.bought = 0; _hwCd.buy = 0;
    if(el) el.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    return { label:${JSON.stringify(label)}, order, dom,
      paintIndex: { buy: el ? kids.indexOf(el) : -1, art: (art && art.el) ? kids.indexOf(art.el) : -1 },
      artIsInFront: (el && art && art.el) ? kids.indexOf(art.el) > kids.indexOf(el) : null,
      /* the nasty half, and it is the SAME in every condition on purpose: art over a button hides a
         control that still works, which is what makes the layering worth fixing rather than cosmetic */
      buttonStillFires: (+logicVars.bought || 0) === 1 };
  })()`);

  const before = await shot('art added LAST — it paints in front of the button');

  const moved = await P(`(function(){
    const ok = _hwMove(1, -1);          /* send the art one step BACK */
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { ok, order: hudWidgets.map(w => w.id).join(',') };
  })()`);
  const after = await shot('art sent BACK — the button is in front now');

  const backAgain = await P(`(function(){
    _hwMove(0, 1);                       /* and forward again */
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { order: hudWidgets.map(w => w.id).join(',') };
  })()`);
  const control = await shot('art forward again — the control returns');

  const ends = await P(`(function(){
    return { firstBack: _hwMove(0, -1), lastForward: _hwMove(hudWidgets.length-1, 1),
             order: hudWidgets.map(w => w.id).join(','), len: hudWidgets.length };
  })()`);

  console.log(JSON.stringify({ setup, before, moved, after, backAgain, control, ends }, null, 1));
});
