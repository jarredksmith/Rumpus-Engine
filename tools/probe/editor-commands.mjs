// build 1310 (editor audit 4.7) — "The Edit menu is Undo / Redo / Delete-all. Absent from EVERY menu,
// palette and panel: Copy, Paste, Duplicate, Group/Ungroup, Align, Snap toggle, Select-all (which does not
// exist — no Ctrl+A), Local/World space. The Ctrl+K palette covers actions and settings but not objects and
// not Redo."
//
// Opens the real editor, presses the real Ctrl+A, and reads the real menu and palette back out of the DOM.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('open editor:', JSON.stringify(await P(`(function(){
    if(typeof toggleEditor==='function' && !editorOpen) toggleEditor();
    if(typeof setEditorMode==='function') setEditorMode('props');
    /* place a handful of props, one locked and one hidden, the way the outliner does */
    for(let i=0;i<5;i++){ if(typeof addSceneProp==='function') addSceneProp('box'); }
    const n = propModels.length;
    propModels[n-1].userData.edLock = true;
    propModels[n-2].userData.edHide = true;
    selProps = [];
    return { editorOpen:!!editorOpen, props:n, locked:1, hidden:1 };
  })()`)));
  await page.waitForTimeout(700);

  // the REAL key, through the real document handler
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  console.log('Ctrl+A     :', JSON.stringify(await P(`(function(){
    const lockedIn = selProps.some(o=>o && o.userData && o.userData.edLock);
    const hiddenIn = selProps.some(o=>o && o.userData && o.userData.edHide);
    return { selected:selProps.length, total:propModels.length, lockedIn, hiddenIn, tab:editorActive,
             primaryIsSelected: selProps.indexOf(propModels[editorTargets.props.idx])>=0 };
  })()`)));

  // Esc is what the Edit menu advertises, so it had better work — and had better not steal the key when
  // there is nothing selected (dialogs and the animation editor own it then).
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('Esc clears :', JSON.stringify(await P(`(function(){ return { selected:selProps.length, editorStillOpen:!!editorOpen }; })()`)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('Esc again  :', JSON.stringify(await P(`(function(){ return { selected:selProps.length, editorStillOpen:!!editorOpen }; })()`)));

  // Ctrl+A must NOT be stolen from a text field
  console.log('in a field :', JSON.stringify(await P(`(function(){
    const inp=document.createElement('input'); inp.type='text'; inp.value='some text'; document.body.appendChild(inp); inp.focus();
    window.__inp = inp; selProps = [];
    return { focused: document.activeElement===inp };
  })()`)));
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  console.log('  -> result:', JSON.stringify(await P(`(function(){
    const r = { selected:selProps.length, textSelected: (window.__inp.selectionEnd - window.__inp.selectionStart) };
    window.__inp.remove(); return r;
  })()`)));

  // the menu, read out of the real DOM
  console.log('Edit menu  :', JSON.stringify(await P(`(function(){
    const m = ED_MENUS.find(x=>x.id==='edit');
    return { items: m.items.filter(i=>!i.sep).map(i=>i.label + (i.key?(' ['+i.key+']'):'')) };
  })()`)));

  // the palette, searched the way a creator would
  console.log('palette    :', JSON.stringify(await P(`(function(){
    const all = _palItems();
    const find = (t)=>all.filter(i=>i.kw.indexOf(t)>=0).map(i=>i.label);
    return { total: all.length,
      redo: find('redo').length, selectAll: find('ctrl+a').length, copy: find('ctrl+c').length,
      paste: find('ctrl+v').length, dup: find('shift+d').length, group: find('ctrl+g').length,
      align: all.filter(i=>/^Align /.test(i.label)).length,
      snap: find('lattice').length, space: find('orientation').length };
  })()`)));

  // and the commands actually work when run from the palette entry, not just exist
  console.log('run from   :', JSON.stringify(await P(`(function(){
    const all=_palItems(), byLabel=(l)=>all.find(i=>i.label===l);
    selProps=[]; byLabel('Select all props').run();
    const sel = selProps.length;
    byLabel('Deselect all').run();
    const after = selProps.length;
    const snap0 = gizmoSnap; byLabel('Toggle snapping').run(); const snap1 = gizmoSnap; byLabel('Toggle snapping').run();
    const sp0 = gizmoSpace; byLabel('Gizmo space: World/Local').run(); const sp1 = gizmoSpace; byLabel('Gizmo space: World/Local').run();
    return { selectAllRan:sel, deselectRan:after, snapToggled: snap0!==snap1, snapRestored: gizmoSnap===snap0,
             spaceToggled: sp0!==sp1, spaceRestored: gizmoSpace===sp0 };
  })()`)));
}, { settleMs: 9000 });
