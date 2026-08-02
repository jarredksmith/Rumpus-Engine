// REPORTED: "If I select one weapon, say shotgun, the stats section stays on shotgun no matter what other
// weapon I choose." Drive the REAL weapon picker in the Weapons mode and read what the stat rows show.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(2000);
  await P("setEditorMode('kit'); 1;");
  await page.waitForTimeout(3000);

  const read = () => P(`(function(){
    /* the stat rows are number inputs whose reset button is labelled with the FACTORY value for curWep */
    const rows = Array.prototype.slice.call(editorEl.querySelectorAll('.row2'));
    const stats = rows.filter(r=>{ const b=r.querySelector('button'); return b && /↺/.test(b.textContent||''); })
      .map(r=>({ label:(r.querySelector('span')||{}).textContent, val:(r.querySelector('input')||{}).value,
                 factory:(r.querySelector('button')||{}).textContent }));
    return { curWep:curWep, name:WEAPONS[curWep].name, fireRate:WEAPONS[curWep].fireRate, statRows:stats.length,
             firstRow:stats[0]||null, allLabels:stats.map(s=>s.label) };
  })()`);

  console.log('start        ', JSON.stringify(await read()));
  for (const w of ['shotgun', 'pistol', 'sniper']) {
    await P(`(function(){
      const btns = Array.prototype.slice.call(editorEl.querySelectorAll('*')).filter(e=>e.onclick && (e.textContent||'').trim().toUpperCase()===WEAPONS['${w}'].name);
      if(btns.length){ btns[0].onclick(); return 'clicked '+btns.length; }
      return 'NO BUTTON for ${w}';
    })()`).then(r => process.stdout.write(('pick ' + w).padEnd(14) + r + '  '));
    await page.waitForTimeout(1200);
    console.log(JSON.stringify(await read()));
  }
}, { settleMs: 9000 });
