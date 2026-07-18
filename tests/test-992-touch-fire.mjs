// (build 992) TOUCH FIRE RELIABILITY. The semi-auto latch (firingLatch) was only released by a
// document-level mouseup or the pad trigger release — the touch FIRE button never released it, so
// semi-autos on phones depended on the browser's OPTIONAL compatibility mouseup after a tap.
// Literally hit-or-miss, worst on the 170ms pistol. A fast tap could also start and end between
// two frames, so the per-frame `if(touchFiring) shoot()` gate never saw it at all. Now: a fresh
// press re-arms the latch + buffers the tap for 160ms; release re-arms too; the frame gate honours
// the buffer; a successful shot consumes it (a cooldown return does NOT — the tap fires when ready).
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- the wiring: press re-arms + buffers, release re-arms, gate honours, shot consumes ----
assert(/let touchFireBufT=0;/.test(src), 'the press-buffer timestamp exists');
assert(/touchFiring=true; firingLatch=false; touchFireBufT=performance\.now\(\)\+160;/.test(src),
  'FIRE pointerdown re-arms semi-auto and buffers the tap for 160ms');
assert(/fid=null; touchFiring=false; firingLatch=false; fire\.classList\.remove\('on'\);/.test(src),
  'FIRE release re-arms semi-auto (mirrors mouseup / pad release)');
assert(/if\(\(firing \|\| padFiring \|\| touchFiring \|\| touchFireBufT>performance\.now\(\)\)/.test(src),
  'the frame gate fires on a buffered tap even if the finger already lifted');
assert(/firingLatch = true; touchFireBufT = 0;/.test(src), 'a hitscan shot consumes the buffer');
assert(/firingLatch=true; touchFireBufT=0; lastShot=now; triggerGunAnim\('shoot'\); meleeAttack\(w\); return;/.test(src),
  'a melee swing consumes the buffer too');
assert(/touchLookDX=0; touchLookDY=0; touchFireBufT=0;/.test(src), 'the touch-state reset clears the buffer');
// the buffer sits between the cooldown check and the shot, so a mid-cooldown tap is NOT consumed
{
  const s = src.indexOf('function shoot(){'); const body = src.slice(s, s + 1600);
  const cool = body.indexOf('now - lastShot < w.fireRate');
  const consume = body.indexOf('touchFireBufT = 0;');
  assert(cool > 0 && consume > cool, 'cooldown returns BEFORE the buffer is consumed — a tap during cooldown fires when the weapon is ready');
}

// ---- executable: the tap semantics as a frame simulation (mirrors the shipped shapes above) ----
function mkSim(fireRate){
  const st = { latch:false, buf:0, touchFiring:false, lastShot:-1e9, shots:0 };
  return {
    press(t){ st.touchFiring=true; st.latch=false; st.buf=t+160; },          // pointerdown
    release(){ st.touchFiring=false; st.latch=false; },                      // fireEnd
    frame(t){                                                                // the per-frame gate + shoot()
      if(!(st.touchFiring || st.buf>t)) return;
      if(t - st.lastShot < fireRate) return;                                 // cooldown: buffer NOT consumed
      if(st.latch) return;                                                   // semi-auto latch
      st.latch=true; st.buf=0; st.lastShot=t; st.shots++;
    },
    st };
}
{ // a tap that starts AND ends between two frames still fires (the old code lost it entirely)
  const s = mkSim(170);
  s.frame(0); s.press(5); s.release(); s.frame(33);
  eq(s.st.shots, 1, 'a between-frames tap fires via the buffer');
}
{ // one press never double-fires: the buffer is spent on the shot
  const s = mkSim(170);
  s.press(0); for(let t=0;t<=400;t+=16) s.frame(t); s.release();
  eq(s.st.shots, 1, 'holding after a semi-auto shot does not refire (latch holds, buffer spent)');
}
{ // rapid taps: every tap = a shot, capped by fireRate (tap 5x at 200ms spacing -> 5 shots)
  const s = mkSim(170); let shots=0;
  for(let i=0;i<5;i++){ const t=i*200; s.press(t); s.release(); for(let f=t;f<t+200;f+=16) s.frame(f); }
  eq(s.st.shots, 5, 'five rapid taps land five shots (the reported failure case)');
}
{ // a tap landing mid-cooldown fires the moment the weapon is ready (buffered intent)
  const s = mkSim(170);
  s.press(0); s.frame(0); s.release();                    // shot at t=0
  s.press(60); s.release();                                // tap during cooldown
  for(let t=16;t<=260;t+=16) s.frame(t);
  eq(s.st.shots, 2, 'a mid-cooldown tap fires at cooldown end instead of vanishing');
}
{ // the buffer expires: a stale tap does not fire much later
  const s = mkSim(170);
  s.press(0); s.release();                                 // never framed while valid
  s.frame(300);
  eq(s.st.shots, 0, 'an expired buffer (160ms) never fires a ghost shot');
}

// ---- the desktop + pad paths are untouched ----
assert(/if\(e\.button===0\)\{ firing=false; firingLatch=false; \}/.test(src), 'mouseup release unchanged');
assert(/if\(padFiringPrev && !padFiring\) firingLatch = false;/.test(src), 'pad trigger release unchanged');

done('build 992: touch FIRE is press-accurate — re-armed latch + 160ms tap buffer');
