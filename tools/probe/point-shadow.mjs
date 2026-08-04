// Build 1132 allowed a placed light to cast a shadow, but ONLY for spot and directional — a point light's
// shadow is a cube map, six depth passes for one lamp, and the comment says that is not a cost to let a
// creator apply by accident. Sound reasoning, but the creator is never TOLD: the "Casts shadows" checkbox
// is simply absent for a point light with no explanation, so a lamp in a room lights through the walls and
// nothing in the product says why.
//
// Before choosing between "explain it" and "implement it", measure. Three questions:
//   1. what does one point-light shadow actually cost per frame?
//   2. does toggling castShadow at runtime recompile? (NUM_POINT_LIGHT_SHADOWS is a #define — the
//      636/977/1153/1155 freeze arrives by a second door if so)
//   3. how many point lights does a normal level have?
import { withGame } from './driver.mjs';

const TIME = (n) => `(function(){ return new Promise(res=>{
  const t=[]; let last=performance.now(), i=0;
  const step=()=>{ const now=performance.now(); t.push(now-last); last=now;
    if(++i<${n}) requestAnimationFrame(step);
    else { t.sort((a,b)=>a-b); res(String(t[t.length>>1].toFixed(1))); } };
  requestAnimationFrame(step); }); })()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);

  console.log('the stock level: ' + await P(`(function(){
    const c = _lightCensus ? _lightCensus() : null;
    let pts = 0, casters = 0, placed = 0;
    scene.traverseVisible(o=>{ if(o.isPointLight){ pts++; if(o.castShadow) casters++; } });
    if(typeof lightModels !== 'undefined') placed = lightModels.length;
    return JSON.stringify({ census:c, pointLights:pts, pointCasters:casters, placedLightGroups:placed });
  })()`));

  console.log('\ndoes flipping castShadow recompile? (NUM_POINT_LIGHT_SHADOWS is a #define)');
  console.log('  ' + await P(`(function(){
    const before = renderer.info.programs.length;
    let L = null; scene.traverseVisible(o=>{ if(!L && o.isPointLight) L = o; });
    if(!L) return 'no point light in the stock level';
    window.__pl = L;
    L.castShadow = true; L.shadow.mapSize.set(512,512);
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
    const after = renderer.info.programs.length;
    return JSON.stringify({ programsBefore: before, programsAfter: after,
      RECOMPILED: after !== before, delta: after - before });
  })()`));

  await P('window.__pl.castShadow = false; renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); 1');
  await new Promise(r => setTimeout(r, 1200));

  console.log('\nframe cost of point-light shadows (median of 60 frames each):');
  for (const [tag, js] of [
      ['0 point casters (baseline)', 'window.__pl.castShadow=false;'],
      ['1 point caster  512px     ', 'window.__pl.castShadow=true; window.__pl.shadow.mapSize.set(512,512); if(window.__pl.shadow.map){window.__pl.shadow.map.dispose(); window.__pl.shadow.map=null;}'],
      ['1 point caster 1024px     ', 'window.__pl.castShadow=true; window.__pl.shadow.mapSize.set(1024,1024); if(window.__pl.shadow.map){window.__pl.shadow.map.dispose(); window.__pl.shadow.map=null;}'],
      ['0 again (control)         ', 'window.__pl.castShadow=false;']]) {
    await P(js + ' renderer.shadowMap.needsUpdate = true; 1');
    await new Promise(r => setTimeout(r, 900));
    console.log('  ' + tag + '  ' + await P(TIME(60)) + ' ms');
  }

  // and how many point lights a light-heavy level would have: the reporter's HUD showed 13
  console.log('\nwhat the same cost looks like at 4 casters:');
  console.log('  ' + await P(`(function(){
    const pts = []; scene.traverseVisible(o=>{ if(o.isPointLight) pts.push(o); });
    return JSON.stringify({ availablePointLights: pts.length }); })()`));
}, { settleMs: 6000 });
