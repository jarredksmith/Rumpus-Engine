// build 1497 — the campaign gets the library's save model
//
// Reported from play: the campaign is "fairly confusing on how to add levels, save the level you're working
// on, etc." Two save targets (the browser slot and the campaign copy), one Save key, and nothing saying
// which one you were feeding. Build 1262 already solved this for the LIBRARY: saveLevel writes through to
// the tracked entry. The campaign's campaignEditIdx is the same concept and got none of it.
//
// Driven through the REAL panel buttons and the REAL saveLevel, because the defect lived in the gap between
// controls that each worked alone.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  /* the panel, for real: editor open, Save tab, campaign fold — the buttons are what a creator presses */
  const open = await P(`(function(){
    if(!editorOpen) toggleEditor();
    setEditorMode('files');
    campaign.levels.length = 0; _campTrack(-1);
    renderCampaignPanel();
    const host = editorEl.querySelector('#edCampaign');
    return { editorOpen, built: !!(host && host.children.length) };
  })()`);
  console.log('panel    ', JSON.stringify(open));

  /* ADD ATTACHES. The old behaviour detached, so the copy started going stale on the very next edit. */
  const add = await P(`(function(){
    const btn = Array.from(editorEl.querySelectorAll('#edCampaign button')).find(b=>/Add current level/.test(b.textContent));
    btn.click();
    return { levels: campaign.levels.length, attached: campaignEditIdx,
             key: localStorage.getItem('breach_campaign_edit') };
  })()`);
  console.log('add      ', JSON.stringify(add), ' <- attached to the level just added, and persisted');

  /* THE REPORT: edit something, press Save, and ask whether the CAMPAIGN copy moved. Before this build the
     campaign kept the old level silently. The marker is a prop moved to a distinctive x. */
  const save = await P(`(function(){
    const o = propModels.find(p=>p && p.userData && p.userData.src==='box');
    o.position.x = 77; refreshPropCollider(o); _homeSync(o);
    /* the control asks the SAME question as the after-check — the first draft grepped the whole JSON for
       '77', which any colour or coordinate can contain, so 'before' was true and discriminated nothing */
    const before = campaign.levels[0].props.some(p=>p.t && Math.abs(p.t[0]-77)<0.01);
    const ok = saveLevel();
    const entry = campaign.levels[0];
    const propX = entry.props.find(p=>p.t && Math.abs(p.t[0]-77)<0.01);
    return { saved: ok, campaignHadItBefore: before, campaignHasItAfter: !!propX,
             nameKept: entry.name, note: editorEl.querySelector('#edCopied') ? 'row exists' : '' };
  })()`);
  console.log('save     ', JSON.stringify(save), ' <- plain Save reached the campaign copy, keeping its name');

  /* the Save button's own note names both destinations */
  const note = await P(`(function(){
    editorEl.querySelector('#edSave').click();
    return { note: editorEl.querySelector('#edCopied').textContent };
  })()`);
  console.log('note     ', JSON.stringify(note));

  /* DONE detaches, and Save goes back to being just the browser save. */
  const done_ = await P(`(function(){
    const btn = Array.from(editorEl.querySelectorAll('#edCampaign button')).find(b=>b.textContent==='Done');
    btn.click();
    const o = propModels.find(p=>p && p.userData && p.userData.src==='box');
    o.position.x = 55; refreshPropCollider(o); _homeSync(o);
    saveLevel();
    const drifted = campaign.levels[0].props.some(p=>p.t && Math.abs(p.t[0]-55)<0.01);
    return { attached: campaignEditIdx, key: localStorage.getItem('breach_campaign_edit'),
             campaignUntouchedAfterDone: !drifted };
  })()`);
  console.log('done     ', JSON.stringify(done_), ' <- detached: later saves leave the campaign alone');

  /* EDIT re-attaches; REORDER remaps rather than dropping — with write-through, a silent detach means
     saves silently stop flowing, which is the bug in a new costume. */
  const reorder = await P(`(function(){
    const addBtn = Array.from(editorEl.querySelectorAll('#edCampaign button')).find(b=>/Add current level/.test(b.textContent));
    addBtn.click();                              // second level, attached to index 1
    const before = campaignEditIdx;
    const ups = Array.from(editorEl.querySelectorAll('#edCampaign button')).filter(b=>b.textContent==='▲');
    ups[1].click();                              // move the attached level 2 up to slot 0
    const after = campaignEditIdx;
    const o = propModels.find(p=>p && p.userData && p.userData.src==='box');
    o.position.x = 33; refreshPropCollider(o); _homeSync(o);
    saveLevel();
    const flowed = campaign.levels[0].props.some(p=>p.t && Math.abs(p.t[0]-33)<0.01);
    const other  = campaign.levels[1].props.some(p=>p.t && Math.abs(p.t[0]-33)<0.01);
    return { before, after, savesFollowTheMove: flowed, theOtherLevelUntouched: !other };
  })()`);
  console.log('reorder  ', JSON.stringify(reorder), ' <- attachment moved with the level; saves follow it');

  /* DELETE above the attachment shifts it; deleting the attached one detaches. */
  const del = await P(`(function(){
    _campTrack(1);                                // attached to the second level
    const xs = Array.from(editorEl.querySelectorAll('#edCampaign button')).filter(b=>b.textContent==='✕');
    xs[0].click();                                // delete the FIRST — the attachment must shift to 0
    const shifted = campaignEditIdx;
    const xs2 = Array.from(editorEl.querySelectorAll('#edCampaign button')).filter(b=>b.textContent==='✕');
    xs2[0].click();                               // delete the attached one itself
    return { shifted, afterDeletingIt: campaignEditIdx, key: localStorage.getItem('breach_campaign_edit') };
  })()`);
  console.log('delete   ', JSON.stringify(del), ' <- shift down, then detach');

  /* A FOREIGN LOAD DETACHES — without this, Save would overwrite a campaign slot with an unrelated level,
     which is worse than the confusion being fixed. */
  const foreign = await P(`(function(){
    const addBtn = Array.from(editorEl.querySelectorAll('#edCampaign button')).find(b=>/Add current level/.test(b.textContent));
    addBtn.click();
    const before = campaignEditIdx;
    markForeignLevel('a shared level');
    return { before, after: campaignEditIdx, key: localStorage.getItem('breach_campaign_edit') };
  })()`);
  console.log('foreign  ', JSON.stringify(foreign), ' <- a shared/imported level is not the campaign level you had open');

  /* the banner and the button both say the state */
  const ui = await P(`(function(){
    _foreignLevel = false; _campTrack(0);
    const txt = editorEl.querySelector('#edCampaign').textContent;
    return { banner: /Editing campaign level/.test(txt), explicit: /Save changes to/.test(txt),
             doneThere: /Done/.test(txt) };
  })()`);
  console.log('ui       ', JSON.stringify(ui));

  await P(`(function(){ _campTrack(-1); campaign.levels.length=0; saveCampaign(); if(editorOpen) toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
