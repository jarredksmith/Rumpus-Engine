// build 1473 — a modal is usable on a phone.
//
// The claim the Node harness cannot settle: WHAT THE BROWSER PUTS UNDER A FINGER. `elementFromPoint` at the
// fire button's own centre answers it directly — before this build it returns the fire button while a menu
// is up, which is the defect in one word.
//
// The CONTROL is the same point in the same session with the modal shut: the fire button must come back.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    /* force the touch layer visible — the probe is a desktop browser, and what is being measured is
       LAYERING, which does not care how the layer came to be shown */
    const t = document.getElementById('touchUI');
    if(t) t.style.display = 'block';
    hudWidgets = [
      { id:'keep',  kind:'text',   label:'HUD',  anchor:'tl', size:16, modal:'' },
      { id:'panel', kind:'text',   label:'SHOP', anchor:'tc', size:22, modal:'fair' },
      { id:'buy',   kind:'button', label:'BUY',  anchor:'tc', dy:60, size:16, modal:'fair', event:'BUY' }
    ];
    _hwRev++; _hwRebuild(); updateHudWidgets();
    const f = document.getElementById('tFire');
    return { gameOn, touchShown: t ? getComputedStyle(t).display : null,
             fireRect: f ? [Math.round(f.getBoundingClientRect().left), Math.round(f.getBoundingClientRect().top),
                            Math.round(f.getBoundingClientRect().width)] : null };
  })()`);

  const shot = (label) => P(`(function(){
    const f = document.getElementById('tFire');
    const r = f ? f.getBoundingClientRect() : null;
    const under = (r && r.width) ? document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) : null;
    const x = document.getElementById('modalX');
    const xr = x ? x.getBoundingClientRect() : null;
    const overX = xr ? document.elementFromPoint(xr.left + xr.width/2, xr.top + xr.height/2) : null;
    return { label:${JSON.stringify(label)},
      open: _modalOpen,
      bodyClass: document.body.classList.contains('modalUp'),
      touchDisplay: (()=>{ const t=document.getElementById('touchUI'); return t ? getComputedStyle(t).display : null; })(),
      /* THE MEASUREMENT: what is under a finger at the fire button's own centre */
      underFire: under ? (under.id || under.tagName) : null,
      closeBtn: !!x,
      /* ...and nothing is painted over the only way out */
      underCloseBtn: overX ? (overX.id || overX.tagName) : null };
  })()`);

  const before = await shot('no modal — the touch controls own their pixels');

  await P(`(function(){ _modalSet('fair'); updateHudWidgets(); return 1; })()`);
  const during = await shot('modal open');

  // the close button really closes it, by a real click
  const closed = await P(`(function(){
    const x = document.getElementById('modalX');
    if(!x) return { found:false };
    x.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    updateHudWidgets();
    return { found:true, open:_modalOpen, bodyClass: document.body.classList.contains('modalUp'),
             closeGone: !document.getElementById('modalX'),
             backdropGone: !document.getElementById('modalBack') };
  })()`);

  const after = await shot('after the close button — the control returns');

  // pausing hands the sticks back even with the modal still armed
  const paused = await P(`(function(){
    _modalSet('fair'); updateHudWidgets();
    const armed = { open:_modalOpen, cls: document.body.classList.contains('modalUp') };
    paused = true; _modalSyncBack();
    const whilePaused = { open:_modalOpen, cls: document.body.classList.contains('modalUp'),
                          touch: getComputedStyle(document.getElementById('touchUI')).display };
    paused = false; _modalSyncBack();
    const back = { cls: document.body.classList.contains('modalUp') };
    _modalSet(''); updateHudWidgets();
    return { armed, whilePaused, back };
  })()`);

  console.log(JSON.stringify({ setup, before, during, closed, after, paused }, null, 1));
});
