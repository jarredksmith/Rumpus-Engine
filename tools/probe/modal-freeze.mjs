// build 1478 — does a freezing modal actually stop the world while leaving the menu usable?
//
// Two things have to be true at once and they pull against each other, which is why 1468 deferred it: the
// SIMULATION must stop, and the MENU must not. So every row reports both, and the same modal opened WITHOUT
// the freeze is the control in each one.
//
// The clock is real, so "did the world move" is measured as a displacement over a fixed wall-clock window
// rather than a frame count.

import { withGame } from './driver.mjs';

const P = (s) => s;

await withGame(async (probe) => {
  const setup = await probe(P(`(function(){
    hudWidgets.length = 0;
    hudWidgets.push(_sanitizeHudWidgets([{ kind:'button', id:'buy', label:'BUY', anchor:'mr', modal:'shop', event:'bought' }])[0]);
    _hwRev++; updateHudWidgets();
    // a REAL graph, not a stub: On event "bought" -> Set variable bought = 1. Build 1277's rule — pinning
    // the two ends of a wire proves nothing about the wire, and _hwFire fires an EVENT, not a variable.
    logicGraph.nodes = [ { id:'n1', type:'event', x:0, y:0, p:{ name:'bought' } },
                         { id:'n2', type:'setvar', x:200, y:0, p:{ name:'bought', value:'1' } } ];
    logicGraph.wires = [ { a:'n1', o:0, b:'n2', i:0 } ];
    logicStart(); logicVars.bought = 0;
    // one enemy, walking: the world moving is what a freeze has to stop
    const e = spawnEnemy('grunt', 12, 12);
    return { widgets: hudWidgets.length, enemies: enemies.length, gameOn: gameOn };
  })()`));
  console.log('setup   ', JSON.stringify(setup));

  const snap = () => P(`(function(){
    const e = enemies[0];
    return { ex: +(e ? e.mesh.position.x : 0).toFixed(3), ez: +(e ? e.mesh.position.z : 0).toFixed(3),
             frame: _frameNo };
  })()`);

  // run a trial: open the modal (with or without the freeze), wait, and read what moved
  const trial = async (frz) => {
    // reset the variable EVERY trial, or a row inherits the previous one's 1 and cannot tell a working
    // click from a stale value
    await probe(P(`(function(){ logicVars.bought = 0; _modalSet(''); _modalSet('shop', ${frz ? 'true' : 'false'}); return 1; })()`));
    const a = await probe(snap());
    await new Promise(r => setTimeout(r, 2500));
    const b = await probe(snap());
    const post = await probe(P(`(function(){
      const el = _hwEls.find(x => x.w.id === 'buy');
      const before = +logicVars.bought || 0;
      if(el) el.el.click();   // the widget element IS the <button> (build 1255)
      return { open: _modalOpen, freeze: _modalFreeze, backdrop: !!document.getElementById('modalBack'),
               shown: el ? (el.el.style.display !== 'none') : null,
               boughtBefore: before, boughtAfter: +logicVars.bought || 0 };
    })()`));
    const moved = Math.hypot(b.ex - a.ex, b.ez - a.ez);
    return { frames: b.frame - a.frame, enemyMoved: +moved.toFixed(3), ...post };
  };

  const loose = await trial(false);
  console.log('no freeze', JSON.stringify(loose));

  const frozen = await trial(true);
  console.log('FREEZING ', JSON.stringify(frozen));

  await probe(P(`(function(){ _modalSet(''); return 1; })()`));
  const control = await trial(false);
  console.log('control  ', JSON.stringify(control));

  // the way out must not depend on the loop it just stopped
  const out = await probe(P(`(function(){
    _modalSet(''); _modalSet('shop', true);
    const frozen = _modalFreeze;
    document.dispatchEvent(new KeyboardEvent('keydown', { code:'Escape', key:'Escape', bubbles:true }));
    return { wasFrozen: frozen, open: _modalOpen, freeze: _modalFreeze,
             backdrop: !!document.getElementById('modalBack') };
  })()`));
  console.log('escape   ', JSON.stringify(out));

  const deploy = await probe(P(`(function(){
    _modalSet('shop', true);
    const before = _modalFreeze;
    if(typeof resetDynamicProps === 'function') resetDynamicProps();
    logicStart();
    _modalSet('');   // the deploy path's own line
    return { before: before, after: _modalFreeze, open: _modalOpen };
  })()`));
  console.log('deploy   ', JSON.stringify(deploy));
}, { headless: true });
