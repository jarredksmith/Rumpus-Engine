// Does the content actually come back? Exercise the REAL paths: the tab click and the fold header click.
// renderEditorFields rate-limits itself to one build per 8 ms and defers the rest to rAF, so every step
// here waits — measuring through that limiter is how the previous run produced a misleading zero.
import { withGame } from './tools/probe/driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(3000);

  const state = () => P(`(function(){
    const el=editorEl.querySelector('#edWorld');
    const sec=el&&el.closest('.edSection');
    return { nodes: el?el.querySelectorAll('*').length:-1, onScreen:_edOnScreen(el),
             collapsed: sec?sec.classList.contains('collapsed'):null, active:editorActive };
  })()`);

  console.log('props tab            ', JSON.stringify(await state()));

  // 1) the real tab click
  await P("(function(){ const b=editorEl.querySelector('#edTabs .tab[data-key=\\\"world\\\"]'); if(b) b.click(); return !!b; })()");
  await page.waitForTimeout(1200);
  console.log('after World tab click', JSON.stringify(await state()));

  // 2) if its fold is collapsed, click the header — the path build 1293 had to add a re-render to
  await P(`(function(){ const el=editorEl.querySelector('#edWorld'); const sec=el&&el.closest('.edSection');
    if(sec && sec.classList.contains('collapsed')){ sec.querySelector('.edSecHead').click(); return 'expanded'; } return 'already open'; })()`);
  await page.waitForTimeout(1200);
  console.log('after expanding fold ', JSON.stringify(await state()));

  // 3) and the cost once it IS visible — this is the case the gate does not help, and must not hurt
  await page.waitForTimeout(300);
  console.log('render cost, visible ', JSON.stringify(await P(
    "(function(){ const a=performance.now(); renderEditorFields(); return { ms:+(performance.now()-a).toFixed(1) }; })()")));
}, { settleMs: 9000 });
