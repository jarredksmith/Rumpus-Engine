// build 1307 — REPORTED: "I can replicate it by rapidly hitting the left mouse button. It still deals
// damage, but doesn't play the animation. If I click, wait a second, and click again, it doesn't freeze."
//
// Reproduces exactly that on the real path: a rigged third-person body, real actions, the real
// meleeAttack -> playOwnAnim -> updateOwnAvatar -> setEnemyAnimState chain, driven at both cadences, with
// the swing action's `time` recorded every frame. A swing that replays returns to 0; one that is swallowed
// runs on (or stops dead).
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  tpMode = true; player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
  const a = ensureOwnAvatar(); if(!a) return { err:'no avatar' };
  const v = a.userData.visual; if(!v) return { err:'no visual' };
  const dummy = new THREE.Object3D(); dummy.name='animProbe'; v.add(dummy);
  const mk = (n,d) => new THREE.AnimationClip(n, d, [ new THREE.VectorKeyframeTrack('animProbe.position',[0,d],[0,0,0, 0,1,0]) ]);
  const old = v.userData.mixer; if(old){ const i=mixers.indexOf(old); if(i>=0) mixers.splice(i,1); }
  const mixer = new THREE.AnimationMixer(v);
  const acts = {};
  /* the model ships idle/walk/run/attack — no meleeHeavy, so the swing falls back to attack, which is
     the ordinary case. The clip is 1.0 s, LONGER than the crowbar's 0.5 s fire interval: that gap is the
     whole bug. */
  acts.idle = mixer.clipAction(mk('idle', 1.4));
  acts.walk = mixer.clipAction(mk('walk', 1));
  acts.run  = mixer.clipAction(mk('run', 1));
  acts.attack = mixer.clipAction(mk('attack', 1.0));
  for(const k in acts){ acts[k].enabled=false; acts[k].setEffectiveWeight(0); }
  acts.idle.enabled=true; acts.idle.setEffectiveWeight(1); acts.idle.play();
  v.userData.stateActions=acts; v.userData.animState='idle'; v.userData.animAt=0;
  v.userData.animCfg={ clipSpeed:{}, clipHold:{} };
  v.userData.mixer=mixer; mixers.push(mixer); a.userData.hasModel=true; a.userData.mixer=mixer;
  window.__A=a; window.__V=v; window.__ACTS=acts;
  curWep='crowbar';
  return { fireRate:WEAPONS.crowbar.fireRate, clip:1.0, state:v.userData.animState };
})()`;

// Drive it INSIDE the closure off requestAnimationFrame — the README's rule; polling from Node is slower
// than the frames being sampled.
const RUN = (gapMs, ms, hold) => `(function(){
  const V=window.__V, ACTS=window.__ACTS;
  V.userData.animCfg.clipHold = ${hold ? '{ attack:true }' : '{}'};
  V.userData.animState='idle'; V.userData.animAt=0; _ownEvt=null; lastShot=-1e9; _meleeT=0;
  ACTS.idle.reset().play(); ACTS.idle.setEffectiveWeight(1);
  window.__r = { swings:0, replays:0, samples:[], lastT:-1 };
  const t0 = performance.now(); let nextSwing = t0;
  const tick = () => {
    const now = performance.now();
    if(now >= nextSwing){ nextSwing = now + ${gapMs}; _meleeT = 0; lastShot = now; meleeAttack(WEAPONS.crowbar); window.__r.swings++; }
    const A = ACTS.attack;
    if(window.__r.lastT >= 0 && A.time < window.__r.lastT - 1e-6) window.__r.replays++;   /* time went BACKWARDS = the clip restarted */
    window.__r.lastT = A.time;
    window.__r.samples.push(+A.time.toFixed(2) + (A.enabled ? '' : 'x'));
    if(now - t0 < ${ms}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'running';
})()`;

const REPORT = `(function(){ const r=window.__r; const A=window.__ACTS.attack;
  return { swings:r.swings, replays:r.replays, frames:r.samples.length,
    state:window.__V.userData.animState, finalTime:+A.time.toFixed(2),
    trace:r.samples.slice(0, 46).join(' ') }; })()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(SETUP)));
  await page.waitForTimeout(1200);
  for (const [label, gap, hold] of [
    ['RAPID  (500ms, clip 1.0s)', 500, false],
    ['RAPID  + Hold on Attack   ', 500, true],
    ['SPACED (1600ms)           ', 1600, false],
    ['SPACED + Hold on Attack   ', 1600, true],
  ]) {
    await P(RUN(gap, 5200, hold));
    await page.waitForTimeout(7000);
    const r = await P(REPORT);
    console.log(label, JSON.stringify(r));
  }
}, { settleMs: 9000 });
