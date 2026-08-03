// build 1320 (editor audit 4.11) — the "add something" paths, measured against the LIVE engine with the
// editor OPEN (the + FAB does not exist otherwise, which is how the first run of this probe read `noFab`).
//
// The audit listed four claims. One is FALSE and this probe is what killed it:
//   1. "new primitives ignore terrain height"  -> WRONG. finalizeProp lifts EVERY prop by
//      _maxTerrainOver(t[0], t[2], footR) unconditionally, and propTuple stores y terrain-relative.
//   2. the + menu offers 6 of the 10 shapes, no model entry and none of the six FX emitters
//   3. triggers are missing from + -> Zone (ZONE_ADD had drifted from ZONE_TYPES by one entry)
//   4. eight "+ Add X (at me)" buttons place at editorDropPoint, which in fly/top view is NOT where you are
// and a fifth this probe found on its own:
//   5. the command palette offers "Add ramp" — not a builder key, so it is loaded as a MODEL URL and
//      silently adds nothing; `pillar` and `wedge` are missing from the same list.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('--- 1. DOES A PRIMITIVE LAND ON THE TERRAIN?  (the audit says no) ---');
  console.log(JSON.stringify(await P(`(function(){
    const real = terrainHeightAt;
    try{
      terrainHeightAt = () => 7.5;                     /* a hill under every point */
      const n0 = propModels.length;
      addSceneProp('box');
      const box = propModels[propModels.length-1];
      addSceneProp('wedge');
      const ramp = propModels[propModels.length-1];
      return { added: propModels.length - n0, boxY: +box.position.y.toFixed(3), rampY: +ramp.position.y.toFixed(3),
               terrain: 7.5, storedTupleY: +propTuple(box)[1].toFixed(3) };
    } finally { terrainHeightAt = real; }
  })()`)));
  console.log('  (base-at-origin primitives, so y == terrain is EXACTLY sitting on it; the stored tuple y is');
  console.log('   terrain-RELATIVE, which is why a level survives its terrain being re-sculpted)');

  console.log('\\n--- open the editor (the + FAB is an editor-session object) ---');
  console.log(JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor();
    return { editorOpen, freeFly: editorFreeFly, fab: !!document.getElementById('edAddFab'),
             addBtn: !!document.getElementById('edAdd'), menu: !!document.getElementById('edAddMenu') }; })()`)));
  await page.waitForTimeout(900);

  console.log('\\n--- 2/3. WHAT THE + MENU OFFERS ---');
  console.log(JSON.stringify(await P(`(function(){
    const btn = document.getElementById('edAdd'), menu = document.getElementById('edAddMenu');
    if(!btn || !menu) return { noFab:true };
    menu.style.display='none'; btn.click();
    const top = [...menu.children].map(e=>e.textContent);
    const sub = (rx)=>{ menu.style.display='none'; btn.click();
      const row = [...menu.children].find(e=>rx.test(e.textContent)); if(!row) return null;
      row.click(); return [...menu.children].map(e=>e.textContent); };
    return { top, topCount: top.length,
             zones: sub(/Zone/), shapesMore: sub(/shape/i), effects: sub(/Effect \\u25b8|Emitter/i) };
  })()`)));
  console.log('  every shape the engine can build:', JSON.stringify(await P(`Object.keys(PRIMITIVE_BUILDERS).filter(k=>!/^track_|^fx_/.test(k))`)));
  console.log('  every emitter                   :', JSON.stringify(await P(`Object.keys(PRIMITIVE_BUILDERS).filter(k=>/^fx_/.test(k))`)));
  console.log('  the PANEL zone list             :', JSON.stringify(await P(`ZONE_TYPES.map(z=>z[0])`)));

  console.log('\\n--- the Model entry has to LAND somewhere, not just switch tabs ---');
  console.log(JSON.stringify(await P(`(function(){
    const btn = document.getElementById('edAdd'), menu = document.getElementById('edAddMenu');
    menu.style.display='none'; btn.click();
    const row = [...menu.children].find(e=>/Model/i.test(e.textContent));
    if(!row) return { noModelEntry:true };
    row.click();
    const h = document.getElementById('edModels');
    const fold = h && h.closest ? h.closest('.edSub, .edSection') : null;
    return { clicked: row.textContent, mode: editorMode, target: editorActive,
             modelHostExists: !!h, modelHostHasSearch: !!(h && h.textContent && h.textContent.length > 20),
             foldCollapsed: fold ? fold.classList.contains('collapsed') : null };
  })()`)));

  console.log('\\n--- 4. WHERE DOES "(at me)" ACTUALLY PUT IT?  (fly camera, looking down) ---');
  console.log(JSON.stringify(await P(`(function(){
    flyPos.set(40, 25, -60); player.pitch = -0.9; player.yaw = 0;
    const dp = editorDropPoint(0);
    const d = Math.hypot(dp.x - player.pos.x, dp.z - player.pos.z);
    return { player: { x:+player.pos.x.toFixed(1), z:+player.pos.z.toFixed(1) }, flyCam: [40,25,-60],
             dropPoint: dp, metresFromThePlayer: +d.toFixed(1) };
  })()`)));
  console.log('  what the buttons say now:', JSON.stringify(await P(`(function(){
    if(typeof renderTriggersPanel==='function') renderTriggersPanel();
    const b = [...document.querySelectorAll('#edTriggers button')].find(x=>/^\\+ Add trigger/.test(x.textContent));
    return b ? { label: b.textContent, tooltip: b.title } : { noPanel:true };
  })()`)));

  console.log('\\n--- 5. THE COMMAND PALETTE SHAPE LIST ---');
  console.log(JSON.stringify(await P(`(function(){
    /* AFTER 1320 the palette offers LABELS, not keys — "ramp" is what a creator types and \`wedge\` is what
       it builds. So the right question is no longer "is every label a builder key" (it never should have
       been: that confusion IS the bug) but "does every offered entry resolve to a real builder". */
    const items = _palItems().filter(i=>/^Add /.test(i.label)).map(i=>i.label.replace('Add ',''));
    const byLabel = {}; for(const [k,l] of PRIM_SHAPES) byLabel[l.toLowerCase()] = k;
    return { offered: items, resolvesToBuilder: items.filter(l=>PRIMITIVE_BUILDERS[byLabel[l]]).length,
             unresolved: items.filter(l=>!PRIMITIVE_BUILDERS[byLabel[l]]),
             everyShapeOffered: Object.keys(PRIMITIVE_BUILDERS).filter(k=>!/^track_|^fx_/.test(k))
                                  .every(k=>items.map(l=>byLabel[l]).indexOf(k)>=0) };
  })()`)));
  console.log('  the entry the audit found dead:', JSON.stringify(await P(`(async function(){
    assetLoadFailures.clear();
    const before = propModels.length;
    const it = _palItems().find(i=>/^Add ramp$/.test(i.label));
    if(it) it.run(); else addSceneProp('ramp');
    await new Promise(r=>setTimeout(r, 2500));
    return { ranPaletteItem: !!it, propsAdded: propModels.length - before,
             assetFailuresLogged: assetLoadFailures.size, urls: [...assetLoadFailures.keys()] };
  })()`)));
}, { settleMs: 9000 });
