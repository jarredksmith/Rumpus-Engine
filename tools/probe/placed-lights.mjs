// build 1338 — placed lights join the light budget. Five things have to be true at once, and three of them
// are the ways this could have gone silently wrong:
//   1. the fade happens at all, and by distance
//   2. a signal-OFF light stays off — the budget must not become a second writer of the same value
//   3. a shadow-caster is exempt
//   4. the deploy cap removes the surplus, and the editor gets every one of them back
//   5. saving never writes a faded number over the creator's authored brightness
import { withGame } from './driver.mjs';

// lay N point lights in a line receding from the origin, so rank IS distance and the answer is readable
const PLACE = (n) => `(function(){
  while(lightModels.length) removeLight(0);
  for(let i=0;i<${n};i++) buildLight({ type:'point', color:0xffffff, intensity:8, distance:20, t:[0,2,-i*4] });
  return lightModels.length;
})()`;

const READ = `lightModels.map(g=>({ z:+g.position.z.toFixed(0), i:+g.userData.light.intensity.toFixed(2),
                       inScene: !!g.userData.light.parent, off: g.userData.lon===false, sh: !!g.userData.wantShadow }))`;

await withGame(async (P, page) => {
  console.log('cap / max active   ' + await P('JSON.stringify({ deployCap:_emitterCap(), litAtOnce:_maxActiveLights(), coarse:IS_COARSE })'));

  // ---- 1 + 5: the fade, and what a save writes while it is faded
  console.log('\n20 PLACED LIGHTS, camera at the origin end');
  await P(PLACE(20));
  await P("player.pos.set(0,2,0); camera.position.set(0,2,0); editorOpen=false; 1");
  // 60 frames, not 2: a placed light's default `lfade` is 0.4s, so the ramp needs ~25 frames to settle.
  // The first run of this probe read 7.36 everywhere and looked like a broken fade; it was a probe that
  // stopped watching before the ramp finished.
  await P('for(let k=0;k<60;k++) updateLights(0.016); 1');
  const lit = await P(READ);
  console.log('  z / intensity    ' + JSON.stringify(lit.map(l => l.z + ':' + l.i)));
  console.log('  authored saved   ' + JSON.stringify(await P(
    'lightModels.map(g=>_lightOpts(g).intensity)')) + '   <- what serializeLevel would write');

  // ---- 2: the two-writer test. A signal-OFF light must STAY off.
  console.log('\nSIGNAL-OFF (the budget must not be a second writer)');
  console.log('  ' + JSON.stringify(await P(`(function(){
    lightModels[0].userData.lon = false; lightModels[0].userData.lfade = 0;   // nearest light, switched off by a signal
    for(let k=0;k<60;k++) updateLights(0.016);
    return { nearestOff: +lightModels[0].userData.light.intensity.toFixed(3),
             nearestOn:  +lightModels[1].userData.light.intensity.toFixed(3) };
  })()`)));

  // ---- 3: a shadow-caster is exempt
  console.log('\nSHADOW-CASTER EXEMPT');
  console.log('  ' + JSON.stringify(await P(`(function(){
    while(lightModels.length) removeLight(0);
    for(let i=0;i<20;i++) buildLight({ type:'spot', color:0xffffff, intensity:8, distance:20, t:[0,2,-i*4], shadow: (i===19)?1:0 });
    for(let k=0;k<60;k++) updateLights(0.016);
    const far = lightModels[19], other = lightModels[18];
    return { farthestIsCaster: !!far.userData.wantShadow, farthestIntensity:+far.userData.light.intensity.toFixed(2),
             neighbourIntensity:+other.userData.light.intensity.toFixed(2) };
  })()`)));

  // ---- 4: the deploy cap, and the editor getting them back
  console.log('\nDEPLOY CAP');
  console.log('  ' + JSON.stringify(await P(`(function(){
    while(lightModels.length) removeLight(0);
    const N = _emitterCap() + 12;
    for(let i=0;i<N;i++) buildLight({ type:'point', color:0xffffff, intensity:8, distance:20, t:[0,2,-i*4] });
    const before = lightModels.filter(g=>!!g.userData.light.parent).length;
    const dropped = enforceEmitterCap();
    const after = lightModels.filter(g=>!!g.userData.light.parent).length;
    const levelCheck = (levelIssues().filter(function(s){return /placed light/.test(s);})[0]||'').slice(0,80);
    const restored = _restoreCappedLights();   // reading Level Check AFTER this would read the cleared count
    const back = lightModels.filter(g=>!!g.userData.light.parent).length;
    return { placed:N, cap:_emitterCap(), inSceneBefore:before, dropped, inSceneAfter:after, restored, inSceneBack:back, levelCheck };
  })()`)));

  // and the cheap path is genuinely cheap: under the budget, no map is built at all
  console.log('\nUNDER BUDGET (nothing to rank)');
  console.log('  ' + JSON.stringify(await P(`(function(){
    while(lightModels.length) removeLight(0);
    for(let i=0;i<4;i++) buildLight({ type:'point', color:0xffffff, intensity:8, distance:20, t:[0,2,-i*4] });
    updateLights(0.016);
    return { lights:lightModels.length, rankMap:_plRankF, intensities:lightModels.map(g=>+g.userData.light.intensity.toFixed(2)) };
  })()`)));

  await P('while(lightModels.length) removeLight(0); 1');
}, { settleMs: 4000 });
