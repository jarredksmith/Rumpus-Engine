// Build 1350: the sun shadow map joins the adaptive ladder. Build 1346 raised the near cascade to 4096 for
// a measured reason and gave the cost no way out — the ladder could shed blur, MSAA, SSAO and a third of
// the pixels while the biggest single draw in the frame stayed at 4096 all the way down.
// Verify: the map follows the rung, resizing costs nothing when nothing moved, and the light COUNT never
// changes (that is the recompile freeze of builds 636/977/1153/1155, and the reason 1348 could not do the
// same thing for point shadows).
import { withGame } from './driver.mjs';

const READ = `(function(){
  let dirShadows = 0, lights = 0;
  scene.traverseVisible(o=>{ if(o.isLight){ lights++; if(o.castShadow && o.isDirectionalLight) dirShadows++; } });
  return JSON.stringify({ rung:_prStepI, sunMap:moon.shadow.mapSize.x,
    farMap:(typeof moonFar!=='undefined'&&moonFar)?moonFar.shadow.mapSize.x:null,
    farCasts:(typeof moonFar!=='undefined'&&moonFar)?moonFar.castShadow:null,
    lights, dirShadowCasters:dirShadows, programs:renderer.info.programs.length });
})()`;

await withGame(async (P) => {
  await P(`_adaptOn=false; editorOpen=false; 1`);
  console.log('SUN_SHADOW_PX = ' + await P('String(SUN_SHADOW_PX)') + '   steps ' + await P('JSON.stringify(_SUN_PX_STEP)'));
  console.log('ready flag (no TDZ, no reliance on catch): ' + await P('String(_sunShadowReady)'));
  for (const step of [0, 1, 2, 3, 0]) {
    await P(`_prStepI=${step}; _prScale=_PR_STEPS[${step}]; _applyPixelRatio(); 1`);
    await new Promise(r => setTimeout(r, 700));
    console.log('  rung ' + step + '  ' + await P(READ));
  }
  console.log('\nresizing when nothing moved must cost nothing:');
  console.log('  ' + await P(`(function(){
    _prStepI = 0; _applyPixelRatio();
    const before = moon.shadow.map;
    _applyPixelRatio(); _applyPixelRatio(); _applyPixelRatio();
    return JSON.stringify({ mapObjectPreserved: moon.shadow.map === before, size: moon.shadow.mapSize.x });
  })()`));
}, { settleMs: 6000 });
