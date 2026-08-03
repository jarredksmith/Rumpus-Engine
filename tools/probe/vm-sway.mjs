// build 1317 (gameplay audit F7) — "there is NO look-sway: no lag/counter-rotation from mouse delta, so the
// gun tracks a flick with zero inertia, which is the single most-noticed 'cheap' tell in a first-person
// game."
//
// Records the gun's actual local transform, frame by frame, through a real flick in the real frame loop.
import { withGame } from './driver.mjs';

const REC = (script, frames) => `(function(){
  window.__vm = [];
  player.pos.set(0, EYE, 0); player.pitch = 0; player.yaw = Math.PI;
  _vmSwayX = 0; _vmSwayY = 0; _vmPrevYaw = null;
  let n = 0;
  const SCRIPT = ${JSON.stringify(script)};
  const tick = () => {
    const step = SCRIPT[Math.min(n, SCRIPT.length-1)];
    if(step === 'flick')  player.yaw -= 0.25;                 /* ~14 deg of turn on this frame */
    if(step === 'pitch')  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + 0.12));
    window.__vm.push({ f:n, s:step,
      px:+gun.position.x.toFixed(4), py:+gun.position.y.toFixed(4),
      ry:+gun.rotation.y.toFixed(4), rx:+gun.rotation.x.toFixed(4), rz:+gun.rotation.z.toFixed(4),
      sx:+_vmSwayX.toFixed(4), sy:+_vmSwayY.toFixed(4) });
    n++;
    if(n < ${frames}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'recording';
})()`;

await withGame(async (P, page) => {
  console.log('consts:', JSON.stringify(await P(`(function(){
    return { in:VM_SWAY_IN, k:VM_SWAY_K, pos:VM_SWAY_POS, rot:VM_SWAY_ROT, max:VM_SWAY_MAX };
  })()`)));

  // a flick: three frames of hard turn, then let go
  const script = ['idle', 'idle', 'flick', 'flick', 'flick'];
  for (let i = 0; i < 25; i++) script.push('idle');
  await P(REC(script, script.length));
  await page.waitForTimeout(9000);
  const rows = await P('window.__vm.map(r=>r.f+" "+r.s.padEnd(5)+" swayX="+r.sx.toFixed(3)+"  gun.x="+r.px.toFixed(4)+"  gun.rotY="+r.ry.toFixed(4)+"  rotZ="+r.rz.toFixed(4))');
  console.log('\\n--- A FLICK, frame by frame ---');
  for (const r of rows.slice(0, 18)) console.log('  ' + r);
  console.log('  ...');
  for (const r of rows.slice(-2)) console.log('  ' + r);

  console.log('\\n--- the shape of it ---');
  console.log(JSON.stringify(await P(`(function(){
    const v = window.__vm;
    const peak = v.reduce((a,b)=>Math.abs(b.sx)>Math.abs(a.sx)?b:a);
    const settled = v[v.length-1];
    const before = v[0];
    return { restingSway:+before.sx.toFixed(4), peakSway:+peak.sx.toFixed(4), peakAtFrame:peak.f,
             settledSway:+settled.sx.toFixed(4), settledGunX:+settled.px.toFixed(4),
             peakGunX:+peak.px.toFixed(4), peakRotY:+peak.ry.toFixed(4),
             counterRotates: (peak.sx>0) === (peak.ry>0),
             returnsToRest: Math.abs(settled.sx) < 0.002 };
  })()`)));

  console.log('\\n--- A 180 CANNOT THROW IT OFF SCREEN ---');
  console.log(JSON.stringify(await P(`(function(){
    _vmSwayX = 0; _vmPrevYaw = player.yaw;
    for(let i=0;i<8;i++){ player.yaw -= Math.PI/4; _vmSwayStep(1/60); }
    return { afterA180:+_vmSwayX.toFixed(4), clamp:VM_SWAY_MAX, clamped: Math.abs(_vmSwayX) <= VM_SWAY_MAX + 1e-9 };
  })()`)));

  console.log('\\n--- ADS FOLDS IT OUT ---');
  console.log(JSON.stringify(await P(`(function(){
    const at = (blend) => { adsBlend = blend; _vmSwayX = 0.2; _vmSwayY = 0;
      const s = (1 - adsBlend*0.85) * ((typeof a11y!=='undefined')?a11y.sway:1);
      return +(_vmSwayX * s * VM_SWAY_ROT).toFixed(4); };
    const r = { hip: at(0), halfAds: at(0.5), fullAds: at(1) }; adsBlend = 0; return r;
  })()`)));

  console.log('\\n--- THE COMFORT SETTING FOLDS IT OUT TOO ---');
  console.log(JSON.stringify(await P(`(function(){
    const at = (sw) => { a11y.sway = sw; adsBlend = 0; _vmSwayX = 0.2;
      const s = (1 - adsBlend*0.85) * a11y.sway;
      return +(_vmSwayX * s * VM_SWAY_ROT).toFixed(4); };
    const r = { full: at(1), half: at(0.5), off: at(0) }; a11y.sway = 1; return r;
  })()`)));

  console.log('\\n--- FRAME RATE ---');
  console.log(JSON.stringify(await P(`(function(){
    /* the same TOTAL turn, delivered in different numbers of frames, must leave the same sway */
    const turn = (frames) => { _vmSwayX = 0; _vmPrevYaw = player.yaw;
      const per = 0.75/frames;
      for(let i=0;i<frames;i++){ player.yaw -= per; _vmSwayStep(1/(frames*4)); }
      return +_vmSwayX.toFixed(4); };
    return { in3frames: turn(3), in6: turn(6), in12: turn(12), in24: turn(24) };
  })()`)));
}, { settleMs: 9000 });
