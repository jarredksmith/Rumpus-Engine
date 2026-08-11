// build 1490 — ticking Free mouse cursor must bring the control it enables to life NOW
//
// Reported from play: "the move to mouse click option was finnicky — sometimes I could click it, sometimes I
// couldn't." Click-to-move is DISABLED until Free mouse cursor is on, and ticking Free mouse cursor did not
// re-render the panel, so the box below stayed dead until some unrelated edit repainted it. Switching tabs
// and coming back fixed it, which is the shape of the report.
//
// The control in every row is the pre-1490 sequence: tick the parent WITHOUT a re-render and read the child.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(200); return { gameOn }; })()`)));

  /* the Gameplay tab, in a view where the pair is offered at all */
  const open = await P(`(function(){
    gameCfg.view = 'top'; gameCfg.freeCursor = false; gameCfg.clickMove = false;
    if(!editorOpen) toggleEditor();
    /* the GAMEPLAY tab, not Player: bPly hangs off the edGame host. My first run set the Player tab and found
       neither control, which is a probe measuring the wrong panel — and it is also exactly why the report
       said "gameplay tab" and I had assumed otherwise. The mode KEY is 'rules'; MODE_LABEL renames it
       Gameplay for the creator, and setEditorMode takes the key. Build 1293 does not build a section that is
       off screen, so both the section AND the fold have to be open before anything is read. */
    try{ localStorage.setItem('breach_world_sections', JSON.stringify({ g_ply:false })); }catch(e){}
    setEditorMode('rules');
    const sec = document.querySelector('#edGame') ? document.querySelector('#edGame').closest('.edSection') : null;
    if(sec) sec.classList.remove('collapsed');
    renderEditorFields();
    const host = document.querySelector('#edGame');
    return { editorOpen, view: gameCfg.view, hostFound: !!host,
             hostShown: host ? !!host.offsetParent : null,
             folds: Array.from(document.querySelectorAll('#edGame .edSubSection'))
                      .map(f => (f.textContent||'').slice(0,18)) };
  })()`);
  console.log('editor   ', JSON.stringify(open));

  /* find the two boxes by their own labels — never by index, which would silently follow a moved row */
  const READ = `(function(){
    const rows = Array.from(document.querySelectorAll('label'));
    const find = (t) => rows.find(r => (r.textContent||'').indexOf(t) === 0 || (r.textContent||'').includes(t));
    const fc = find('Free mouse cursor'), cm = find('Click to move');
    const box = (r) => r ? r.querySelector('input[type=checkbox]') : null;
    return { fcFound: !!fc, cmFound: !!cm,
             fcOn: box(fc) ? box(fc).checked : null,
             cmDisabled: box(cm) ? box(cm).disabled : null,
             cmLabel: cm ? (cm.textContent||'').trim() : null,
             /* the editor moves every native title to data-tip and removes the attribute (build 1337), and the
                sweep runs a beat after the render — so a read taken immediately after renderEditorFields sees
                title while a settled one sees data-tip. Ask for both or the row lies about a tooltip that is
                there. */
             cmTip: cm ? (cm.title || cm.dataset.tip || '') : null };
  })()`;

  console.log('at rest  ', JSON.stringify(await P(READ)), ' <- disabled, and the label says what to do');

  // THE CONTROL: the pre-1490 sequence — set the flag, do NOT re-render
  const stale = await P(`(function(){
    gameCfg.freeCursor = true;                       // as if the parent were ticked with no repaint
    return ${READ};
  })()`);
  console.log('  parent ticked, NO repaint:', JSON.stringify(stale), ' <- the reported bug: still disabled');

  // and the shipped path: the parent's own handler
  const live = await P(`(function(){
    gameCfg.freeCursor = false; renderEditorFields();
    const rows = Array.from(document.querySelectorAll('label'));
    const fc = rows.find(r => (r.textContent||'').includes('Free mouse cursor'));
    const box = fc.querySelector('input[type=checkbox]');
    box.checked = true; box.onchange();               // exactly what a click does
    return ${READ};
  })()`);
  console.log('  ticked THROUGH the handler:', JSON.stringify(live), ' <- alive on the same frame');

  const off = await P(`(function(){
    const rows = Array.from(document.querySelectorAll('label'));
    const fc = rows.find(r => (r.textContent||'').includes('Free mouse cursor'));
    const box = fc.querySelector('input[type=checkbox]');
    box.checked = false; box.onchange();
    return ${READ};
  })()`);
  console.log('  unticked again:', JSON.stringify(off), ' <- and it goes back');

  // where they went, in the views that do not offer them
  for(const v of ['fps', 'chase', 'top']){
    const r = await P(`(function(){
      gameCfg.view = ${JSON.stringify(v)}; gameCfg.chaseCursorAim = false;
      renderEditorFields();
      const t = document.getElementById('editor').textContent || '';
      return { offered: /Free mouse cursor/.test(t), explained: /is offered in Top-down and Side-scroll/.test(t) };
    })()`);
    console.log(('  view ' + v).padEnd(14), JSON.stringify(r));
  }

  await P(`(function(){ gameCfg.view='fps'; gameCfg.freeCursor=false; gameCfg.clickMove=false;
                        if(editorOpen) toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
