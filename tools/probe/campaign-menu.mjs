// build 1498 — the campaign gets a menu
//
// Reported from play: "it's buried under the save tab and is hard to find." The panel fold was the ONLY
// surface that mentioned campaigns. The menu is a DOOR to the panel's own actions, with the live campaign
// listed by name — driven here through the real menu bar, the real toggle, and real clicks.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  /* the bar wants width >= 760 — the probe viewport is 640x360, so widen the WINDOW's idea of itself */
  const bar = await P(`(function(){
    Object.defineProperty(window, 'innerWidth', { get: ()=>1280, configurable: true });
    if(!editorOpen) toggleEditor();
    _edMenuSync();
    campaign.levels.length = 0; _campTrack(-1);
    const b = document.getElementById('edMenuBar');
    const menus = b ? Array.from(b.querySelectorAll('.mbBtn')).map(x=>x.textContent) : null;
    return { bar: !!b, menus, hint: document.getElementById('mbCampHint').textContent };
  })()`);
  console.log('bar      ', JSON.stringify(bar), ' <- Campaign sits in the bar');

  /* EMPTY campaign: the menu offers Add and Play and Manage, and no phantom level rows */
  const empty = await P(`(function(){
    _edMenuToggle('campaign');
    const rows = Array.from(document.querySelectorAll('#edMenuPop .mbItem')).map(b=>b.textContent);
    _edMenuClose();
    return rows;
  })()`);
  console.log('empty    ', JSON.stringify(empty));

  /* ADD through the menu attaches (1497's semantics, inherited not reimplemented) and the hint says so */
  const add = await P(`(function(){
    _edMenuToggle('campaign');
    const rows = Array.from(document.querySelectorAll('#edMenuPop .mbItem'));
    rows.find(b=>/Add current level/.test(b.textContent)).click();
    return { attached: campaignEditIdx, levels: campaign.levels.length,
             hint: document.getElementById('mbCampHint').textContent };
  })()`);
  console.log('add      ', JSON.stringify(add), ' <- the always-visible hint names the level Save is feeding');

  /* the menu now shows the editing state, the level row marked, and DONE detaches */
  const state = await P(`(function(){
    campaign.levels[0].name = 'Intro';
    _edMenuToggle('campaign');
    const rows = Array.from(document.querySelectorAll('#edMenuPop .mbItem')).map(b=>b.textContent);
    const done = Array.from(document.querySelectorAll('#edMenuPop .mbItem')).find(b=>/^Done/.test(b.textContent));
    done.click();
    return { rows, afterDone: campaignEditIdx, hint: document.getElementById('mbCampHint').textContent };
  })()`);
  console.log('state    ', JSON.stringify(state));

  /* clicking a LEVEL row loads it and attaches — the panel's Edit button, one click from anywhere */
  const pick = await P(`(function(){
    const o = propModels.find(p=>p && p.userData && p.userData.src==='box');
    o.position.x = 41; refreshPropCollider(o); _homeSync(o); saveLevel();   // detached: campaign untouched
    const stale = campaign.levels[0].props.some(p=>p.t && Math.abs(p.t[0]-41)<0.01);
    _edMenuToggle('campaign');
    Array.from(document.querySelectorAll('#edMenuPop .mbItem')).find(b=>/1\\. Intro/.test(b.textContent)).click();
    return { detachedSaveLeftCampaignAlone: !stale, attached: campaignEditIdx,
             hint: document.getElementById('mbCampHint').textContent };
  })()`);
  console.log('pick     ', JSON.stringify(pick), ' <- a level row is the Edit button, one click from anywhere');

  /* Manage… lands on the panel: Save tab, campaign fold revealed */
  const manage = await P(`(function(){
    _edMenuToggle('campaign');
    Array.from(document.querySelectorAll('#edMenuPop .mbItem')).find(b=>/Manage campaign/.test(b.textContent)).click();
    return new Promise(res=>setTimeout(()=>{
      const host = editorEl.querySelector('#edCampaign');
      const sec = host && host.closest('.edSection');
      res({ mode: editorMode, built: !!(host && host.children.length), open: !!(sec && !sec.classList.contains('collapsed')) });
    }, 220));
  })()`);
  console.log('manage   ', JSON.stringify(manage), ' <- Save tab, fold open, panel built');

  /* the other menus are byte-identical in behaviour: a static menu still opens */
  const others = await P(`(function(){
    _edMenuToggle('file');
    const rows = document.querySelectorAll('#edMenuPop .mbItem').length;
    _edMenuClose();
    return { fileMenuRows: rows };
  })()`);
  console.log('others   ', JSON.stringify(others), ' <- static menus untouched by the function-items change');

  await P(`(function(){ _campTrack(-1); campaign.levels.length=0; saveCampaign(); if(editorOpen) toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
