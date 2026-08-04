// Build 1348 adds three doors to capabilities that already existed and could not be found. Verified in the
// real editor, because a control that renders in a branch nobody reaches is the defect builds 1264/1268
// shipped twice — the probe must go through setEditorMode, not set flags.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  await P('toggleEditor(); 1'); await new Promise(r => setTimeout(r, 1500));

  console.log('1. LOCAL MODEL PICKER — the only import door on a tablet');
  await P(`setEditorMode('build'); 1`); await new Promise(r => setTimeout(r, 900));
  console.log('  ' + await P(`(function(){
    const b = document.querySelector('#edPickLocal');
    const hint = [...document.querySelectorAll('#editor .hint')].map(h=>h.textContent||'').join(' | ');
    return JSON.stringify({ button: !!b, label: b ? b.textContent : null,
      pickerFn: typeof _pickLocalModel, importFn: typeof _importLocalModel,
      urlHintMentionsFile: /your own file/.test(hint),
      staysLocalWarning: /Stays on this device/.test(hint) });
  })()`));
  // it must open a real file input restricted to models, not levels
  console.log('  ' + await P(`(function(){
    const before = document.querySelectorAll('input[type=file]').length;
    let made = null;
    const oc = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function(){ made = this; };   // don't actually open a dialog
    try{ _pickLocalModel(); } finally { HTMLInputElement.prototype.click = oc; }
    const r = JSON.stringify({ opened: !!made, accept: made ? made.accept : null,
      isModelNotLevel: made ? (/glb/.test(made.accept) && !/rumpus|json/.test(made.accept)) : false });
    if(made) made.remove();
    return r;
  })()`));

  console.log('\n2. POINT LIGHTS SAY WHY THEY DO NOT CAST');
  console.log('  ' + await P(`(function(){
    // place a point light and select it, then read the panel
    const g = buildLight({ type:'point', t:[0,3,0] });   /* buildLight takes t:[x,y,z], not x/y/z */
    editorTargets.lights.idx = lightModels.indexOf(g); selLights = [g];
    setEditorMode('world');
    return JSON.stringify({ ltype: g.userData.ltype, placed: lightModels.length });
  })()`));
  await P(`setEditorMode('build'); editorActive='lights'; renderEditorFields(); 1`);
  await new Promise(r => setTimeout(r, 900));
  console.log('  ' + await P(`(function(){
    const t = document.querySelector('#editor') ? document.querySelector('#editor').textContent : '';
    return JSON.stringify({ saysItShinesThrough: /shines through walls/.test(t),
      namesTheFix: /use a <b>Spot<\\/b>|use a Spot/.test(document.querySelector('#editor').innerHTML),
      shadowCheckboxShown: !!document.querySelector('#editor') && /Casts shadows/.test(t) });
  })()`));

  console.log('\n3. INSTANT /game/ PUBLISH IS ON THE PUBLISH CARD');
  await P(`setEditorMode('files'); 1`); await new Promise(r => setTimeout(r, 1100));
  console.log('  ' + await P(`(function(){
    const a = document.querySelector('#edGoInstant');
    const card = document.querySelector('.edPublishCard');
    return JSON.stringify({ link: !!a, insideThePublishCard: !!(a && card && card.contains(a)),
      text: a ? a.textContent : null, wired: !!(a && typeof a.onclick === 'function') });
  })()`));
  console.log('  clicking it reveals the real control:');
  await P(`(function(){ const a=document.querySelector('#edGoInstant'); if(a) a.onclick(new Event('click')); return 1; })()`);
  await new Promise(r => setTimeout(r, 700));
  console.log('  ' + await P(`(function(){
    const on = document.querySelector('#hpOn'), b = document.querySelector('#hpPublish');
    const sec = (on||b) && (on||b).closest('.edSection');
    return JSON.stringify({ titleScreenToggleOnScreen: on ? on.getBoundingClientRect().height > 0 : false,
      toggleTicked: on ? on.checked : null,
      sectionOpen: sec ? !sec.classList.contains('collapsed') : null,
      publishRowHiddenUntilToggled: b ? b.getBoundingClientRect().height === 0 : 'no button' });
  })()`));
  console.log('  now tick the prerequisite and look again:');
  await P(`(function(){ const on=document.querySelector('#hpOn'); if(on && !on.checked) on.click();   /* click(), not onchange() — the handler reads e.target */ return 1; })()`);
  await new Promise(r => setTimeout(r, 800));
  console.log('  ' + await P(`(function(){
    const b = document.querySelector('#hpPublish');
    return JSON.stringify({ publishButtonNowOnScreen: b ? b.getBoundingClientRect().height > 0 : false,
      label: b ? b.textContent : null });
  })()`));
}, { settleMs: 6000 });
