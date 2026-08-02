// The six global hosts are hidden by the editor MODE (applyEditorMode sets display on .edSection), not by
// a tab. So the path that must bring them back is setEditorMode — which calls applyEditorMode and THEN
// renderEditorFields, in that order. Verify against the real function.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(3000);
  const state = () => P(`(function(){
    const ids=['edWorld','edEnemies','edGame','edCrosshair','edLoot']; let n=0, vis=0;
    for(const id of ids){ const el=editorEl.querySelector('#'+id); if(!el) continue; n+=el.querySelectorAll('*').length; if(_edOnScreen(el)) vis++; }
    return { mode:editorMode, nodes:n, hostsOnScreen:vis, panelNodes:editorEl.querySelectorAll('*').length };
  })()`);
  console.log('start                ', JSON.stringify(await state()));
  const modes = await P('EDITOR_MODES.slice()');
  console.log('modes:', JSON.stringify(modes));
  for (const m of modes) {
    await P(`setEditorMode('${m}'); 1;`);
    await page.waitForTimeout(900);
    const s = await state();
    const cost = await P("(function(){ const a=performance.now(); renderEditorFields(); return +(performance.now()-a).toFixed(1); })()");
    await page.waitForTimeout(200);
    console.log(('mode ' + m).padEnd(22), JSON.stringify(s), ' renderMs=' + cost);
  }
}, { settleMs: 9000 });
