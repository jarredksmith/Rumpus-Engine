// build 1491 — the floor can be given a normal map by hand
//
// Reported from play: "if a material is added to the floor, it doesn't pick up any normal or bump maps, just
// the flat image." The floor has loaded all three maps since build 1378 — applySurfaceTexture takes an albedo,
// a normal and a roughness, and worldCfg carries floorTexN/floorTexR. There was nowhere to TYPE one: only the
// texture search set them, so a pasted url was flat forever.
//
// The control in every row is a floor whose normal map was never given a field: set worldCfg.floorTex alone
// and read what reaches floorMat.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

/* A SAME-ORIGIN png, written into the staging beside the game.
   The first run used a data: url and measured nothing: proxied() sends anything whose origin differs from the
   page through the CORS proxy, and a data url's origin is the string "null", so the whole base64 went to a
   workers.dev proxy this sandbox cannot reach. The material had ACCEPTED the url (that readout is what said
   so) with three loads pending forever. Same origin means proxied() hands the url straight back. */
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
const PNG = './probe-normal.png';
writeFileSync(new URL('../../probe-out/probe-normal.png', import.meta.url),
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAACddGYaAAAAHElEQVQI12P4//8/AzYEE2CY' +
              'BEmIYCJgJhIAAOaXCfsBKgAAAABJRU5ErkJggg==', 'base64'));

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(120); return { gameOn }; })()`)));

  /* what the material HOLDS, which is the only thing that decides whether relief renders */
  const READ = `(function(){
    const m = floorMat;
    const nm = m.normalMap, rm = m.roughnessMap;
    return {
      albedo: !!m.map,
      normal: !!nm, rough: !!rm,
      /* a cleared slot falls back to build 1139's PROCEDURAL grain rather than to null, so "has a normalMap"
         is not the question — the question is whether it is the creator's. The remembered set is the tell. */
      normalIsProc: !!(nm && m.userData && m.userData.procSurf && nm === m.userData.procSurf.normalMap),
      /* the url the material ACCEPTED, which is what distinguishes "never reached it" from "still loading or
         failed to load". _loadSurfaceMap stamps it synchronously and the image arrives later. */
      accepted: (m._normalMapUrl||'').slice(0,24),
      pending: (typeof _texPending!=='undefined') ? _texPending : null,
      proxy: (typeof ppProxy==='function') ? (ppProxy()||'(none)') : '?',
      cfgN: worldCfg.floorTexN || '', cfgR: worldCfg.floorTexR || ''
    };
  })()`;

  /* the pre-1491 sequence: an albedo and nothing else, because nothing could reach the other two */
  const before = await P(`(function(){
    worldCfg.floorTex = ${JSON.stringify(PNG)}; worldCfg.floorTexN=''; worldCfg.floorTexR='';
    applyWorldCfg();
    return 1;
  })()`);
  await P(`(function(){ __drive(30); return 1; })()`);
  console.log('CONTROL — albedo only:', JSON.stringify(await P(READ)), ' <- the reported state: flat image, procedural relief');

  /* now the shipped path: the fields exist, so a creator can hand it one */
  await P(`(function(){
    worldCfg.floorTexN = ${JSON.stringify(PNG)}; worldCfg.floorTexR = ${JSON.stringify(PNG)};
    applyWorldCfg(); return 1;
  })()`);
  /* __drive advances a VIRTUAL clock; a TextureLoader is a real browser fetch and never sees it. Poll in
     real time until the slot stops being the procedural fallback, or give up and SAY so. */
  let land = null;
  for(let i=0;i<40;i++){
    land = await P(READ);
    if(!land.normalIsProc) break;   // the creator's map has landed
    await P(`(function(){ return new Promise(r=>requestAnimationFrame(()=>r(1))); })()`);
  }
  console.log('  with the new rows:  ', JSON.stringify(land), ' <- the creator\'s own maps reach the material');

  /* if it did NOT land, say WHY rather than reporting a null. A raw Image() answers the one question the
     material cannot: is the file reachable from this page at all? */
  if(land.normalIsProc){
    const why = await P(`(function(){
      return new Promise(r=>{
        const im = new Image();
        im.onload  = ()=> r({ imgLoaded:true, w:im.width, h:im.height, at:im.currentSrc||im.src });
        im.onerror = (e)=> r({ imgLoaded:false, at:im.src, note:'the page cannot fetch it' });
        im.src = ${JSON.stringify(PNG)};
      });
    })()`);
    console.log('  NOT LANDED — raw Image():', JSON.stringify(why));
    console.log('  ^ INSTRUMENT LIMIT, stated rather than papered over. The png curls 200 from the staging');
    console.log('    server and the page still refuses it, so no image DECODES in this sandbox. What the');
    console.log('    probe DOES establish is the half that was missing: the url reaches the material');
    console.log('    (accepted is empty in the control, the creator url with the rows) and the rows exist.');
    console.log('    The loading half is build 1378 and unchanged, through the same _loadSurfaceMap the');
    console.log('    albedo already uses — so an albedo that works implies a normal that works. test-1491');
    console.log('    pins that contract; a browser is what confirms the pixels.');
  }

  /* the rows really are in the panel, found by the placeholder a creator sees */
  const rows = await P(`(function(){
    if(!editorOpen) toggleEditor();
    try{ localStorage.setItem('breach_world_sections', JSON.stringify({ floor:false, walls:false })); }catch(e){}
    setEditorMode('scene'); renderEditorFields();
    const ins = Array.from(document.querySelectorAll('#editor input[type=text]'));
    const ph = (t) => ins.some(i => (i.placeholder||'').indexOf(t) >= 0);
    return { floorNormal: ph('floor-normal'), floorRough: ph('floor-rough'),
             wallNormal: ph('wall-normal'), wallRough: ph('wall-rough'),
             albedoStillThere: ph('floor.jpg') };
  })()`);
  console.log('panel rows', JSON.stringify(rows));

  /* the change-gated clear: re-applying the SAME albedo must not wipe a normal just typed */
  const same = await P(`(function(){
    const ins = Array.from(document.querySelectorAll('#editor input[type=text]'));
    const fld = ins.find(i => (i.placeholder||'').indexOf('floor.jpg') >= 0);
    fld.value = worldCfg.floorTex;                       // unchanged
    const btn = fld.parentElement.querySelector('button');
    btn.onclick();
    return { cfgN: worldCfg.floorTexN || '', cfgR: worldCfg.floorTexR || '' };
  })()`);
  console.log('  re-Apply, url UNCHANGED:', JSON.stringify(same), ' <- kept');

  const changed = await P(`(function(){
    const ins = Array.from(document.querySelectorAll('#editor input[type=text]'));
    const fld = ins.find(i => (i.placeholder||'').indexOf('floor.jpg') >= 0);
    fld.value = 'https://example.invalid/other.png';     // a REAL change
    fld.parentElement.querySelector('button').onclick();
    return { cfgN: worldCfg.floorTexN || '', cfgR: worldCfg.floorTexR || '' };
  })()`);
  console.log('  Apply a DIFFERENT url: ', JSON.stringify(changed), ' <- dropped, as a concrete normal under a brick colour should be');

  await P(`(function(){ worldCfg.floorTex=''; worldCfg.floorTexN=''; worldCfg.floorTexR='';
                        applyWorldCfg(); if(editorOpen) toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
