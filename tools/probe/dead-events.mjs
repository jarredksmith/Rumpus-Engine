// build 1487 — does the Level Check say a control fires an event nobody hears, and does a WIRED one go quiet?
//
// Build 1423's lesson: `levelIssues()` returning the right string and the creator being able to READ it are
// two different claims, and its first draft's bug lived entirely in the gap. So this reads the rendered
// PANEL, which needs the editor open and switched to the Save tab (build 1293 does not build a section that
// is not on screen). Wiring the event is the control in every row.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(240); return { gameOn }; })()`)));

  const ISSUES = `levelIssues().filter(m => /On event/.test(String(m)))`;

  // a booth's three controls, none of them wired to anything
  const authored = await P(`(function(){
    hudWidgets = _sanitizeHudWidgets([{ id:'wBuy', kind:'button', label:'Buy a prize', event:'buy' }]);
    triggerZones.length = 0;
    triggerZones.push(_migrateTrigger({ x:60, z:-55, r:6, y:0, h:4, on:'enter', who:'player', ev:'entered' }));
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    return { widgets:hudWidgets.length, triggers:triggerZones.length, nodes:logicGraph.nodes.length,
             rows: ${ISSUES} };
  })()`);
  console.log('unwired  ', JSON.stringify(authored, null, 0).slice(0, 640));

  // WIRE the button's event and watch that row alone go quiet
  const wired = await P(`(function(){
    logicGraph.nodes.push({ id:'n1', type:'event', x:0, y:0, p:{ name:'buy' } });
    return { rows: ${ISSUES} };
  })()`);
  console.log('  +On event "buy":', JSON.stringify(wired.rows));

  const both = await P(`(function(){
    logicGraph.nodes.push({ id:'n2', type:'event', x:0, y:60, p:{ name:'entered' } });
    return { rows: ${ISSUES}, allIssues: levelIssues().length };
  })()`);
  console.log('  +On event "entered":', JSON.stringify(both), ' <- silent: a panel that always complains is not read');

  // and the RENDERED panel, which is the claim the check itself cannot make
  const panel = await P(`(function(){
    logicGraph.nodes.length = 0;                       // dead again
    if(!editorOpen) toggleEditor();
    setEditorMode('files');
    renderEditorFields();
    /* the REAL renderer, driven by name: renderEditorFields alone left the host holding its previous
       content, so the first run read zero rows off a panel nobody had repainted — a row measuring staleness
       rather than the check. (And the backticks this comment first carried closed the template literal:
       the trap this file records fourteen times, from running the lint BEFORE the last edit.) */
    renderLevelIssues();
    const host = editorEl && editorEl.querySelector('#edIssues');
    const rows = host ? Array.from(host.querySelectorAll('div')).map(d=>d.textContent).filter(t=>/On event/.test(t)) : null;
    return { editorOpen, hostFound: !!host, shown: host ? host.style.display !== 'none' : null,
             rows, asProse: rows && rows.length ? !/</.test(rows[0]) : null };
  })()`);
  console.log('the PANEL:', JSON.stringify(panel).slice(0, 700));

  await P(`(function(){ if(editorOpen) toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
