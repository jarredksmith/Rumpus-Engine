// build 1501 — the reported repro, driven for real: untick "follows the player" in the graph board.
//
// "No matter what, I'm not able to untick this toggle." The old onchange deleted the key and the
// re-render redrew the default (checked), so the box snapped back under the cursor. The rows below
// click the REAL checkbox in the REAL board and read what survives — including a full save/load.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(60); return 1; })()`);

  /* the report: a Do node set to Camera view / fixed — untick the box with a real DOM click */
  const r1 = await P(`(function(){
    if(!editorOpen) toggleEditor();
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    logicGraph.nodes.push({ id:'n1', type:'do', x:120, y:120, p:{ verb:'view', vmode:'fixed', vtag:'cam1' } });
    _lgOpen(); _lgRender();
    const el = _lgBoard.querySelector('[data-node="n1"]');
    const boxes = el ? el.querySelectorAll('input[type=checkbox]') : [];
    const box = boxes[0] || null;
    if(!box) return { err:'no checkbox rendered', n: boxes.length };
    const before = box.checked;
    box.click();                                   // the real gesture
    const after = _lgBoard.querySelector('[data-node="n1"] input[type=checkbox]');   // _lgRender rebuilt it
    return { before, afterChecked: after ? after.checked : 'gone', stored: logicGraph.nodes[0].p.vtrack };
  })()`);
  console.log('untick   ', JSON.stringify(r1), ' <- was: snapped back checked, stored nothing');

  /* it survives the level file — the other half the old shape lost on every save */
  const r2 = await P(`(function(){
    const lv = serializeLevel();
    const node = (lv.logic && lv.logic.nodes || []).find(n=>n.id==='n1');
    restoreLevel(JSON.parse(JSON.stringify(lv)));
    const back = logicGraph.nodes.find(n=>n.id==='n1');
    return { serialized: node ? node.p.vtrack : 'lost', restored: back ? back.p.vtrack : 'lost' };
  })()`);
  console.log('reloaded ', JSON.stringify(r2), ' <- the 0 survives serialize + restore');

  /* ticking it back deletes the key — absent means default, so old files stay byte-identical */
  const r3 = await P(`(function(){
    _lgOpen(); _lgRender();
    const box = _lgBoard.querySelector('[data-node="n1"] input[type=checkbox]');
    box.click();
    const after = _lgBoard.querySelector('[data-node="n1"] input[type=checkbox]');
    const n = logicGraph.nodes.find(x=>x.id==='n1');
    return { afterChecked: after.checked, keyPresent: ('vtrack' in n.p) };
  })()`);
  console.log('retick   ', JSON.stringify(r3), ' <- checked again, stored as ABSENT (the default)');

  /* the SIGNAL road: an authored 0 survives the pack that used to drop it */
  const r4 = await P(`(function(){
    const packed = _sigPack({ when:'used', do:'view', vmode:'fixed', vtag:'cam1', vtrack:0 });
    const back = _sigUnpack(packed);
    return { vk: packed.vk, roundTrip: back.vtrack, control: ('vk' in _sigPack({ do:'view', vmode:'fixed' })) };
  })()`);
  console.log('signal   ', JSON.stringify(r4), ' <- vk:0 on the wire; unset still absent (control)');

  await P(`(function(){ logicGraph.nodes.length=0; if(typeof _lgClose==='function') _lgClose(); toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
