// renderEditorFields rebuilds every section's DOM on every call. Which of them are even on screen?
import { withGame } from './tools/probe/driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(3000);
  console.log(JSON.stringify(await P(`(function(){
    const ids=['edWorld','edEnemies','edGame','edCrosshair','edLoot','edInvItems'];
    const out={ panelVisible: !!(editorEl && editorEl.offsetParent!==null), active: editorActive, hosts:{} };
    let totalNodes=0, hiddenNodes=0;
    for(const id of ids){ const el=editorEl.querySelector('#'+id); if(!el){ out.hosts[id]='(missing)'; continue; }
      const n=el.querySelectorAll('*').length; totalNodes+=n;
      const vis = el.offsetParent!==null;
      if(!vis) hiddenNodes+=n;
      out.hosts[id]={ nodes:n, onScreen:vis };
    }
    out.totalNodes=totalNodes; out.nodesInHiddenSections=hiddenNodes;
    out.panelNodes=editorEl.querySelectorAll('*').length;
    // how many sections exist and how many are collapsed
    const secs=editorEl.querySelectorAll('.edSection');
    let collapsed=0; secs.forEach(function(s){ if(s.classList.contains('collapsed')) collapsed++; });
    out.sections=secs.length; out.collapsed=collapsed;
    // time it, and time it again with everything collapsed
    const t=function(f){ const a=performance.now(); for(let i=0;i<5;i++) f(); return +((performance.now()-a)/5).toFixed(1); };
    out.renderMs = t(function(){ renderEditorFields(); });
    return out;
  })()`), null, 1));
}, { settleMs: 9000 });
