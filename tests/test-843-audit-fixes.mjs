// (build 843) SHIP-READINESS AUDIT FIXES — nine defects from the full gameplay-systems sweep:
//  1. dropClient leaked a leaver's carried prop (_remoteHold velocity-drove it at a stale target forever)
//     and left them in the race standings (_raceNet). Both purged on drop.
//  2. race rivals + the ghost bypass removeProp, so their AnimationMixers leaked into mixers[] on every race
//     teardown (ticked forever). _raceClearBots now drops them.
//  3. _racePathAt null-guards — a late async car load can outlive the race teardown.
//  4. the enemy FIRE-GATE raycasts (initial shot + burst re-aims) were the last unbudgeted casts in the wave
//     loop — a synced volley could spike a frame. Both now draw from _losBudget.
//  5. netInterpolate allocated a Vector3 per dynamic prop per frame — scratch vector now.
//  6. alt-tab / focus loss cleared audio but not INPUT — a lost keyup left the player auto-walking. Both the
//     visibilitychange handler and a window blur listener now clearMovementInput().
//  7. the enemy-vs-dynamic-prop loop ran Math.hypot per enemy per prop per frame — squared coarse reject first.
//  8. a dead per-frame `new THREE.Vector3()` at the top of the enemy loop — removed.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// 1. dropClient cleanup
const dc = extractFunction('dropClient');
assert(/for\(const nid in _remoteHold\)\{ if\(_remoteHold\[nid\] && _remoteHold\[nid\]\.by===pid\) delete _remoteHold\[nid\]; \}/.test(dc), 'a leaver’s carried props are released');
assert(/if\(typeof _raceNet!=='undefined'\) delete _raceNet\[pid\];/.test(dc), 'leavers drop out of the race standings');

// 2. race actor mixer cleanup
const rcb = extractFunction('_raceClearBots');
assert(/const _dropMixer=\(o\)=>\{ if\(o\.userData\.mixer\)\{ const mi=mixers\.indexOf\(o\.userData\.mixer\); if\(mi>=0\) mixers\.splice\(mi,1\); o\.userData\.mixer=null; \} \};/.test(rcb), 'race actors drop their mixers');
eq((rcb.match(/_dropMixer\((?:o|g)\)/g)||[]).length, 2, 'applied to the rival loop and the ghost');

// 3. _racePathAt teardown guard
assert(/if\(!_racePath\) return \{ x:0, y:-1000, z:0, yaw:0, pitch:0, vmax:0 \};/.test(extractFunction('_racePathAt')), 'a late async load cannot null-deref the torn-down path');

// 4. budgeted fire-gate raycasts
{
  const m=src.match(/_losBudget>0[\s\S]{0,240}?\(_losBudget--, !segmentBlocked\(/g);
  assert(m && m.length===2, 'both fire-gate casts (initial + burst) draw from the LOS budget (found '+(m?m.length:0)+')');
}

// 5. netInterpolate scratch vector
assert(/const _netLerpV = new THREE\.Vector3\(\);/.test(src), 'scratch vector hoisted');
assert(/_netLerpV\.set\(tp\[0\],tp\[1\],tp\[2\]\); o\.position\.lerp\(_netLerpV, k\);/.test(src), 'the per-prop lerp reuses it');
assert(!/o\.position\.lerp\(new THREE\.Vector3\(tp\[0\]/.test(src), 'the per-frame allocation is gone');

// 6. input cleared on focus loss
assert(/visibilitychange[\s\S]{0,220}clearMovementInput\(\)/.test(src), 'tab-hide clears held movement keys');
assert(/addEventListener\('blur', \(\)=>\{ if\(typeof clearMovementInput==='function'\) clearMovementInput\(\); \}\);/.test(src), 'window blur clears them too');

// 7. squared coarse reject in the enemy-vs-prop loop (executable check of the math)
assert(/const minD = eR \+ \(info\.radius\|\|0\.5\), d2 = dx\*dx \+ dz\*dz;\s*\n\s*if\(d2 >= minD\*minD \|\| d2 <= 1e-8\) continue;/.test(src), 'no hypot until an actual overlap');
{
  const resolve=(ex,ez,px,pz,eR,pr)=>{ let dx=ex-px, dz=ez-pz; const minD=eR+pr, d2=dx*dx+dz*dz;
    if(d2>=minD*minD || d2<=1e-8) return [ex,ez];
    const d=Math.sqrt(d2), push=minD-d; return [ex+dx/d*push, ez+dz/d*push]; };
  eq(resolve(10,0, 0,0, 0.8,0.6).join(','), '10,0', 'far apart: untouched (and no hypot paid)');
  const [nx]=resolve(1,0, 0,0, 0.8,0.6);
  assert(Math.abs(nx-1.4)<1e-9, 'overlapping: pushed out to exactly the contact distance');
}

// 8. the dead allocation is gone
assert(!/const _eDir = new THREE\.Vector3\(\);/.test(src), 'the unused per-frame Vector3 in the enemy loop is removed');

done('build 843: ship-readiness fixes — leaks plugged, budgets enforced, inputs unstick, hot loops allocation-free');
