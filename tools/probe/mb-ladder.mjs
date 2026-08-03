// Fourth hypothesis, and the first that explains "ANY level above 0".
//
// Motion blur is not free: at the top rung it adds a full-res blur pass AND a half-res VELOCITY SCENE
// RENDER (build 1246). `_desiredPostSamples()` returns 4 only at `_prStepI === 0` — so if that extra cost
// pushes the adaptive ladder down a single rung, MSAA is shed ENTIRELY and the resolution drops with it.
// That would make edges jagged exactly when motion blur is switched on, at any strength, on a machine near
// the boundary — and it is invisible to every probe so far, because they all FORCE the top rung.
//
// So this one leaves the ladder ALONE and measures what it does.
import { withGame } from './driver.mjs';

const SAMPLE = `(function(){
  return JSON.stringify({ step:_prStepI, scale:+_prScale.toFixed(3), samples:(_postRT?_postRT.samples:null),
    hiFx:_hiFxOn, mbOn:(_postMotion*((typeof a11y!=='undefined')?a11y.blur:1))>0.01,
    velOn:_matAfter?_matAfter.uniforms.uVelOn.value:null });
})()`;

// average frame time over N frames, measured in-page off requestAnimationFrame
const TIME = (n) => `(function(){
  return new Promise(res=>{
    const t=[]; let last=performance.now(), i=0;
    const step=()=>{ const now=performance.now(); t.push(now-last); last=now;
      if(++i<${n}) requestAnimationFrame(step);
      else { t.sort((a,b)=>a-b); res(JSON.stringify({ median:+t[t.length>>1].toFixed(2),
             mean:+(t.reduce((a,b)=>a+b,0)/t.length).toFixed(2) })); } };
    requestAnimationFrame(step);
  });
})()`;

await withGame(async (P, page) => {
  // the ladder is ON — that is the whole point. Start it from the top so both runs begin equal.
  console.log('start ' + await P(`_adaptOn = true; _prStepI = 0; _prScale = 1; _hiFxOn = true; _hiFxFails = 0;
    _applyPixelRatio(); disposePost(); ensurePost();
    worldCfg.autoExp = 0; worldCfg.postGrain = 0; applyWorldCfg(); editorOpen = false; ${SAMPLE}`));

  for (const mb of [0, 0.62]) {
    await P(`_prStepI = 0; _prScale = 1; _hiFxOn = true; _hiFxFails = 0; _applyPixelRatio();
      if((_postRT.samples||0)!==_desiredPostSamples()){ disposePost(); ensurePost(); }
      worldCfg.postMotion = ${mb}; applyWorldCfg(); 1`);
    await new Promise(r => setTimeout(r, 300));
    console.log('\npostMotion ' + mb);
    console.log('  frame time over 90 frames: ' + await P(TIME(90)));
    console.log('  right after:               ' + await P(SAMPLE));
    // let the ladder react for a few seconds, then look again
    await new Promise(r => setTimeout(r, 6000));
    console.log('  after 6s of running:       ' + await P(SAMPLE));
  }

  // and the direct question: what does the velocity pass alone cost?
  console.log('\nthe velocity pass alone (top rung forced, ladder off):');
  await P(`_adaptOn = false; _prStepI = 0; _prScale = 1; _hiFxOn = true; _applyPixelRatio();
    disposePost(); ensurePost(); window.__sv = _matVel; 1`);
  for (const [label, js] of [
      ['blur off                ', 'worldCfg.postMotion=0; applyWorldCfg(); _matVel=window.__sv;'],
      ['blur on, velocity buffer', 'worldCfg.postMotion=0.62; applyWorldCfg(); _matVel=window.__sv;'],
      ['blur on, no velocity    ', 'worldCfg.postMotion=0.62; applyWorldCfg(); _matVel=null;']]) {
    await P(js + ' 1'); await new Promise(r => setTimeout(r, 400));
    console.log('  ' + label + '  ' + await P(TIME(90)));
  }
  await P('_matVel = window.__sv; _adaptOn = true; 1');
}, { settleMs: 5000 });
