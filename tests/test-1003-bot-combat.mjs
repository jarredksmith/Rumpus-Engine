// (build 1003) BOTS FIGHT LIKE PLAYERS — the two biggest "that's a bot" tells, fixed.
// HUMAN AIM: acquiring a target (after >0.4s lost) spikes the aim error and imposes a 180-350ms
// reaction pause before the first shot; unbroken time-on-target settles the spread toward a floor
// (~0.9s); the bot's own movement loosens it. COVER RETREAT: a hurt bot samples a ring of
// standable points and backs off to one that BREAKS line-of-sight, not straight into open ground.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: _botFindCover against a mock world ----
// World: a wall at x=5 blocks sight between x<5 and x>5. Target at (10,0). Bot at (2,0).
// Points with x<5 are hidden from the target; standable everywhere except a hole at (2,-6)..(2,6)? keep simple.
const fn = extractFunction('_botFindCover');
function mkCover(losFn, clearFn){
  const env = { ARENA: 70, clearAt: clearFn || (() => true), _botLOS: losFn, Math };
  return new Function(...Object.keys(env), 'return (' + fn + ')')(...Object.values(env));
}
{ // hidden hemisphere exists -> picks a spot the target cannot see, on the bot's side
  const los = (x, z, tx, tz) => x >= 5;                    // anything at x>=5 is visible to the target
  const cover = mkCover(los)({ pos: { x: 2, y: 0, z: 0 } }, { pos: { x: 10, z: 0 } });
  assert(cover && cover.x < 5, 'the chosen spot breaks line-of-sight (behind the wall)');
  assert(cover.x < 2 + 0.01 || Math.abs(cover.z) > 0, 'and lies away from the target, not through it');
}
{ // open field (everything visible) -> no cover found, caller falls back to straight-away
  const cover = mkCover(() => true)({ pos: { x: 0, y: 0, z: 0 } }, { pos: { x: 10, z: 0 } });
  eq(cover, null, 'no cover in an open field -> null (the retreat falls back to moving away)');
}
{ // unstandable spots are never chosen
  const los = () => false;                                  // everything is hidden…
  const clear = (x, z) => false;                            // …but nothing is standable
  const cover = mkCover(los, clear)({ pos: { x: 0, y: 0, z: 0 } }, { pos: { x: 10, z: 0 } });
  eq(cover, null, 'unstandable spots are rejected even if hidden');
}

// ---- executable: the aim model as a frame simulation (mirrors the shipped shapes below) ----
function mkAim(){
  const b = {};
  return { b, tick(hasLOS, dt){
    if(!hasLOS){ b._noLosT=(b._noLosT||0)+dt; b._aimErr=1; }
    else {
      if((b._noLosT||0)>0.4){ b._aimErr=1; b._reactT=0.18+0.1; }
      b._noLosT=0;
      b._aimErr=Math.max(0.15, (b._aimErr==null?1:b._aimErr) - dt/0.9);
    }
    if(b._reactT>0) b._reactT-=dt;
  } };
}
{ // fresh acquisition: reaction pause blocks the first shot, then error settles to the floor
  const a = mkAim();
  for(let t=0;t<1;t+=0.016) a.tick(false, 0.016);          // a second without sight
  a.tick(true, 0.016);                                      // target appears
  assert(a.b._reactT > 0.1, 'a human reaction beat gates the first shot');
  assert(a.b._aimErr > 0.9, 'aim error spikes on acquisition');
  for(let t=0;t<1.2;t+=0.016) a.tick(true, 0.016);          // tracking for 1.2s
  near(a.b._aimErr, 0.15, 0.02, 'unbroken tracking settles the error to the floor');
  assert(a.b._reactT <= 0, 'the reaction pause has elapsed');
}
{ // a brief flicker of lost sight does NOT re-impose the reaction pause (only real lost time does)
  const a = mkAim();
  for(let t=0;t<1.2;t+=0.016) a.tick(true, 0.016);
  a.tick(false, 0.1); a.tick(true, 0.016);                  // 100ms occlusion flicker
  assert(!(a.b._reactT > 0), 'a sub-0.4s flicker never re-imposes the reaction beat');
  assert(a.b._aimErr > 0.9, 'but the error still resets while sight is broken (no wallhack tracking)');
}

// ---- the shipped wiring matches the simulated shapes ----
assert(/if\(!hasLOS\)\{ b\._noLosT=\(b\._noLosT\|\|0\)\+dt; b\._aimErr=1; \}/.test(src), 'no-LOS accrues lost time + maxes the error');
assert(/if\(\(b\._noLosT\|\|0\)>0\.4\)\{ b\._aimErr=1; b\._reactT=0\.18\+Math\.random\(\)\*0\.17; \}/.test(src),
  'real lost time -> spike + 180-350ms reaction');
assert(/b\._aimErr=Math\.max\(0\.15, \(b\._aimErr==null\?1:b\._aimErr\) - dt\/0\.9\);/.test(src), 'the settle curve');
assert(/if\(tgt && wantFire && b\.fireCd<=0 && !\(b\._reactT>0\)\)\{/.test(src), 'the fire gate honors the reaction beat');
assert(/const _esp=D\.spread\*\(0\.5 \+ 1\.8\*\(b\._aimErr==null\?0\.4:b\._aimErr\)\) \+ \(_moved>0\.02 \? D\.spread\*0\.5 : 0\);/.test(src),
  'effective spread = settle-in error + a run-and-gun movement penalty');
assert(/if\(!b\._cover \|\| b\._coverT<=0\)\{ b\._cover=_botFindCover\(b, tgt\); b\._coverT=1\.4; \}/.test(src),
  'retreat picks cover on entry + a slow revalidate (rare raycasts, never per-frame)');
assert(/b\.aiState='engage'; b\.aiT=0; b\._cover=null;/.test(src), 'leaving retreat drops the cover claim');
assert(/no cover anywhere \(open field\) -> move directly away/.test(src), 'the old straight-away path survives as the fallback');

done('build 1003: human aim (settle-in + reaction beat) and retreat-to-cover');
