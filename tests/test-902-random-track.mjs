// (build 902) RANDOM TRACK — "a 'build random track' option that makes a perfect loopable race track
// that utilizes all of the track pieces." One click: a random harmonic blob goes through the sketch
// fitter (closure by construction; only exactly-closed rolls are accepted), then the loop is spiced —
// some 90° corners become BANKED (identical exit geometry, drop-in swaps; at least one guaranteed) and
// one full-straight pair becomes ramp UP + ramp DOWN with the run between riding the +6m upper deck.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// wiring
assert(/<span>Random track<\/span>/.test(src) && /rtb\.onclick=\(\)=>\{ buildRandomTrack\(\); \};/.test(src), 'the track panel has the Random track button (SVG die, no color emoji — build 816 rule)');
assert(/pc\.y\|\|0, pc\.z/.test(extractFunction('_placeSketchTrack', src)), 'placement honors per-piece elevation (the upper deck)');

// executable: seeded rng -> a full-kit, exactly-closed circuit
const helpers=['_tkResample','_tkSmooth','_tkRdp','_tkSimplify','_tkArea','_fitTrackFromSketch','_randomTrackFit'].map(n=>extractFunction(n, src)).join('\n');
const gen=new Function('TRACK_R', `"use strict";\n${helpers}\nreturn _randomTrackFit;`)(18);
const mkRng=(seed)=>{ let a=seed|0; return ()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; };
const DEFS={ track_start:{len:16}, track_straight:{len:24}, track_short:{len:8},
  track_curve45_l:{arc:Math.PI/4,dir:1}, track_curve45_r:{arc:Math.PI/4,dir:-1},
  track_curve_l:{arc:Math.PI/2,dir:1}, track_curve_r:{arc:Math.PI/2,dir:-1},
  track_bank_l:{arc:Math.PI/2,dir:1}, track_bank_r:{arc:Math.PI/2,dir:-1},
  track_ramp_up:{len:24,rise:6}, track_ramp_dn:{len:24,rise:-6} };
const exitPose=(p)=>{ const d=DEFS[p.key]; const e=(d.arc!=null)
  ? { x:-d.dir*18*(1-Math.cos(d.arc)), z:-18*Math.sin(d.arc), yaw:d.dir*d.arc, dy:0 }
  : { x:0, z:-d.len*(p.sz||1), yaw:0, dy:d.rise||0 };
  const c=Math.cos(p.yaw), s=Math.sin(p.yaw);
  return { x:p.x+e.x*c+e.z*s, z:p.z-e.x*s+e.z*c, y:(p.y||0)+e.dy, yaw:p.yaw+e.yaw }; };
let sawRamps=false, sawBank=false;
for(const seed of [7, 1234, 999]){
  const fit=gen(mkRng(seed));
  assert(fit && fit.pieces && fit.pieces.length>8, 'seed '+seed+': a circuit rolls');
  eq(fit.err, 0, 'seed '+seed+': only exactly-closed rolls are accepted');
  eq(fit.pieces.filter(p=>p.key==='track_start').length, 1, 'seed '+seed+': one start line');
  assert(fit.pieces.every(p=>DEFS[p.key]), 'seed '+seed+': only real piece kinds');
  const ups=fit.pieces.filter(p=>p.key==='track_ramp_up').length, dns=fit.pieces.filter(p=>p.key==='track_ramp_dn').length;
  eq(ups, dns, 'seed '+seed+': ramps come in matched pairs (the loop returns to grade)');
  if(ups) sawRamps=true;
  if(fit.pieces.some(p=>p.key==='track_bank_l'||p.key==='track_bank_r')) sawBank=true;
  // 3D socket walk: every junction (including elevation) within the race chain tolerance
  let maxGap=0;
  for(let i=0;i<fit.pieces.length;i++){
    const e=exitPose(fit.pieces[i]); const nx=fit.pieces[(i+1)%fit.pieces.length];
    maxGap=Math.max(maxGap, Math.hypot(e.x-nx.x, e.z-nx.z, e.y-(nx.y||0)));
  }
  assert(maxGap<0.05, 'seed '+seed+': the loop chains EXACTLY, elevation included (worst '+maxGap.toFixed(3)+'m)');
}
assert(sawBank, 'banked corners appear (at least one guaranteed per roll)');
assert(sawRamps, 'a ramp section appears across the sample seeds');

done('build 902: one click, a random full-kit circuit — closed exactly, banked, with an upper deck');
