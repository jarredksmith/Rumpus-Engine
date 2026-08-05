// build 1399, both halves of one report:
//
//  1. "there's something going on with the pickup tab in gameplay. It doesn't show correctly unless you
//     click another dropdown tab and then go back to it."
//  2. "there needs to be an option from the node signals editor to make a pickup spawn only once."
//
// The panel half is measured by COUNTING NODES in the real editor with folds in the state that triggers it,
// with a control fold open as the comparison — an empty panel and a panel that was never asked for look
// identical from outside.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('open the editor:', JSON.stringify(await P(`(function(){
    toggleEditor(); setEditorMode('rules');
    return { editorOpen, mode: (typeof editorMode!=='undefined') ? editorMode : '?' };
  })()`)));
  await page.waitForTimeout(1200);

  // Collapse everything, then open ONLY Pickups — the state the report describes.
  const foldState = () => P(`(function(){
    const out = {};
    for(const id of ['edWorld','edEnemies','edGame','edLoot','edCrosshair','edPickups','edCutscenes']){
      const el = document.getElementById(id);
      out[id] = el ? { onScreen: el.offsetParent !== null, nodes: el.querySelectorAll('*').length } : 'absent';
    }
    return out;
  })()`);

  const setFolds = (openIds) => P(`(function(){
    const want = ${JSON.stringify(openIds)};
    /* collapse every section, then expand only the ones asked for — through the real class the CSS uses */
    for(const sec of document.querySelectorAll('#editor .edSection')) sec.classList.add('collapsed');
    for(const id of want){ const el = document.getElementById(id); if(!el) continue;
      let s = el.closest ? el.closest('.edSection') : null; if(s) s.classList.remove('collapsed'); }
    renderEditorFields();
    return want;
  })()`);

  await setFolds(['edPickups']);
  await page.waitForTimeout(600);
  console.log('\\nONLY Pickups open:');
  const only = await foldState();
  for (const k of Object.keys(only)) console.log('   ' + k.padEnd(12), JSON.stringify(only[k]));

  await setFolds(['edPickups', 'edGame']);
  await page.waitForTimeout(600);
  console.log('\\nPickups + Game open  (the "click another tab" workaround, as the control):');
  const both = await foldState();
  for (const k of ['edPickups', 'edGame']) console.log('   ' + k.padEnd(12), JSON.stringify(both[k]));

  // NODE COUNTS ALONE CANNOT PROVE THIS. With the block skipped the panel is not cleared either, so it
  // keeps STALE content rather than going empty — which is what "a little finnicky" describes. The decisive
  // check is whether the panel REFLECTS a change made while only Pickups is on screen.
  await setFolds(['edPickups']);
  await page.waitForTimeout(400);
  console.log('\nDECISIVE — change the data with only Pickups open, and see if the panel follows:');
  console.log('  ', JSON.stringify(await P(`(function(){
    const read = () => { const el = document.getElementById('edPickups');
      const m = (el ? el.textContent : '').match(/(\\d+) placed:/); return m ? +m[1] : 0; };
    pickupSpots.length = 0;
    pickupSpots.push({ x:1, z:1, kind:'health' });
    renderEditorFields();
    const one = read();
    pickupSpots.push({ x:5, z:5, kind:'ammo' }, { x:9, z:9, kind:'rifle' });
    renderEditorFields();
    const three = read();
    return { panelSaid: one, thenSaid: three, spotsNow: pickupSpots.length,
             follows: (one === 1 && three === 3) };
  })()`)));

  await setFolds(['edCutscenes']);
  await page.waitForTimeout(600);
  console.log('\\nONLY Cutscenes open  (the same shape, unreported):');
  const cut = await foldState();
  console.log('   edCutscenes ', JSON.stringify(cut.edCutscenes));

  // ---------------------------------------------------------------- the `once` option
  console.log('\\nspawned pickup, once OFF vs ON:', JSON.stringify(await P(`(function(){
    powerups.length = 0;
    /* drive the REAL verb, the way a signal or a Do node reaches it */
    _applySignalAction({ do:'pickup', pk:'shotgun', at:'start' }, null);
    _applySignalAction({ do:'pickup', pk:'shotgun', at:'start', once:1 }, null);
    const before = powerups.map(p=>({ kind:p.kind, once:!!p.once, once_predicate:_puOnce(p) }));
    for(const p of powerups){ _puConsume(p); }
    const taken = powerups.map(p=>({ ready:p.ready, gone:!!p.gone }));
    /* stand WELL AWAY, or the pad respawns under the player's feet and is instantly re-collected — the
       first run of this read both pads as not-ready at the end and that was the reason, not the flag */
    player.pos.set(300, EYE, 300);
    let respawns = 0;
    for(let i=0;i<40;i++){ const was = powerups.map(p=>p.ready); updatePowerups(0.5);
      powerups.forEach((p,k)=>{ if(!was[k] && p.ready) respawns++; }); }
    const after = powerups.map(p=>({ ready:p.ready, visible: p.mesh ? p.mesh.visible : null }));
    return { spawned: powerups.length, before, taken, after20s: after, respawns };
  })()`)));

  console.log('\\na spawned KEY is one-shot by its kind, with no flag:', JSON.stringify(await P(`(function(){
    powerups.length = 0;
    _applySignalAction({ do:'pickup', pk:'key_red', at:'start' }, null);
    const p = powerups[0];
    return { once: !!p.once, predicate: _puOnce(p) };
  })()`)));
}, { settleMs: 9000 });
