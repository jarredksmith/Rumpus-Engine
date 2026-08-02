// Can the weapons panel get STUCK? renderEditorFields rate-limits to one build per 8 ms and defers the rest
// to requestAnimationFrame behind a `_refQueued` latch. Two clicks inside one tick is what a creator
// actually does, and it is the shape that could strand the latch.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(2000);
  await P("setEditorMode('kit'); 1;");
  await page.waitForTimeout(3000);

  const shown = () => P(`(function(){
    const rows = Array.prototype.slice.call(editorEl.querySelectorAll('.row2'));
    const r = rows.find(x=>{ const b=x.querySelector('button'); return b && /↺/.test(b.textContent||''); });
    return { curWep:curWep, shownFireRate:r?(r.querySelector('input')||{}).value:null,
             realFireRate:WEAPONS[curWep].fireRate, queued:_refQueued,
             matches: r ? (+(r.querySelector('input')||{}).value === WEAPONS[curWep].fireRate) : null };
  })()`);
  const pick = (w) => P(`(function(){
    const b = Array.prototype.slice.call(editorEl.querySelectorAll('*')).find(e=>e.onclick && (e.textContent||'').trim().toUpperCase()===WEAPONS['${w}'].name);
    if(b) b.onclick(); return !!b; })()`);

  console.log('A. two picks in ONE tick (inside the 8 ms window)');
  await P(`(function(){
    const f=(w)=>{ const b=Array.prototype.slice.call(editorEl.querySelectorAll('*')).find(e=>e.onclick && (e.textContent||'').trim().toUpperCase()===WEAPONS[w].name); if(b) b.onclick(); };
    f('shotgun'); f('pistol'); return 1; })()`);
  await page.waitForTimeout(1500);
  console.log('   ', JSON.stringify(await shown()));

  console.log('B. rapid burst through every weapon');
  await P(`(function(){
    const f=(w)=>{ const b=Array.prototype.slice.call(editorEl.querySelectorAll('*')).find(e=>e.onclick && (e.textContent||'').trim().toUpperCase()===WEAPONS[w].name); if(b) b.onclick(); };
    ['rifle','smg','shotgun','sniper','launcher','pistol'].forEach(f); return 1; })()`);
  await page.waitForTimeout(1500);
  console.log('   ', JSON.stringify(await shown()));

  console.log('C. one pick per second, the slow way');
  for (const w of ['shotgun', 'sniper']) { await pick(w); await page.waitForTimeout(1100); console.log('   ', w, JSON.stringify(await shown())); }
}, { settleMs: 9000 });
