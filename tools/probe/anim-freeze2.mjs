// REPORTED, still, after build 1304: "it freezes the animation on idle after I use the weapon a few times.
// The character just gets stuck in the idle position, no animation, but I can still move them around."
//
// The stock third-person body is the stylised capsule and carries NO stateActions, which is why 1304 was
// reasoned rather than reproduced. So SYNTHESISE a rigged body: real AnimationClips, a real AnimationMixer,
// registered in the real `mixers` array — then drive the REAL frame loop through a real melee sequence and
// record, per frame, every action's enabled/weight/time and the mixer's own clock. Whatever is frozen shows
// up in that table.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  tpMode = true;
  player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
  const a = ensureOwnAvatar(); if(!a) return { err:'no avatar' };
  const v = a.userData.visual; if(!v) return { err:'no visual' };
  /* a clip per slot, each moving a harmless dummy so the mixer has real work and a readable clock */
  const dummy = new THREE.Object3D(); dummy.name = 'animProbe'; v.add(dummy);
  const mk = (name, dur) => new THREE.AnimationClip(name, dur, [
    new THREE.VectorKeyframeTrack('animProbe.position', [0, dur], [0,0,0, 0,1,0]) ]);
  /* deliberately a PARTIAL set — the shipped low-poly avatars are partial, and the fallback chain is
     exactly what build 1304 was about. No moveStop, no idleFidget, no per-weapon attack. */
  const SLOTS = ['idle','walk','run','sprint','attack','jump','fall','crouch','die','reload'];
  const old = v.userData.mixer; if(old){ const i = mixers.indexOf(old); if(i>=0) mixers.splice(i,1); }
  const mixer = new THREE.AnimationMixer(v);
  const acts = {};
  for(const s of SLOTS){ const ac = mixer.clipAction(mk(s, 1)); ac.enabled = false; ac.setEffectiveWeight(0); acts[s] = ac; }
  acts.idle.enabled = true; acts.idle.setEffectiveWeight(1); acts.idle.play();
  v.userData.stateActions = acts; v.userData.animState = 'idle';
  v.userData.animCfg = v.userData.animCfg || {};
  v.userData.mixer = mixer; mixers.push(mixer);
  a.userData.hasModel = true; a.userData.mixer = mixer;
  window.__A = a; window.__V = v; window.__ACTS = acts; window.__MX = mixer;
  return { slots:SLOTS.length, mixers:mixers.length, tp:!!tpActive(), state:v.userData.animState };
})()`;

// A recorder INSIDE the closure. Never poll per-frame state from Node (README).
const RECORD = (frames, script) => `(function(){
  window.__log = [];
  const V = window.__V, ACTS = window.__ACTS, MX = window.__MX;
  let n = 0;
  const SCRIPT = ${JSON.stringify(script)};
  const tick = () => {
   try{
    const step = SCRIPT[Math.min(n, SCRIPT.length-1)];
    if(step === 'swing'){ lastShot = performance.now(); _meleeT = 0; if(typeof meleeAttack==='function') meleeAttack(WEAPONS.crowbar); }
    if(step === 'move'){ player.pos.z -= 0.12; }
    const live = [];
    for(const k in ACTS){ const A = ACTS[k];
      if(A.enabled || A.getEffectiveWeight() > 0.001) live.push(k + ':' + (A.enabled?'E':'-') + A.getEffectiveWeight().toFixed(2) + '@' + A.time.toFixed(2)); }
    window.__log.push({ f:n, step, st:V.userData.animState, mx:+MX.time.toFixed(2), live:live.join(' ') });
    n++;
   }catch(e){ window.__err = String(e && e.stack || e); }
    if(n < ${frames}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'recording';
})()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(SETUP)));
  await page.waitForTimeout(1500);

  const script = [];
  for (let i = 0; i < 6; i++) { script.push('swing'); for (let j = 0; j < 22; j++) script.push('idle'); }
  for (let i = 0; i < 40; i++) script.push('move');
  for (let i = 0; i < 20; i++) script.push('idle');

  await P(RECORD(script.length + 4, script));
  await page.waitForTimeout(Math.max(9000, script.length * 60));
  console.log('err:', JSON.stringify(await P('window.__err || null')), 'frames:', JSON.stringify(await P('window.__log.length')), 'gameFrame:', JSON.stringify(await P('typeof _frameNo!=="undefined" ? _frameNo : null')));
  const log = await P('window.__log.map(r=>r.f+" "+r.step.padEnd(6)+" st="+String(r.st).padEnd(8)+" mx="+r.mx+"  "+r.live)');
  for (const l of log) console.log(l);
}, { settleMs: 9000 });
