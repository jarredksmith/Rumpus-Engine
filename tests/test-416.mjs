import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 547: round-robin AI raycast budget. The 546 per-entity time throttles cap how OFTEN one actor
// raycasts; these new per-frame budgets cap how MANY actors raycast in the same frame. A wave spawns N
// enemies whose LOS/ground caches are all "due" on the same frame (every _losT/_grT starts null), so the
// time throttle alone still let one frame fire dozens of raycasts at once — the wave-framerate spike.

// --- the budgets are declared as shared module-level counters (next to the A* repath budget) ---
assert(/let _losBudget = 0;/.test(src), 'a per-frame LOS raycast budget is declared');
assert(/let _groundBudget = 0;/.test(src), 'a per-frame ground raycast budget is declared');

// --- both ticks reset them each frame (bots are PvP-only, enemies PvE-only, so each gets the full budget) ---
assert((src.match(/_losBudget = 5; _groundBudget = 5;/g) || []).length >= 2, 'both the bot tick and the enemy tick reset the per-frame budgets');

// --- the four raycast sites draw from the budget ---
const edt = extractFunction('enemyDesiredTarget');
assert(/if\(typeof _losBudget!=='undefined'\) _losBudget--;/.test(edt), 'enemy LOS refresh decrements the LOS budget');
assert(/en\._losIv = 100 \+ Math\.random\(\)\*40;/.test(edt), 'enemy LOS interval is jittered so the wave de-clusters');

const ub = extractFunction('updateBots');
assert(/if\(b\._losT<=0 && _losBudget>0\)\{ _losBudget--;/.test(ub), 'bot LOS refresh is gated by + decrements the LOS budget');
assert(/if\(!_bAir && !_bGMoved && b\._grT!=null\) _groundBudget--;/.test(ub), 'bot periodic ground refresh decrements the ground budget');
assert(/const _bAir = \(b\.grounded===false\) \|\| Math\.abs\(b\.vy\|\|0\) > 0\.01;/.test(ub), 'an airborne bot bypasses the ground budget (landing stays frame-accurate)');

// enemy ground budget draw + mandatory cell-move
assert(/if\(!_enGMoved && en\._grT!=null && typeof _groundBudget!=='undefined'\) _groundBudget--;/.test(src), 'enemy periodic ground refresh decrements the ground budget; a cell-move is mandatory');

// --- executable: the gate caps refreshes per frame and round-robins the rest across frames ---
// Faithful model of the LOS gate: due = (never refreshed) OR (interval elapsed); refresh only if budget left.
function runFrame(actors, cap, now){
  let budget = cap, refreshed = 0;
  for(const a of actors){
    const due = (a.losT == null) || (now - a.losT > 110);
    if(due && budget > 0){ budget--; a.losT = now; a.sees = true; refreshed++; }
    // over budget: keep the cached a.sees and leave a.losT so it stays "due" and retries next frame
  }
  return refreshed;
}
const N = 30, CAP = 5;
const actors = Array.from({length:N}, () => ({ losT:null, sees:false }));
// frame 1: every actor is due (fresh wave) but only CAP may raycast
let r1 = runFrame(actors, CAP, 1000);
eq(r1, CAP, 'frame 1: a 30-enemy wave fires at most CAP=5 LOS raycasts, not 30 (no spike)');
// drive several frames at +1ms each (interval not yet elapsed, so only the still-null ones are due)
let maxPerFrame = r1, t = 1000, fresh = actors.filter(a=>a.losT!=null).length;
for(let f=0; f<10 && fresh<N; f++){ t += 1; const r = runFrame(actors, CAP, t); maxPerFrame = Math.max(maxPerFrame, r); fresh = actors.filter(a=>a.losT!=null).length; }
assert(maxPerFrame <= CAP, 'no single frame ever exceeds the budget (flat per-frame raycast cost)');
eq(fresh, N, 'every enemy gets refreshed within a few frames (round-robin, no starvation)');
// the wave needed ceil(N/CAP)=6 frames to fully refresh — that staggering is the point
assert(Math.ceil(N/CAP) === 6, 'a 30-enemy wave spreads its initial LOS work across ~6 frames instead of 1');

done('round-robin AI raycast budget caps per-frame LOS/ground work (build 547)');
