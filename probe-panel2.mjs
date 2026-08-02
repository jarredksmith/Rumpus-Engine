// Build 1293: does the panel still contain everything, and what did skipping the hidden sections buy?
import { withGame } from './tools/probe/driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(3000);
  console.log(JSON.stringify(await P(`(function(){
    const out={};
    const t=function(f){ const a=performance.now(); f(); return +(performance.now()-a).toFixed(1); };
    const ids=['edWorld','edEnemies','edGame','edCrosshair','edLoot'];
    const nodes=function(){ let n=0; for(const id of ids){ const el=editorEl.querySelector('#'+id); if(el) n+=el.querySelectorAll('*').length; } return n; };
    // ---- on the Props tab, all six global hosts are hidden
    editorActive='props';
    out.propsTab_renderMs = t(function(){ renderEditorFields(); });
    out.propsTab_hiddenNodesAfter = nodes();
    out.propsTab_panelNodes = editorEl.querySelectorAll('*').length;
    return out;
  })()`), null, 1));
  // switch to the world tab through the real click path and confirm the content comes back
  await P("editorActive='world'; renderEditorFields(); 1;");
  await page.waitForTimeout(1500);
  console.log('after switching to World:', JSON.stringify(await P(`(function(){
    const ids=['edWorld','edEnemies','edGame','edCrosshair','edLoot'];
    const o={}; for(const id of ids){ const el=editorEl.querySelector('#'+id); o[id]= el? el.querySelectorAll('*').length : '(missing)'; }
    o.worldOnScreen = _edOnScreen(editorEl.querySelector('#edWorld'));
    const a=performance.now(); renderEditorFields(); o.renderMs=+(performance.now()-a).toFixed(1);
    return o;
  })()`)));
}, { settleMs: 9000 });
