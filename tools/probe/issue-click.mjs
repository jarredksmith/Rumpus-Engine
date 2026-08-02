// Editor audit 4.3: "a great message with nowhere to click". Author the exact fault the audit names —
// a signal pointing at a tag no prop carries — then press the row and see whether the offending prop
// really is selected and framed.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(2000);
  await P("setEditorMode('build'); editorActive='props'; 1;");
  await page.waitForTimeout(2000);

  console.log('setup   :', JSON.stringify(await P(`(function(){
    const culprit = propModels.filter(o=>o && !o.userData.runtime)[3];
    culprit.userData.signals = [{ when:'use', do:'open', target:'vaultDoor' }];   /* no prop carries that tag */
    culprit.userData.name = 'THE CULPRIT';
    selProps = []; editorTargets.props.idx = 0;
    window.__culprit = culprit;
    const list = levelIssues();
    return { issues:list.length, mine:list.filter(m=>/vaultDoor/.test(m)), hasLocator:_issueFind.size };
  })()`)));

  await P("renderEditorFields(); 1;");
  await page.waitForTimeout(1500);

  console.log('click   :', JSON.stringify(await P(`(function(){
    const host = editorEl.querySelector('#edIssues');
    if(!host) return { err:'no issues host' };
    const rows = Array.prototype.slice.call(host.querySelectorAll('div'));
    const row = rows.find(d=>/vaultDoor/.test(d.textContent||''));
    if(!row) return { err:'row not rendered', rows:rows.map(r=>(r.textContent||'').slice(0,40)) };
    const before = { sel:selProps.length, clickable:!!row.onclick, cursor:row.style.cursor, arrow:/→/.test(row.textContent) };
    row.onclick();
    return Object.assign(before, {
      selAfter: selProps.length,
      selectedTheCulprit: selProps[0] === window.__culprit,
      selectedName: selProps[0] ? (selProps[0].userData.name||'(unnamed)') : null,
      activeTab: editorActive
    });
  })()`)));

  console.log('deleted :', JSON.stringify(await P(`(function(){
    /* the prop is gone between opening the panel and pressing the arrow */
    const i = propModels.indexOf(window.__culprit); propModels.splice(i,1);
    const host = editorEl.querySelector('#edIssues');
    const row = Array.prototype.slice.call(host.querySelectorAll('div')).find(d=>/vaultDoor/.test(d.textContent||''));
    selProps = [];
    const ok = row ? row.onclick() : 'no row';
    return { survived:true, selAfter:selProps.length };
  })()`)));
}, { settleMs: 9000 });
