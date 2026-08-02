// Editor audit 4.2 (CRITICAL): the inspector ignored the multi-selection. Drive the REAL editor, select
// several props, change the tag through the real field handler, and count how many actually took it.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(2000);
  await P("setEditorMode('build'); editorActive='props'; 1;");
  await page.waitForTimeout(2500);

  console.log(JSON.stringify(await P(`(function(){
    const picks = propModels.filter(o=>o && !o.userData.runtime).slice(0, 5);
    if(picks.length < 5) return { err:'not enough props', n:picks.length };
    selProps = picks.slice();
    editorTargets.props.idx = propModels.indexOf(picks[0]);
    for(const o of picks){ delete o.userData.tag; delete o.userData.interact; delete o.userData.lockId; }
    renderEditorFields();
    return { selected: selProps.length, targets: _selTargets().length };
  })()`)));

  await page.waitForTimeout(1200);
  console.log(JSON.stringify(await P(`(function(){
    const th = editorEl.querySelector('#edPropTag');
    const tin = th && th.querySelector('input[type=text]');
    const icb = th && th.querySelector('input[type=checkbox]');
    if(!tin) return { err:'tag field not rendered' };
    const banner = th.querySelector('.hint');
    tin.value = 'vaultDoor'; tin.onchange();
    const picks = selProps.slice();
    return {
      bannerText: banner ? banner.textContent : null,
      taggedNow: propModels.filter(o=>o && o.userData.tag==='vaultDoor').length,
      selectionSize: picks.length
    };
  })()`)));
}, { settleMs: 9000 });
