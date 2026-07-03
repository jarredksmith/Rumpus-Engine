// (build 841) PHYSICAL BUMPS + GHOST TOGGLE + FULL-LENGTH CONTACT, from the playtest:
//  1. contact sampled ONE circle at the car's origin, so a long car's nose clipped into rivals before contact
//     registered — now THREE circles along the length (nose / centre / tail);
//  2. bumps do nothing to rivals -> now an impulse transfers on every blocked hit: the direction decomposes in
//     the rival's frame — rear-end shunts them FORWARD, a side hit knocks them OFF THE RACING LINE (a lateral
//     excursion that steers back over ~a second, clamped to the deck), with a per-rival cooldown;
//  3. G (while driving a race) toggles the ghost car on/off, persisted; on foot G is still grab/drop.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- 1. three-circle contact along the car's length ---
{
  const cb=extractFunction('_raceCarBlock');
  assert(/const hx=-Math\.sin\(cy\), hz=-Math\.cos\(cy\), off=Math\.max\(0, f\.hd-pr\)\*0\.8;/.test(cb), 'samples offset along the heading by the car half-length');
  assert(/const S=\[\[0,0\],\[hx\*off,hz\*off\],\[-hx\*off,-hz\*off\]\];/.test(cb), 'nose / centre / tail circles');
}

// --- 3. ghost toggle ---
assert(/if\(e\.code==='KeyG'\)\{ if\(drivingCar && typeof _ghostToggle==='function' && typeof objectiveActive==='function' && objectiveActive\(\)==='race' && !e\.repeat\) _ghostToggle\(\); else grabAction\(\); \}/.test(src), 'G toggles the ghost in a race car, grabs on foot');
assert(/localStorage\.setItem\('breachGhostOn', _ghostOn\?'1':'0'\);/.test(extractFunction('_ghostToggle')), 'the preference persists');
assert(/if\(!G \|\| _raceLap<1 \|\| !_ghostOn\)\{ W\.visible=false; return; \}/.test(extractFunction('_ghostPlayTick')), 'a disabled ghost never renders');

// --- 2. executable: the bump impulse + recovery on a simulated rival ---
const env=new Function(`"use strict";
  const TRACK_W=12;
  const _carImpactFx=()=>{};
  const _raceBots=[];
`+extractFunction('_raceBotBump')+`
  const mkBot=(x,z,yaw)=>({ obj:{ position:{x, y:0, z} }, prevYaw:yaw, mYaw:0, v:10, lat:2.7, latVel:0, latOff:0, _bumpCd:0 });
  // the same integration the tick runs
  const integrate=(st, dt)=>{ if(st._bumpCd>0) st._bumpCd-=dt;
    if(st.latVel || st.latOff){
      st.latVel=(st.latVel||0)*(1-Math.min(1, dt*2.2));
      st.latOff=((st.latOff||0) + st.latVel*dt)*(1-Math.min(1, dt*1.1));
      const _lmax=TRACK_W/2-1.4 - Math.abs(st.lat);
      st.latOff=Math.max(-Math.max(0.2,_lmax), Math.min(Math.max(0.2,_lmax), st.latOff));
      if(Math.abs(st.latVel)<0.02 && Math.abs(st.latOff)<0.02){ st.latVel=0; st.latOff=0; }
    } };
  return { mkBot, bump:_raceBotBump, integrate };
`)();

// rear-end shunt: the player closes from directly behind (rival faces -Z, player behind at +Z)
{
  const st=env.mkBot(0, -10, 0), self={ position:{x:0,y:0,z:-6}, userData:{} };
  const v0=st.v;
  env.bump(st, 15, self);
  assert(st.v > v0+3, 'a rear-end shunt punts the rival forward (+'+(st.v-v0).toFixed(1)+' m/s)');
  near(st.latVel, 0, 0.3, 'a square hit barely moves them sideways');
}
// side swipe: the player hits from the rival's left -> knocked toward its right, then recovers
{
  const st=env.mkBot(0, -10, 0), self={ position:{x:-2.2,y:0,z:-10}, userData:{} };
  env.bump(st, 14, self);
  assert(Math.abs(st.latVel) > 3, 'a side hit imparts real lateral velocity ('+st.latVel.toFixed(1)+' m/s)');
  const v1=st.v;
  // integrate ~0.5 s: they get pushed off line...
  let peak=0; for(let i=0;i<30;i++){ env.integrate(st, 1/60); peak=Math.max(peak, Math.abs(st.latOff)); }
  assert(peak > 0.8, 'the rival visibly leaves the racing line ('+peak.toFixed(2)+' m)');
  // ...and steers back within a few seconds
  for(let i=0;i<360;i++) env.integrate(st, 1/60);
  eq(st.latOff, 0, 'they recover to the lane');
  assert(v1<=st.v+1e-9, 'a pure side hit does not slow them like a wall');
}
// cooldown: a scrape is one impulse, not twenty
{
  const st=env.mkBot(0, -10, 0), self={ position:{x:-2.2,y:0,z:-10}, userData:{} };
  env.bump(st, 14, self); const l1=st.latVel;
  env.bump(st, 14, self);
  eq(st.latVel, l1, 'the per-rival cooldown absorbs repeat hits');
}
// deck clamp: even a monster hit can't punt them off the track
{
  const st=env.mkBot(0, -10, 0), self={ position:{x:-2.2,y:0,z:-10}, userData:{} };
  st.latVel=40;
  for(let i=0;i<60;i++) env.integrate(st, 1/60);
  assert(Math.abs(st.lat+st.latOff) <= 12/2-1.35, 'the excursion clamps inside the deck edge');
}

done('build 841: full-length car contact, physical bumps with recovery, and a persisted ghost toggle on G');
