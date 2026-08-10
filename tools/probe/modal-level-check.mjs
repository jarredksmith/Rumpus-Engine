// build 1472 — the Level Check knows about modals, and the panel really renders it.
//
// The Node harness executes the check. What it cannot say is whether a creator SEES the row: build 1423's
// own first draft wrote markup into a text node, and the gap between "levelIssues returned the right string"
// and "the panel shows it" is exactly where that lived. So this opens the real editor, switches to the tab
// that builds the panel, and reads the rendered rows.
//
// The CONTROL is the same level with the modal wired up, in the same session.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const rows = () => P(`(function(){
    if(typeof renderLevelIssues==='function') renderLevelIssues();
    const host = editorEl && editorEl.querySelector('#edIssues');
    const out = [];
    if(host) host.querySelectorAll('div').forEach(d => {
      const t = (d.textContent||'').trim();
      if(t && !/Level check/.test(t)) out.push({ txt:t.slice(0,90), clickable: !!d.onclick, html: /</.test(d.innerHTML) && d.innerHTML !== d.textContent });
    });
    return { shown: host ? host.style.display !== 'none' : null, modalRows: out.filter(r => /modal/i.test(r.txt)) };
  })()`);

  const setup = await P(`(function(){
    if(!editorOpen && typeof toggleEditor === 'function') toggleEditor();
    if(typeof setEditorMode === 'function') setEditorMode('files');
    logicGraph.nodes = []; logicGraph.wires = [];
    hudWidgets = [
      { id:'a', kind:'text', label:'THE SHOP', anchor:'tc', modal:'fairShop' },
      { id:'b', kind:'text', label:'BUY',      anchor:'tc', modal:'fairShop' }
    ];
    return { editorOpen, widgets: hudWidgets.length };
  })()`);

  const orphan = await rows();                                   // built, nothing opens it

  await P(`(function(){
    logicGraph.nodes = [{ id:'d1', type:'do', x:0, y:0, p:{ verb:'modal', mmode:'show', mid:'fairShop' } }];
    return 1;
  })()`);
  const wired = await rows();                                    // THE CONTROL

  await P(`(function(){
    logicGraph.nodes = [{ id:'d1', type:'do', x:0, y:0, p:{ verb:'modal', mmode:'show', mid:'typoShop' } }];
    return 1;
  })()`);
  const bothWays = await rows();                                 // one unopened, one empty

  await P(`(function(){
    logicGraph.nodes = [{ id:'d1', type:'do', x:0, y:0, p:{ verb:'modal', mmode:'show', mid:'booth{n}' } }];
    return 1;
  })()`);
  const computed = await rows();                                 // a computed name decides nothing

  await P(`(function(){
    logicGraph.nodes = []; hudWidgets = [];
    return 1;
  })()`);
  const none = await rows();                                     // the control returns

  console.log(JSON.stringify({ setup, orphan, wired, bothWays, computed, none }, null, 1));
});
