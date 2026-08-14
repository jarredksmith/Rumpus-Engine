// build 1499 (diagnosis) — which authoring markers ride into play, on which path?
//
// Reported from play: "The editor visual for event triggers, and a few others show their outlines/radius
// markers in the game if you click p to play directly from the editor or select play campaign from the
// editor."
//
// Three near-copies of the hide list exist (toggleEditor close, startGame, endGame), each incomplete
// differently. Rather than reasoning through 8 zone types x 3 paths, place ONE OF EVERYTHING and read what
// is still effectively visible after each path.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  /* one of everything, authored while the editor is open — the real workflow */
  const placed = await P(`(function(){
    if(!editorOpen) toggleEditor();
    triggerZones.push({ x:5, z:5, r:4, h:4, y:0, ev:'t1', when:'enter', who:'player' });
    audioZones.push({ x:8, z:8, r:5, url:'', vol:1 });
    deathZones.push({ x:11, z:11, r:3 });
    jumpPads.push({ x:14, z:14, r:2, power:20 });
    ladders.push({ x:17, z:17, h:6 });
    fireZones.push({ x:20, z:20, r:3, dps:5 });
    waterZones.push({ x:23, z:23, r:6, depth:2 });
    fxZones.push(_migrateFxZone({ x:26, z:26, r:4, kind:'haste' }));
    if(typeof refreshTriggerMarkers==='function') refreshTriggerMarkers();
    if(typeof refreshAudioZoneMarkers==='function') refreshAudioZoneMarkers();
    if(typeof refreshDeathZoneMarkers==='function') refreshDeathZoneMarkers();
    if(typeof refreshJumpPadMarkers==='function') refreshJumpPadMarkers();
    if(typeof refreshLadderMarkers==='function') refreshLadderMarkers();
    if(typeof refreshFireZones==='function') refreshFireZones();
    if(typeof refreshWaterZones==='function') refreshWaterZones();
    if(typeof refreshFxZoneMarkers==='function') refreshFxZoneMarkers();
    return { editorOpen };
  })()`);
  console.log('placed   ', JSON.stringify(placed));

  /* what an EFFECTIVELY-VISIBLE authoring marker means: the group and every ancestor visible. Reads the
     LIVE lists rather than a name census, so it cannot miss a type that never got a name. */
  const CENSUS = `
    const vis = (o)=>{ if(!o) return false; for(let p=o; p; p=p.parent){ if(p.visible===false) return false; } return !!o.parent; };
    const rows = {};
    rows.trigger = (typeof triggerMarkers!=='undefined') ? triggerMarkers.filter(vis).length : 'n/a';
    rows.audio   = (typeof audioZoneMarkers!=='undefined') ? audioZoneMarkers.filter(vis).length : 'n/a';
    rows.death   = (typeof deathZoneMarkers!=='undefined') ? deathZoneMarkers.filter(vis).length : 'n/a';
    rows.jump    = (typeof jumpPadMarkers!=='undefined') ? jumpPadMarkers.filter(vis).length : 'n/a';
    rows.ladder  = (typeof ladderMarkers!=='undefined') ? ladderMarkers.filter(vis).length : 'n/a';
    rows.fx      = (typeof fxZoneFx!=='undefined') ? fxZoneFx.filter(vis).length : 'n/a';
    /* fire/water build PLAY visuals + possible editor-only parts: count only parts flagged editor-ish */
    const edParts = (list)=>{ let n=0; (list||[]).forEach(g=>{ if(g && g.userData && (g.userData.editorOnly||g.userData.marker) && vis(g)) n++; }); return n; };
    rows.fireEd  = (typeof fireZoneFx!=='undefined') ? edParts(fireZoneFx) : 'n/a';
    rows.waterEd = (typeof waterZoneFx!=='undefined') ? edParts(waterZoneFx) : 'n/a';
    /* the PLAY visuals themselves — the sweep must never hide these (flames/water in play) */
    rows.fireVis  = (typeof fireZoneFx!=='undefined') ? fireZoneFx.filter(vis).length : 'n/a';
    rows.waterVis = (typeof waterZoneFx!=='undefined') ? waterZoneFx.filter(vis).length : 'n/a';
    return rows;`;

  console.log('in editor', JSON.stringify(await P('(function(){' + CENSUS + '})()')), ' <- the control: everything visible here');

  /* PATH 1: the P key — toggleEditor straight into play */
  const p1 = await P(`(function(){ toggleEditor(); ${''}
    const r = (function(){ ${''} ${CENSUS.replace(/`/g,'')} })();
    return r; })()`);
  console.log('P key    ', JSON.stringify(p1), ' <- anything nonzero rode into play');

  /* reopening the editor must RESTORE them — build 1293 means no panel render will (test-1499's show) */
  const p1b = await P(`(function(){ toggleEditor();
    const r = (function(){ ${CENSUS.replace(/`/g,'')} })();
    return r; })()`);
  console.log('reopened ', JSON.stringify(p1b), ' <- everything must be back for the editor');

  /* PATH 2: play campaign from the OPEN editor */
  const p2 = await P(`(function(){
    if(!editorOpen) toggleEditor();
    campaign.levels.length = 0; _campTrack(-1);
    const lv = serializeLevel(); lv.name='L1'; campaign.levels.push(lv); saveCampaign(); _campTrack(-1);
    startCampaign();
    return { gameOn, editorOpen };
  })()`);
  await P(`(function(){ __drive(60); return 1; })()`);
  const p2c = await P('(function(){' + CENSUS + '})()');
  console.log('campaign ', JSON.stringify(p2), JSON.stringify(p2c), ' <- after Play campaign from the editor');

  await P(`(function(){ campaign.levels.length=0; saveCampaign(); __release(); return 1; })()`);
}, { headless: true });
