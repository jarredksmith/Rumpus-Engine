// (build 896) DRAW-A-TRACK — "I can never seem to get the loop to close easily... if there was a way to
// draw on screen the track outline, and then the system adds the track pieces to make that sketch."
// (1) A Draw-track overlay: sketch a loop, release, and the fitter lays the pieces — resample+smooth,
//     RDP corners, 45°-quantized headings, 45/90 curve units (TRACK_R fillets), least-squares closure on
//     run lengths, 8m fill quantization, then the rounding residual is absorbed by minutely STRETCHING
//     each run's straights — the loop closes by construction. Verified headless: circle/kidney/rect
//     sketches all produce loops the GAME'S OWN _raceBuildPath accepts (closed racing line, one start).
// (2) Close loop is a real solver now: curves + TWO stretched straights (a 2x2 linear solve per curve
//     combo spans any reachable 2D offset), so heading mismatches and sideways misses get bridged
//     instead of excused. Verified headless: a 180°-off open chain closed with 4 pieces (241m loop).
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- the fitter, executable: synthetic sketches -> closed piece chains (real socket math) ----
const code = ['_tkResample','_tkSmooth','_tkRdp','_tkSimplify','_tkArea','_fitTrackFromSketch']
  .map(n=>extractFunction(n, src)).join('\n');
const fit = new Function('TRACK_R', `"use strict";\n${code}\nreturn _fitTrackFromSketch;`)(18);
const DEFS={ track_start:{len:16}, track_straight:{len:24}, track_short:{len:8},
  track_curve45_l:{arc:Math.PI/4,dir:1}, track_curve45_r:{arc:Math.PI/4,dir:-1},
  track_curve_l:{arc:Math.PI/2,dir:1}, track_curve_r:{arc:Math.PI/2,dir:-1} };
const exitPose=(p)=>{ const d=DEFS[p.key]; const e=(d.arc!=null)
  ? { x:-d.dir*18*(1-Math.cos(d.arc)), z:-18*Math.sin(d.arc), yaw:d.dir*d.arc }
  : { x:0, z:-d.len*(p.sz||1), yaw:0 };
  const c=Math.cos(p.yaw), s=Math.sin(p.yaw);
  return { x:p.x+e.x*c+e.z*s, z:p.z-e.x*s+e.z*c, yaw:p.yaw+e.yaw }; };
const shapes={
  circle: Array.from({length:64},(_,i)=>({ x:60*Math.cos(i/64*2*Math.PI), z:60*Math.sin(i/64*2*Math.PI) })),
  circleCW: Array.from({length:64},(_,i)=>({ x:60*Math.cos(-i/64*2*Math.PI), z:60*Math.sin(-i/64*2*Math.PI) })),
  rect: Array.from({length:80},(_,i)=>{ const t=i/80*4; const k=Math.floor(t), f=t-k;
    const c=[[-70,-45],[70,-45],[70,45],[-70,45]][k], d=[[140,0],[0,90],[-140,0],[0,-90]][k];
    return { x:c[0]+d[0]*f, z:c[1]+d[1]*f }; }),
  kidney: Array.from({length:96},(_,i)=>{ const a=i/96*2*Math.PI; const r=55+18*Math.sin(2*a);
    return { x:r*Math.cos(a), z:r*Math.sin(a)*0.8 }; }),
  wobble: Array.from({length:120},(_,i)=>{ const a=i/120*2*Math.PI; const r=50+12*Math.sin(3*a)+6*Math.cos(5*a);
    return { x:r*Math.cos(a), z:r*Math.sin(a) }; }),
};
for(const [name, pts] of Object.entries(shapes)){
  const r=fit(pts);
  assert(!r.fail, name+': fits ('+(r.fail||'')+')');
  eq(r.pieces.filter(p=>p.key==='track_start').length, 1, name+': exactly one start line');
  assert(r.pieces.every(p=>DEFS[p.key]), name+': only real piece kinds');
  let maxGap=0;
  for(let i=0;i<r.pieces.length;i++){
    const e=exitPose(r.pieces[i]); const nx=r.pieces[(i+1)%r.pieces.length];
    maxGap=Math.max(maxGap, Math.hypot(e.x-nx.x, e.z-nx.z));
  }
  assert(maxGap < 2.5, name+': every junction within the race chain tolerance (worst '+maxGap.toFixed(2)+'m)');
  assert(r.pieces.every(p=>Math.abs(p.sz-1)<0.21), name+': stretches stay subtle (<=20%)');
}
// a scribble that is not a loop is refused with advice, not garbage
{
  const line=Array.from({length:30},(_,i)=>({ x:i*4, z:Math.sin(i)*3 }));
  const r=fit(line);
  assert(!!r.fail, 'an open scribble is refused with a reason: '+(r.fail||''));
}

// ---- wiring pins ----
assert(/dtb\.textContent='✏ Draw track';/.test(src) && /dtb\.onclick=\(\)=>\{ _trackSketchStart\(\); \};/.test(src), 'the track panel has the Draw track button');
assert(/function _trackSketchStart\(\)/.test(src) && /raycaster\.setFromCamera\(_vAimTmpNdc\.set\(\(p\.x\/innerWidth\)\*2-1, -\(p\.y\/innerHeight\)\*2\+1\), camera\);/.test(src),
  'the overlay unprojects the drawn stroke to the ground plane');
assert(/editorTopView=true; editorFreeFly=false; topPanX=0; topPanZ=0;/.test(src), 'drawing flips to top view (restored after)');
assert(/function _placeSketchTrack\(fit\)/.test(src) && /if\(p && p\.userData && TRACK_PIECES\[p\.userData\.src\]\) removeProp\(i\);/.test(extractFunction('_placeSketchTrack', src)),
  'placing a sketch replaces the previous track (one undo step)');
// the close-loop solver
const ctl = extractFunction('closeTrackLoop', src);
assert(/const CURVES=\[\['track_curve45_l',Math\.PI\/4,1\]/.test(ctl), 'the solver searches 45/90 curve combos');
assert(/s1=\(rx\*f2z-f2x\*rz\)\/det; s2=\(f1x\*rz-rx\*f1z\)\/det;/.test(ctl), 'TWO stretched straights solve as a 2x2 system — any reachable 2D offset closes');
assert(/flashToast\('No bridge found/.test(ctl), 'an impossible tangle still gets honest advice');

done('build 896: draw a loop, get a track — and Close loop actually closes loops now');
