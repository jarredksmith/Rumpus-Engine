// The rung sweep showed renderer.info.programs going 59 -> 62. Program compiles are the freeze this engine
// has shipped four times, so: is that MY resize, or does a rung change already compile? Control = the exact
// same rung sweep with _syncSunShadowRes neutered.
import { withGame } from './driver.mjs';
const SWEEP = `(function(){
  const out = [];
  for(const st of [0,1,2,3,0]){ _prStepI=st; _prScale=_PR_STEPS[st]; _applyPixelRatio();
    renderer.render(scene, camera);
    out.push(st + ':' + renderer.info.programs.length + '/' + moon.shadow.mapSize.x); }
  return out.join('  ');
})()`;
await withGame(async (P) => {
  await P(`_adaptOn=false; editorOpen=false; renderer.render(scene,camera); 1`);
  console.log('warm: programs ' + await P('String(renderer.info.programs.length)'));
  console.log('\nCONTROL — rung sweep with the resize neutered (map pinned):');
  await P(`window.__real = _syncSunShadowRes; _syncSunShadowRes = function(){}; 1`);
  console.log('  ' + await P(SWEEP));
  console.log('  ' + await P(SWEEP) + '   (second pass: a settled program cache should not grow)');
  console.log('\nSHIPPED — the same sweep with the resize live:');
  await P(`_syncSunShadowRes = window.__real; 1`);
  console.log('  ' + await P(SWEEP));
  console.log('  ' + await P(SWEEP) + '   (second pass)');
}, { settleMs: 7000 });
