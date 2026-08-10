// build 1477 — does the HUD layout editor actually SHOW a modal's widgets?
//
// The claim is about what is on screen, so it is measured off the real elements the engine built, with the
// play HUD as a control that must not move and a return-to-none step that must come back exactly.
//
// Two widgets: a plain HUD score and a SHOP button that lives in the modal "shop".

import { withGame } from './driver.mjs';

const P = (s) => s;

await withGame(async (probe) => {
  const setup = await probe(P(`(function(){
    hudWidgets.length = 0;
    hudWidgets.push(_sanitizeHudWidgets([{ kind:'text',   id:'hp',   label:'SCORE {score}', anchor:'tl' }])[0]);
    hudWidgets.push(_sanitizeHudWidgets([{ kind:'button', id:'buy',  label:'BUY', anchor:'mr', modal:'shop', ev:'buy' }])[0]);
    hudWidgets.push(_sanitizeHudWidgets([{ kind:'text',   id:'gated', label:'LOCKED', anchor:'bl', when:'hasKey' }])[0]);
    _hwRev++; updateHudWidgets();
    return { n: hudWidgets.length, modals: _lgModalOptions().map(o => o.v + ':' + o.n).join(',') };
  })()`));
  console.log('setup   ', JSON.stringify(setup));

  // open the editor and switch to the HUD tab — the real path, not a flag poke
  const ed = await probe(P(`(function(){
    if(!editorOpen) toggleEditor();
    setEditorMode('hud');
    updateHudWidgets();
    return { editorOpen: editorOpen, hudPreview: document.body.classList.contains('hudPreview'),
             modalOpen: _modalOpen, prev: _hwPrevModal };
  })()`));
  console.log('editor  ', JSON.stringify(ed));

  const shot = () => P(`(function(){
    updateHudWidgets();
    const seen = {};
    for(const e of _hwEls) seen[e.w.id] = (e.el.style.display !== 'none');
    return { prev: _hwPrevModal, seen: seen, dirty: !!_levelDirty,
             backdrop: !!document.getElementById('modalBack'),
             modalOpen: _modalOpen,
             saved: JSON.stringify(serializeLevel().hudWidgets).indexOf('PrevModal') >= 0 };
  })()`);

  await probe(P(`(function(){ _levelDirty = false; return 1; })()`));

  const none = await probe(shot());
  console.log('none    ', JSON.stringify(none));

  await probe(P(`(function(){ _hwPrevModal = 'shop'; return 1; })()`));
  const shop = await probe(shot());
  console.log('shop    ', JSON.stringify(shop));

  await probe(P(`(function(){ _hwPrevModal = ''; return 1; })()`));
  const back = await probe(shot());
  console.log('control ', JSON.stringify(back));

  // and in PLAY the modal widget must still be shut until the verb opens it.
  // The preview is left DELIBERATELY SET to "shop" first: with it cleared this row could not tell a working
  // gate from a broken one, and a check whose fixture cannot produce the failure is not evidence (1422).
  const play = await probe(P(`(function(){
    _hwPrevModal = 'shop';
    if(editorOpen) toggleEditor();
    updateHudWidgets();
    const before = {}; for(const e of _hwEls) before[e.w.id] = (e.el.style.display !== 'none');
    _modalSet('shop'); updateHudWidgets();
    const after = {}; for(const e of _hwEls) after[e.w.id] = (e.el.style.display !== 'none');
    const bd = !!document.getElementById('modalBack');
    _modalSet(''); updateHudWidgets();
    return { prevLeftSet: _hwPrevModal, before: before, after: after, backdrop: bd };
  })()`));
  console.log('play    ', JSON.stringify(play));
}, { headless: true });
