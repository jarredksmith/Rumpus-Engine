// build 1468 — creator-authored modals, driven end to end in the live game.
//
// A modal is a NAMED GROUP of HUD widgets. The claim to measure is not "does _modalSet set a variable" —
// the Node harness executes that. It is whether a creator's authored menu actually appears over the world,
// with the mouse freed and the world no longer taking clicks, and then goes away again.
//
// The CONTROL is an ordinary HUD widget standing beside the modal's, in every single condition: if the
// modal's widgets appear and the ordinary one also changes, the measurement is the rebuild and not the gate.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    /* a shop: two widgets in the modal, one ordinary HUD widget beside them as the control.
       The button field is named event, not ev — _hwFire reads w.event. (No backticks in page code:
       sixteenth sighting of a comment closing the template literal it lives inside.) */
    hudWidgets = [
      { id:'hudScore', kind:'text',   x:0, y:0, label:'SCORE {score}', anchor:'tl', size:16, modal:'' },
      { id:'shopTtl',  kind:'text',   x:0, y:0, label:'THE SHOP',      anchor:'tc', size:24, modal:'shop' },
      { id:'shopBuy',  kind:'button', x:0, y:0, label:'BUY TURRET',    anchor:'tc', dy:60, size:16, modal:'shop', event:'BUY' },
      { id:'soldOut',  kind:'text',   x:0, y:0, label:'SOLD OUT',      anchor:'tc', dy:120, size:16, modal:'shop', when:'sold' }
    ];
    logicGraph.nodes = [
      { id:'e1', type:'event',  x:0, y:0, p:{ name:'OPEN' } },
      { id:'d1', type:'do',     x:0, y:0, p:{ verb:'modal', mmode:'show', mid:'shop' } },
      { id:'e2', type:'event',  x:0, y:0, p:{ name:'BUY' } },
      { id:'v1', type:'setvar', x:0, y:0, p:{ name:'bought', value:1 } },
      { id:'e3', type:'event',  x:0, y:0, p:{ name:'SHUT' } },
      { id:'d2', type:'do',     x:0, y:0, p:{ verb:'modal', mmode:'hide' } }
    ];
    logicGraph.wires = [
      { a:'e1', o:0, b:'d1', i:0 },
      { a:'e2', o:0, b:'v1', i:0 },
      { a:'e3', o:0, b:'d2', i:0 }
    ];
    logicStart();
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { gameOn, widgets: hudWidgets.length, els: _hwEls.length,
             members: _modalWidgets('shop'), open: _modalOpen };
  })()`);

  // the whole visible state of the interface, in one shot — the control travels in every row
  const shot = (label) => P(`(function(){
    const byId = {};
    for(const r of _hwEls){ if(r && r.el) byId[r.w.id] = { vis: r.el.style.display !== 'none', txt: r.el.textContent }; }
    const back = document.getElementById('modalBack');
    const host = document.getElementById('hudWidgets');
    return { label:${JSON.stringify(label)},
      open: _modalOpen,
      widgets: byId,
      backdrop: !!back,
      backZ: back ? +getComputedStyle(back).zIndex : null,
      hostZ: host ? +getComputedStyle(host).zIndex : null,
      backPointer: back ? getComputedStyle(back).pointerEvents : null,
      cursorFree: _hwCursorFree,
      firing: !!firing };
  })()`);

  const fire = (ev) => P(`(function(){ logicEvent(${JSON.stringify(ev)}); updateHudWidgets(); return _modalOpen; })()`);

  const before  = await shot('before — nothing open');
  await fire('OPEN');
  const open    = await shot('after OPEN');

  // the second gate still runs INSIDE the modal
  await P(`(function(){ logicVars.sold = 1; updateHudWidgets(); return 1; })()`);
  const sold    = await shot('modal open, "sold" set');

  // the world must not take the click that opens the menu, nor any click while it is up
  const clickGate = await P(`(function(){
    const out = {};
    const send = () => { firing = false;
      dispatchEvent(new MouseEvent('mousedown', { bubbles:true, button:0, clientX:innerWidth/2, clientY:innerHeight/2 }));
      return !!firing; };
    out.withModalOpen = send();
    _modalSet(''); updateHudWidgets();
    out.withModalClosed = send();          /* the CONTROL: the same click, same place, modal shut */
    firing = false; firingLatch = false;
    _modalSet('shop'); updateHudWidgets();
    return out;
  })()`);

  // a held trigger is dropped the moment a menu opens over it
  const heldTrigger = await P(`(function(){
    _modalSet(''); updateHudWidgets();
    firing = true; firingLatch = true;
    const held = { before: firing };
    _modalSet('shop'); updateHudWidgets();
    held.after = firing; held.latch = firingLatch;
    return held;
  })()`);

  // a button inside a modal still fires its logic event
  const buy = await P(`(function(){
    logicVars.bought = 0; _hwCd.shopBuy = 0;
    const rec = _hwEls.find(r => r && r.w && r.w.id === 'shopBuy');
    if(!rec || !rec.el) return { found:false };
    rec.el.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    return { found:true, bought: +logicVars.bought || 0 };
  })()`);

  await fire('SHUT');
  const shut    = await shot('after SHUT — the control returns');

  // the refusals: a modal that opens onto nothing would be a dimmed screen the player cannot dismiss
  const refuse = await P(`(function(){
    const out = {};
    const n0 = (typeof logicFailures !== 'undefined' && logicFailures) ? logicFailures.length : 0;
    _applyWorldAction({ do:'modal', mmode:'show', mid:'' });
    out.blankName = { open:_modalOpen };
    _applyWorldAction({ do:'modal', mmode:'show', mid:'nosuchmodal' });
    out.badName = { open:_modalOpen };
    _applyWorldAction({ do:'modal', mmode:'show', mid:'shop' });   /* the CONTROL: a real one still opens */
    out.realName = { open:_modalOpen };
    _applyWorldAction({ do:'modal', mmode:'hide' });
    out.afterHide = { open:_modalOpen };
    const issues = (typeof levelIssues === 'function') ? levelIssues() : [];
    out.reported = issues.filter(t => /modal/i.test(String(t && (t.msg || t)))).length;
    return out;
  })()`);

  // a deploy is a fresh run: no modal survives it
  const deploy = await P(`(function(){
    _modalSet('shop'); updateHudWidgets();
    const held = _modalOpen;
    logicStart(); updateHudWidgets();
    return { beforeDeploy: held, afterDeploy: _modalOpen, backdrop: !!document.getElementById('modalBack') };
  })()`);

  console.log(JSON.stringify({ setup, before, open, sold, clickGate, heldTrigger, buy, shut, refuse, deploy }, null, 1));
});
