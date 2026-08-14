// build 1500 — Ctrl+S from any editor tab must produce a VISIBLE confirmation.
//
// Reported: "Right now it only shows if you have the Save tab open, and even then it is a little buried."
// The save itself always worked (Ctrl+S clicks #edSave, whose button exists from any tab); only the
// feedback was tab-local. The rows below discriminate: the note is provably invisible on the Build tab
// (offsetParent null) while the toast carries the message anyway, and the failure path toasts too.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(60); return 1; })()`);

  /* Ctrl+S on the BUILD tab (the default) — the note cannot be seen there, the toast must be */
  const r1 = await P(`(function(){
    if(!editorOpen) toggleEditor();
    setEditorMode('build');
    const note = editorEl.querySelector('#edCopied');
    dispatchEvent(new KeyboardEvent('keydown', { code:'KeyS', ctrlKey:true, bubbles:true, cancelable:true }));
    const t = document.getElementById('toast');
    return { tab: editorActive, noteVisible: !!(note && note.offsetParent),
             noteText: note ? note.textContent : null,
             toast: t ? t.textContent : null, toastShown: !!(t && t.style.opacity === '1') };
  })()`);
  console.log('build tab', JSON.stringify(r1), ' <- note invisible, toast carries the message');

  /* Ctrl+S while ATTACHED to a campaign level — the toast names the second destination */
  const r2 = await P(`(function(){
    _toastBusy=false; _toastQ.length=0; { const t=document.getElementById('toast'); if(t){ clearTimeout(t._t); t.textContent=''; } }
    campaign.levels.length = 0;
    const lv = serializeLevel(); lv.name = 'Booth 1'; campaign.levels.push(lv); saveCampaign(); _campTrack(0);
    dispatchEvent(new KeyboardEvent('keydown', { code:'KeyS', ctrlKey:true, bubbles:true, cancelable:true }));
    const t = document.getElementById('toast');
    const out = { toast: t ? t.textContent : null };
    campaign.levels.length = 0; saveCampaign(); _campTrack(-1);
    return out;
  })()`);
  console.log('attached ', JSON.stringify(r2), ' <- names the campaign level');

  /* a save that FAILS must toast the failure — a silent failure is worse than a missed confirmation */
  const r3 = await P(`(function(){
    _toastBusy=false; _toastQ.length=0; { const t=document.getElementById('toast'); if(t){ clearTimeout(t._t); t.textContent=''; } }
    /* two earlier fixtures (Storage.prototype, then the instance) produced a SUCCESSFUL save — correctly:
       saveLevel's catch returns true when IndexedDB is alive (build 1359's quota fallback), so a blocked
       localStorage is not a failure. The one failure saveLevel cannot route around is serialization. */
    let toast = null;
    const real = serializeLevel;
    try{
      serializeLevel = function(){ throw new Error('probe'); };
      dispatchEvent(new KeyboardEvent('keydown', { code:'KeyS', ctrlKey:true, bubbles:true, cancelable:true }));
      const t = document.getElementById('toast'); toast = t ? t.textContent : null;
    } finally { serializeLevel = real; }
    return { toast };
  })()`);
  console.log('failure  ', JSON.stringify(r3), ' <- the failure reaches the player too');

  /* control: Ctrl+S inside a text field must still be the browser's, not a save */
  const r4 = await P(`(function(){
    _toastBusy=false; _toastQ.length=0; { const t=document.getElementById('toast'); if(t){ clearTimeout(t._t); t.textContent=''; } }
    const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
    const t0 = document.getElementById('toast'); if(t0) t0.textContent = '';
    const ev = new KeyboardEvent('keydown', { code:'KeyS', ctrlKey:true, bubbles:true, cancelable:true });
    Object.defineProperty(ev, 'target', { value: inp });
    dispatchEvent(ev);
    const t = document.getElementById('toast'); inp.remove();
    return { toast: t ? t.textContent : null };
  })()`);
  console.log('in a field', JSON.stringify(r4), ' <- control: no save fired, no toast');

  await P(`(function(){ toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
