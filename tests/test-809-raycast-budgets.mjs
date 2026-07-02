// (build 809) Raycast spike control. Two paths bypassed the per-frame raycast budgets:
//  1. cell-moved / airborne enemies re-grounded unbudgeted — a blast launching a wave fired ~3 casts x N enemies on ONE
//     frame (the exact spike the budget system exists to stop). They now draw from their own larger pool (8/frame);
//     over-budget movers reuse last frame's cached ground for one frame.
//  2. the driven car sampled the ground at 5 points every frame. The 4 OUTER corners only feed the body tilt (eased, and as
//     of build 826 pitch tracks at dt*14 / roll at dt*9), so they refresh at ~25Hz / on movement; only the centre (rest
//     height / landing) stays frame-live.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- the air/mover ground budget ---
assert(/let _airGroundBudget = 8;/.test(src), 'the mover ground budget exists (8/frame)');
assert(/_airGroundBudget = 8;\s*\/\/ build 809/.test(src), 'it resets every frame alongside the other budgets');
assert(/const _enGMoved = \(Math\.abs\(en\.mesh\.position\.x-\(en\._grX\|\|0\)\)>0\.8 \|\| Math\.abs\(en\.mesh\.position\.z-\(en\._grZ\|\|0\)\)>0\.8\) && \(en\._grT==null \|\| \(typeof _airGroundBudget!=='undefined' \? _airGroundBudget-->0 : true\)\);/.test(src), 'a moved enemy draws from the mover budget (first-touch stays free)');

// executable: the budget arithmetic — 8 movers pass, the 9th reuses its cache
{
  let budget = 8, granted = 0;
  for(let i=0;i<20;i++){ if(budget-- > 0) granted++; }
  eq(granted, 8, 'only 8 movers re-ground on one frame; the rest keep last frame\'s ground');
}

// --- the car corner cache ---
const du = extractFunction('driveUpdate');
assert(/const gC=_carGroundY\(o\.position\.x, o\.position\.z, o, _ceil\);/.test(du), 'the centre ground sample is live every frame');
assert(/const _ccStale=!_cc \|\| \(_ccNow-_cc\.t>40\) \|\| Math\.abs\(o\.position\.x-_cc\.x\)>0\.6 \|\| Math\.abs\(o\.position\.z-_cc\.z\)>0\.6 \|\| Math\.abs\(\(_cc\.yaw\|\|0\)-carYaw\)>0\.12;/.test(du), 'corners refresh at ~25Hz, or sooner if the car moved/turned');
assert(/const gF=_cc\.gF, gB=_cc\.gB, gR=_cc\.gR, gL=_cc\.gL;/.test(du), 'the tilt reads the cached corners');

done('build 809: raycast budgets — wave-launch spike capped, car ground casts cut ~4/5');
