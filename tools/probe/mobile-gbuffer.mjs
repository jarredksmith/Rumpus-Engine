// What does the G-buffer trio cost, and who is paying it?
//
// `_AO_GEO_MAXSTEP = 2` is a plain constant, so the half-res G-buffer prepass — an extra SCENE RENDER, plus
// the viewmodel pass build 1140 puts in the same buffer — survives the top three quality rungs on every
// device. And `_prStepI` starts at 0 everywhere, so a phone OPENS at the most expensive configuration the
// engine has and only relaxes after the adaptive ladder has measured a bad window (build 1141).
//
// Every other expensive thing in the file already takes a device-class decision: point shadows are 0 on a
// coarse pointer (1414), the sun's shadow map is 1024 against 4096 (1346), the environment probe stays
// sky-only (1186), and the resolution ladder even carries two EXTRA rungs there. The prepass never got one.
//
// Measured as draw calls and render passes — integers, resolution-independent, and immune to the fact that
// SwiftShader's wall clock says nothing about a phone. Control returns exactly.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(32) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    paused = true;
    /* PIN THE RUNG. renderScene runs _adaptResTick, and under SwiftShader every frame is a slow frame, so
       the ladder walked the rung out from under the first version of this measurement — rung 0 and rung 1
       reported identical numbers and rung 2 reported the prepass costing nothing while the gate readout
       beside it said the prepass was running. Two rows disagreeing is the instrument, not the engine. */
    _adaptOn = false;
    worldCfg.postGrain = 0; worldCfg.autoExp = 0; applyWorldCfg();
    return { build: BUILD_VERSION, coarse: IS_COARSE, startRung: _prStepI,
             maxstep: _AO_GEO_MAXSTEP, rungs: _PR_STEPS.length };
  })()`));

  /* Isolate the trio at a FIXED rung, so nothing about resolution or the other shed effects is in the
     comparison. ssao/ssr are the two terms _geoWant is built from, so zeroing both is exactly "no prepass". */
  const shot = `(function(ssao, ssr){
    worldCfg.ssao = ssao; worldCfg.ssr = ssr; applyWorldCfg();
    camera.position.set(0, 1.7, 30); camera.up.set(0,1,0);
    camera.lookAt(0, 1.4, 0); camera.updateMatrixWorld(true);
    for(let i=0;i<20;i++) renderScene(scene, camera);
    renderer.info.reset();
    renderScene(scene, camera);
    const r = renderer.info.render;
    /* the gate is read from the SAME render as the cost — reporting it from a separate loop is how the
       first run came to describe two different frames */
    return { ssao, ssr, calls: r.calls, tris: r.triangles, rung: _prStepI, prepass: _SOFT_P.value.x === 1 };
  })`;

  console.log('\n--- what the prepass + AO + SSR cost, at a fixed rung -------------------------------');
  for (const rung of [0, 1, 2]) {
    await P(`(function(){ _prStepI = ${rung}; _prScale = _PR_STEPS[${rung}]; _applyPixelRatio(); return 1; })()`);
    await P(shot + `(0.9, 0.35)`);                       // warm
    const on  = await P(shot + `(0.9, 0.35)`);
    const off = await P(shot + `(0, 0)`);
    const back = await P(shot + `(0.9, 0.35)`);
    const ok = back.calls === on.calls;
    say(`rung ${rung}`, { rung: on.rung, prepass: on.prepass, on: on.calls, off: off.calls,
                          extra: on.calls - off.calls, control: ok ? 'returns' : 'DRIFTED — instrument' });
  }

  /* And the gate itself: which rungs does the prepass survive? Report what the engine holds, never what
     was asked for — a probe that echoes its own input tells you nothing (build 1383). */
  console.log('\n--- which rungs run the prepass -----------------------------------------------------');
  say('per rung', await P(`(function(){
    worldCfg.ssao = 0.9; worldCfg.ssr = 0.35; applyWorldCfg();
    const out = [];
    for(let i=0;i<_PR_STEPS.length;i++){
      _prStepI = i; _prScale = _PR_STEPS[i]; _applyPixelRatio();
      renderScene(scene, camera);
      out.push([i, _SOFT_P.value.x === 1]);   // build 1183/1218: the prepass raises this, nothing else does
    }
    _prStepI = 0; _prScale = _PR_STEPS[0]; _applyPixelRatio();
    return out;
  })()`));

  await P(`(function(){ worldCfg.ssao = 0.9; worldCfg.ssr = 0.35; applyWorldCfg();
    _prStepI = 0; _prScale = _PR_STEPS[0]; _applyPixelRatio(); return 1; })()`);
}, { settleMs: 5000 });

console.log('');
