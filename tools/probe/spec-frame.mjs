// Build 1386 in the SHIPPED configuration: auto-exposure ON, so the frame is allowed to meter the extra
// energy back out. The A/B above measured the term in isolation; this measures what a player sees, and
// answers the one thing that could still make the change wrong — does the ground clip?
//
// Grain stays off: it is stochastic per frame and is the documented reason three earlier capture rounds in
// this repo produced ~50% "differing pixels" between two frames of the SAME condition.
import { withGame } from './driver.mjs';

const SETUP = `
  (function(){
    paused = true; _adaptOn = false; _prStepI = 0; _prScale = 1; _applyPixelRatio(); _hiFxOn = true;
    worldCfg.postGrain = 0; applyWorldCfg();          // autoExp deliberately LEFT at its shipped 0.7
    player.pos.set(0, 1.7, 30); player.yaw = 0; player.pitch = -0.10;
    camera.position.set(0, 1.7, 30);
    camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = 0; camera.rotation.x = -0.10;
    camera.updateMatrixWorld(true);
    return [worldCfg.autoExp, worldCfg.postGrain];
  })()
`;

const FRAME = `
  (function(){
    renderer.setRenderTarget(null); renderScene(scene, camera);
    const gl = renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let lum = 0, clip = 0, n = W * H;
    const uniq = new Set();
    for(let i = 0; i < n; i++){
      const o = i * 4;
      lum += 0.2126*buf[o] + 0.7152*buf[o+1] + 0.0722*buf[o+2];
      if(buf[o] >= 254 || buf[o+1] >= 254 || buf[o+2] >= 254) clip++;
      uniq.add((buf[o] << 16) | (buf[o+1] << 8) | buf[o+2]);
    }
    // the lower third is ground; the band just under the horizon is the grazing zone
    const band = (y0, y1) => { let s = 0, c = 0;
      for(let y = y0; y < y1; y++) for(let x = 0; x < W; x++){
        const o = ((H - 1 - y) * W + x) * 4; s += 0.2126*buf[o] + 0.7152*buf[o+1] + 0.0722*buf[o+2]; c++; }
      return +(s / c).toFixed(2); };
    return { lum:+(lum/n).toFixed(3), clipPct:+(100*clip/n).toFixed(3), uniq:uniq.size,
             grazing:band(170, 205), nearGround:band(240, 330), exposure:+renderer.toneMappingExposure.toFixed(4) };
  })()
`;

const set = (v) => `(function(){ floorMat.specularIntensity = ${v[0]}; wallMat.specularIntensity = ${v[1]};
  return [floorMat.specularIntensity, wallMat.specularIntensity]; })()`;

await withGame(async (P, page) => {
  console.log('setup [autoExp, grain] =', await P(SETUP));
  const run = async (label, v, ms, shot) => {
    await P(set(v));
    await new Promise(r => setTimeout(r, ms));            // auto-exposure eases; SwiftShader is ~1.5 fps
    const m = await P(FRAME);
    console.log(String(label).padEnd(26), JSON.stringify(m));
    if(shot) await page.screenshot({ path: shot });
    return m;
  };
  // The first run of this probe sampled BEFORE auto-exposure had settled: exposure climbed 1.7237 ->
  // 1.7523 -> 1.7510 and never came back, so every figure carried a one-way drift. Warm up first, then
  // alternate — a single A/B cannot tell an effect from a settling curve.
  await run('warm-up (discarded)', [0.1, 0.2], 30000);
  const w1 = await run('was  #1', [0.1, 0.2], 16000, 'shots/1386-was.png');
  const n1 = await run('now  #1', [1, 1],     16000, 'shots/1386-now.png');
  const w2 = await run('was  #2', [0.1, 0.2], 16000);
  const n2 = await run('now  #2', [1, 1],     16000);
  const avg = (a, b, k) => (a[k] + b[k]) / 2;
  const pc = (k) => (((avg(n1, n2, k) - avg(w1, w2, k)) / avg(w1, w2, k)) * 100).toFixed(2) + '%';
  const rep = (a, b, k) => (Math.abs(a[k] - b[k]) / ((a[k] + b[k]) / 2) * 100).toFixed(2) + '%';
  console.log('\n  repeat spread (was #1 vs #2)  frame', rep(w1, w2, 'lum'), ' grazing', rep(w1, w2, 'grazing'));
  console.log('  repeat spread (now #1 vs #2)  frame', rep(n1, n2, 'lum'), ' grazing', rep(n1, n2, 'grazing'));
  console.log('  EFFECT  frame mean', pc('lum'), '  grazing band', pc('grazing'), '  near ground', pc('nearGround'));
  console.log('  clipped ', w1.clipPct + '/' + w2.clipPct + '% -> ' + n1.clipPct + '/' + n2.clipPct + '%');
  console.log('  unique  ', w1.uniq + '/' + w2.uniq + ' -> ' + n1.uniq + '/' + n2.uniq);
  console.log('  exposure', w1.exposure + '/' + w2.exposure + ' -> ' + n1.exposure + '/' + n2.exposure);
}, { settleMs: 12000 });
