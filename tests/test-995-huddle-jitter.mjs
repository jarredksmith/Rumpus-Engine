// (build 995) HUDDLE / PROP VIBRATION. Two stacked causes: crowd separation applied its FULL
// half-gap correction instantly every frame (pair corrections fight -> visible teleport-vibrate),
// and the walk/run-vs-idle animation state was picked from RAW per-frame displacement (>0.012), so
// those shoves flipped the state machine every frame — the "animation stuck in a super-fast loop"
// look. Fixes: cap the shove at a slide speed; judge locomotion on a smoothed displacement with a
// hysteresis band. The build-977 escalating wall-follow + full-repath reroute is unchanged.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- separation is a slide now ----
assert(/const push=Math\.min\(\(minD-d\)\*0\.5, 3\.5\*dt\), nx=dx\/d, nz=dz\/d;/.test(src),
  'the separation shove is capped at a 3.5 m/s slide (was an uncapped instant correction)');
assert(/if\(d < 1e-4\)\{ dx=Math\.cos\(enemies\[i\]\.id\*1\.7\); dz=Math\.sin\(enemies\[i\]\.id\*1\.7\); d=1; \}/.test(src),
  'the deterministic exact-overlap nudge is unchanged');

// ---- locomotion hysteresis ----
assert(/en\._mvAvg = \(en\._mvAvg==null\) \? moved : en\._mvAvg \+ \(moved - en\._mvAvg\)\*Math\.min\(1, dt\*12\);/.test(src),
  'displacement is smoothed (~80ms) before the state pick');
assert(/else if\(en\._mvAvg > 0\.012\)\{ st = en\._chase \? 'run' : 'walk'; en\._locoSt = st; \}/.test(src)
    && /else if\(en\._mvAvg > 0\.006 && \(en\._locoSt==='run' \|\| en\._locoSt==='walk'\)\) st = en\._locoSt;/.test(src),
  'hysteresis band 0.006-0.012 keeps the current verdict instead of flickering');
assert(/if\(en\._evt && nowMs < en\._evt\.until\) st = en\._evt\.slot;/.test(src) && /else if\(en\._attackT && nowMs < en\._attackT\) st = 'attack';/.test(src),
  'flinch and attack windows still outrank locomotion');

// ---- the reroute machinery this exposes is intact (build 977 escalation) ----
assert(/if\(en\._stuckT>1\.2 && !en\._sFlip1\)\{ en\._sFlip1=1; en\._stuckSide\*=-1; \}/.test(src),
  'wall-follow flips sides at 1.2s stuck');
assert(/if\(en\._stuckT>3\.6\)\{ en\._nav=null; en\._pathBlk=true; en\._pbT=0; en\._stuckT=0\.3; en\._sFlip1=0; en\._sFlip2=0; \}/.test(src),
  'a fully wedged enemy recomputes its route from scratch at 3.6s (the reroute)');

// ---- executable: the state machine cannot flicker under oscillating displacement ----
function mkPicker(){
  // mirrors the shipped shapes asserted above
  return (en, moved, dt) => {
    en._mvAvg = (en._mvAvg==null) ? moved : en._mvAvg + (moved - en._mvAvg)*Math.min(1, dt*12);
    let st;
    if(en._mvAvg > 0.012){ st = en._chase ? 'run' : 'walk'; en._locoSt = st; }
    else if(en._mvAvg > 0.006 && (en._locoSt==='run' || en._locoSt==='walk')) st = en._locoSt;
    else { st = 'idle'; en._locoSt = 'idle'; }
    return st;
  };
}
{ // vibration profile: displacement alternates 0.03 / 0.001 every frame (the old code flip-flopped)
  const pick = mkPicker(); const en = { _chase: true };
  const states = []; let flips = 0, last = null;
  for(let f=0; f<60; f++){ const st = pick(en, (f%2) ? 0.03 : 0.001, 0.016); states.push(st); if(last && st!==last) flips++; last = st; }
  assert(flips <= 2, 'oscillating displacement settles to a steady state ('+flips+' flips in 60 frames; the raw picker flipped ~30x)');
}
{ // a real stop still reads as idle promptly
  const pick = mkPicker(); const en = { _chase: true };
  for(let f=0; f<30; f++) pick(en, 0.1, 0.016);          // running hard
  let st; for(let f=0; f<30; f++) st = pick(en, 0, 0.016);   // dead stop ~0.5s
  eq(st, 'idle', 'a genuinely stopped enemy reaches idle within half a second');
}
{ // a real walk still reads as moving
  const pick = mkPicker(); const en = { _chase: false };
  let st; for(let f=0; f<30; f++) st = pick(en, 0.05, 0.016);
  eq(st, 'walk', 'steady patrol movement reads as walk');
}

done('build 995: huddles slide instead of vibrating; locomotion animation cannot flicker');
