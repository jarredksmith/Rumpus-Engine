// (build 837) LOOPS THAT ACTUALLY CLOSE. Root cause of "always a little off": piece lengths were 24 / 8 / 12
// (start) — the 12 isn't a multiple of 8, so ANY rectangular loop containing a start line missed by exactly
// 4 m, forever. Two fixes:
//  1. the start line is now 16 m — every piece length is a multiple of 8, so rectangles close naturally;
//  2. a CLOSE LOOP button: walks the chain backward from the anchor to its first piece, measures the end gap
//     in the exit frame, and bridges a pure forward gap with ONE straight scaled to exactly the gap length.
//     Gaps a straight can't fix get a specific toast: headings differ / sideways offset / height mismatch.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- pins ---
assert(/track_start:\s*\{ label:'Start line', len:16, start:true,/.test(src), 'the start line is 16 m (mod-8 clean)');
assert(/clb\.textContent='Close loop';/.test(src) && /clb\.onclick=\(\)=>\{ closeTrackLoop\(\); \};/.test(src), 'the palette has a Close loop button');
assert(/<b>Close loop<\/b> bridges the final gap exactly/.test(src), 'the hint teaches it');

// --- executable: the real defs + closeTrackLoop in a sandbox ---
const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
const mk=()=>new Function(`"use strict";
  const propModels=[], toasts=[]; let spawned=null;
  const editorTargets={ props:{ idx:-1 } }; let editorActive='props'; let selProps=[];
  const flashToast=(t)=>toasts.push(t);
  const pushUndoSnapshot=()=>{}; const renderEditorFields=()=>{};
  const spawnProp=(s,t,cb)=>{ const o={ userData:{src:s}, position:{x:t[0],y:t[1],z:t[2]}, rotation:{y:t[4]}, scale:{x:t[6],y:t[7],z:t[8]} };
    propModels.push(o); spawned={src:s,t}; cb(o); };
`+src.slice(defsStart, defsEnd)+'\n'+extractFunction('_trackExitPose')+'\n'+extractFunction('closeTrackLoop')+`
  let pose={x:0,y:0,z:0,yaw:0};
  const place=(k,sz)=>{ const o={ userData:{src:k}, position:{x:pose.x,y:pose.y,z:pose.z}, rotation:{y:pose.yaw}, scale:{x:1,y:1,z:sz||1} };
    propModels.push(o); pose=_trackExitPose(o); return o; };
  return { place, pose:()=>pose, close:()=>{ closeTrackLoop(); return { spawned, toasts:toasts.slice() }; },
    exitOf:(o)=>_trackExitPose(o), TRACK_PIECES };`)();

// 1. the 16 m start makes a natural rectangle close EXACTLY: start+short(24) vs straight(24)
{
  const env=mk();
  env.place('track_start'); env.place('track_short'); env.place('track_curve_l'); env.place('track_curve_l');
  env.place('track_straight'); env.place('track_curve_l'); env.place('track_curve_l');
  const p=env.pose();
  near(p.x, 0, 1e-9, 'a mod-8 rectangle returns to the start x — no more 4 m ghost gap');
  near(p.z, 0, 1e-9, '...and z');
}

// 2. Close loop bridges a pure forward gap with one exactly-scaled straight
{
  const env=mk();
  // the CLASSIC broken rectangle: 16 m start side vs a 24 m back straight — the return leg lands 8 m
  // short of the start's entry, facing it dead-on. One click should bridge exactly 8 m.
  env.place('track_start'); env.place('track_curve_l'); env.place('track_curve_l');
  env.place('track_straight'); env.place('track_curve_l'); env.place('track_curve_l');
  const r=env.close();
  assert(r.spawned && r.spawned.src==='track_straight', 'the bridge is a straight');
  near(r.spawned.t[8]*24, 8, 1e-6, 'scaled to exactly the 8 m gap');
  near(r.spawned.t[0], 0, 1e-6, 'placed at the open exit (x)');
  near(r.spawned.t[2], 8, 1e-6, 'placed at the open exit (z), facing the start entry');
  assert(r.toasts.some(t=>/Loop closed/i.test(t)), 'confirms the closure');
}

// 3. guidance: heading mismatch and sideways offsets are named, not silently bridged
{
  const env=mk();
  env.place('track_start'); env.place('track_curve_l');   // 90° open — headings differ
  const r=env.close();
  assert(!r.spawned, 'no blind bridge when headings differ');
  assert(r.toasts.some(t=>/different directions/i.test(t)), 'says the headings differ');
}
{
  const env=mk();
  // parallel headings but the chain start sits 2.5 m sideways of the return leg's line
  const a=env.place('track_start'); env.place('track_curve_l'); env.place('track_curve_l');
  env.place('track_straight'); env.place('track_curve_l'); env.place('track_curve_l');
  a.position.x+=2.5;
  const r=env.close();
  assert(!r.spawned, 'no blind bridge across a sideways miss');
  assert(r.toasts.some(t=>/sideways/i.test(t)), 'says the ends are offset sideways');
}
{
  const env=mk();
  const a=env.place('track_start'); env.place('track_curve_l'); env.place('track_curve_l');
  env.place('track_straight'); env.place('track_curve_l'); env.place('track_curve_l');
  a.position.y+=2;   // raise the chain start
  const r=env.close();
  assert(r.toasts.some(t=>/height/i.test(t)), 'says the heights differ');
}

// 4. an already-closed loop is recognized
{
  const env=mk();
  env.place('track_start'); env.place('track_short'); env.place('track_curve_l'); env.place('track_curve_l');
  env.place('track_straight'); env.place('track_curve_l'); env.place('track_curve_l');
  const r=env.close();
  assert(r.toasts.some(t=>/already closed/i.test(t)), 'a closed loop is left alone');
}

done('build 837: loops close — 16 m start line (mod-8 lengths) + a Close-loop bridge with honest guidance');
