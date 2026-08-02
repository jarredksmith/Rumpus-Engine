// build 1306 — REPORTED AGAIN after 1304: the third-person body freezes on its idle pose, still moves, and
// only recovers when a DIFFERENT state is asked for. Whatever strands the action, `if(animState === key)
// return` is what makes it permanent. This probe strands it three ways on a real mixer with real actions
// and asks whether the real setEnemyAnimState repairs it without a state change.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  tpMode = true; player.pos.set(0, EYE, 30); player.yaw = Math.PI;
  const a = ensureOwnAvatar(); if(!a) return { err:'no avatar' };
  const v = a.userData.visual; if(!v) return { err:'no visual' };
  const dummy = new THREE.Object3D(); dummy.name='animProbe'; v.add(dummy);
  const mk = (n,d) => new THREE.AnimationClip(n, d, [ new THREE.VectorKeyframeTrack('animProbe.position',[0,d],[0,0,0, 0,1,0]) ]);
  const old = v.userData.mixer; if(old){ const i=mixers.indexOf(old); if(i>=0) mixers.splice(i,1); }
  const mixer = new THREE.AnimationMixer(v);
  const acts = {}; for(const s of ['idle','walk','run','attack','die']){ const ac=mixer.clipAction(mk(s,1)); ac.enabled=false; ac.setEffectiveWeight(0); acts[s]=ac; }
  acts.idle.enabled=true; acts.idle.setEffectiveWeight(1); acts.idle.play();
  v.userData.stateActions=acts; v.userData.animState='idle'; v.userData.animAt=0; v.userData.animCfg={};
  v.userData.mixer=mixer; mixers.push(mixer); a.userData.hasModel=true; a.userData.mixer=mixer;
  window.__A=a; window.__V=v; window.__ACTS=acts; window.__MX=mixer;
  window.__probeState = (how) => {
    const A=window.__ACTS.idle, V=window.__V;
    V.userData.animState='idle'; V.userData.animAt = performance.now() - 5000;   /* long past the crossfade grace */
    if(how==='disabled'){ A.enabled=false; }
    if(how==='clamped'){ A.loop=THREE.LoopOnce; A.clampWhenFinished=true; A.time=A.getClip().duration; }
    if(how==='zeroweight'){ A.enabled=true; A.setEffectiveWeight(0); }
    if(how==='paused'){ A.paused=true; }
    const before = { enabled:A.enabled, w:+A.getEffectiveWeight().toFixed(3), t:+A.time.toFixed(3), loop:(A.loop===THREE.LoopOnce?'once':'repeat') };
    setEnemyAnimState(window.__A, 'idle');            /* the SAME state the machine already holds */
    const after  = { enabled:A.enabled, w:+A.getEffectiveWeight().toFixed(3), t:+A.time.toFixed(3), loop:(A.loop===THREE.LoopOnce?'once':'repeat') };
    return { how, before, after, repaired: (A.enabled && !A.paused && A.getEffectiveWeight()>0.001 && A.loop!==THREE.LoopOnce) };
  };
  return { acts:Object.keys(acts).length, state:v.userData.animState };
})()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(SETUP)));
  await page.waitForTimeout(1200);
  for (const how of ['disabled', 'clamped', 'zeroweight', 'paused'])
    console.log(how.padEnd(11), JSON.stringify(await P(`window.__probeState(${JSON.stringify(how)})`)));

  // a HEALTHY state must be left completely alone — no restart, no crossfade, no time reset
  console.log('healthy    ', JSON.stringify(await P(`(function(){
    const A=window.__ACTS.idle, V=window.__V;
    V.userData.animState='idle'; V.userData.animAt = performance.now()-5000;
    A.enabled=true; A.paused=false; A.loop=THREE.LoopRepeat; A.setEffectiveWeight(1); A.time=0.42;
    setEnemyAnimState(window.__A,'idle');
    return { time:+A.time.toFixed(3), untouched: Math.abs(A.time-0.42) < 1e-9 };
  })()`)));

  // a DEATH pose must stay down: it is clamped on its final frame ON PURPOSE
  console.log('die held   ', JSON.stringify(await P(`(function(){
    const A=window.__ACTS.die, V=window.__V;
    setEnemyAnimState(window.__A,'die');
    V.userData.animAt = performance.now()-5000;
    A.time = A.getClip().duration;                       /* finished, clamped — exactly what a corpse is */
    setEnemyAnimState(window.__A,'die');
    return { state:V.userData.animState, time:+A.time.toFixed(3), stillDown: Math.abs(A.time-A.getClip().duration)<1e-9 };
  })()`)));

  // a state entered THIS INSTANT is mid-crossfade with its weight ramping from zero — it must not re-arm
  console.log('fading in  ', JSON.stringify(await P(`(function(){
    const V=window.__V, ACTS=window.__ACTS;
    setEnemyAnimState(window.__A,'run');                  /* real transition: run fades in from 0 */
    const A=ACTS.run; A.setEffectiveWeight(0);            /* the worst instant of that fade */
    const t0=A.time; let rearms=0;
    for(let i=0;i<10;i++){ const before=A.time; setEnemyAnimState(window.__A,'run'); if(A.time!==before && A.time===0) rearms++; }
    return { rearms, grace:ANIM_LIVE_GRACE, state:V.userData.animState };
  })()`)));
}, { settleMs: 9000 });
