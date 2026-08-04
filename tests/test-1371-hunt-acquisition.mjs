// build 1371 (feel review #7): hunt mode joins the perception model, and acquisition buys a beat.
//
// enemyDesiredTarget's patrol/hold branch has always had a full model — detectR, LOS, lkp, a give-up
// grace, alert propagation — and the hunt branch bypassed all of it: the never-seen fallback chased the
// target's LIVE position from any distance, through walls, on frame 1 (measured live: a grunt 75.1 m out,
// arena half-width 70, beelining the player while aware of nothing). And shootCd was seeded once at spawn
// and never re-seeded on acquisition, so an enemy rounding a corner with it long expired fired on the very
// first frame of contact. Now: (1) a never-seen hunt earns live pursuit — target inside detectR*2.5, or a
// genuine engagement (aware: sight, or alertEnemy, so gunfire stays the dinner bell) — and otherwise
// advances on the position its target held when the hunt went cold, captured ONCE (the wave converges on
// where you WERE); (2) the aware rising edge (1214/1315's own edge) floors shootCd to 0.35-0.60 s and
// cooldown to 0.25 s, once per acquisition, and only ever LENGTHENS what is pending.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
const fn = extractFunction('enemyDesiredTarget');
const ACQ = extractConst('HUNT_ACQ_MUL');

// ---------------------------------------------------------------- the acquisition gate, executed
// LOS is controlled through the cached _seesC (fresh via _losT/_losIv, so the refresh never runs) —
// segmentBlocked returns true (walls everywhere) as the backstop, the same trick test-1202 uses.
const run = new Function('en','px','pz','dist','now','py',
  'const HUNT_ACQ_MUL = ' + ACQ + ';\nlet _losBudget = 99; function segmentBlocked(){ return true; }\n' +
  fn + '\nreturn enemyDesiredTarget(en,px,pz,dist,now,py);');
const mk = (over) => Object.assign({ mesh:{ position:{ x:0, y:1.4, z:0 } }, mode:'hunt', _seesC:false,
  _losT:1, _losIv:1e9, aware:false, lostAt:0, lkp:null, _nearEyeY:1.4, wp:null, wpUntil:0 }, over);

eq(+ACQ, 2.5, 'acquisition range is 2.5x the sight radius — hunt stays the eager mode');

{ // never-seen FAR hunt -> the spawn-time objective, captured once
  const en = mk({ detectR:18 });
  let r = run(en, 0, 30, 75.1, 1000, 2.9);
  assert(r.chase === true && r.see === false, 'a cold hunt still ADVANCES (chase:true) rather than idling');
  eq(r.tx, 0, 'first cold frame: the objective IS where the target stands right now');
  eq(r.tz, 30, '...z too');
  eq(r.ty, 2.9, 'the objective carries the height (1200/1202: the goal-layer pick receives it)');
  assert(en._huntObj && en._huntObj.x === 0 && en._huntObj.z === 30 && en._huntObj.y === 2.9,
    'the objective is captured on the first cold frame — for a wave spawn, the frame after spawn');
  eq(en.aware, false, 'a cold hunt never becomes aware on its own');
  r = run(en, 55, -60, 90, 1140, 0);
  assert(r.tx === 0 && r.tz === 30, 'captured ONCE: the target moved and the enemy still converges on where it WAS');
  r = run(en, -70, 12, 120, 1280, 0);
  assert(r.tx === 0 && r.tz === 30 && r.ty === 2.9, 'the live position never leaks through a cold hunt');
}
{ // never-seen NEAR hunt -> live pursuit, exactly as today (the eager mode inside acquisition range)
  const en = mk({});   // no detectR -> the 18 default, the same literal the patrol branch uses
  const r = run(en, 10, -7, 44, 1000, 1.5);
  assert(r.tx === 10 && r.tz === -7 && r.ty === 1.5 && r.chase && !r.see,
    'inside detectR*2.5 a never-seen hunt chases the LIVE position');
  eq(en._huntObj, undefined, '...and captures no objective — nothing went cold');
}
{ // the boundary is inclusive, and the objective CAPTURE is the discriminator (on the first cold frame
  // the objective equals the live position, so the returned tx/tz alone cannot tell the two apart)
  let en = mk({ detectR:18 }); run(en, 3, 4, 45, 1000, 0);
  eq(en._huntObj, undefined, 'at exactly detectR*2.5 (45) live pursuit is earned');
  en = mk({ detectR:18 }); run(en, 3, 4, 45.0001, 1000, 0);
  assert(!!en._huntObj, 'one hair beyond it the hunt goes cold');
  en = mk({ detectR:30 }); run(en, 3, 4, 74, 1000, 0);
  eq(en._huntObj, undefined, 'an authored detectR widens acquisition with it (30 -> live inside 75)');
  en = mk({ detectR:30 }); run(en, 3, 4, 76, 1000, 0);
  assert(!!en._huntObj, '...and beyond the authored radius the hunt is cold');
}
{ // ALERTED -> lkp: gunfire is the dinner bell at ANY range (alertEnemy sets aware+lkp; the lkp branch
  // owns the investigation, and aware is sticky in hunt, so pursuit stays live after the trail dies)
  const alertEnemy = new Function('performance',
    '"use strict"; ' + extractFunction('alertEnemy') + '; return alertEnemy;')({ now: () => 5000 });
  const en = mk({ detectR:18 });
  run(en, 0, 30, 75, 1000, 0);                        // cold: converging on the objective
  alertEnemy(en, 20, -20);                            // a gunshot at (20,-20), 28 m from the enemy
  assert(en.aware === true && en.lkp && en.lkp.x === 20, 'alertEnemy sets aware + lkp (the premise the gate leans on)');
  let r = run(en, 0, 30, 75, 1100, 0);                // the target itself is still far and unseen
  assert(r.tx === 20 && r.tz === -20 && r.chase, 'the alert redirects the hunt to the threat spot, not to the live target');
  en.mesh.position.x = 20; en.mesh.position.z = -20;  // investigate: arrive at the spot
  run(en, 0, 30, 60, 1200, 0);                        // arrival starts the give-up timer
  r = run(en, -5, 77, 90, 4000, 0);                   // > 2.5 s later, target somewhere new, still unseen
  eq(en.lkp, null, 'the trail expires at the alert spot');
  assert(r.tx === -5 && r.tz === 77, 'an enemy that has ENGAGED (aware) resumes LIVE pursuit at any range — the exact pre-1371 hunt');
}
{ // SEEN -> identical to today, at any range: sight has no range gate in hunt mode, and aware is sticky
  const en = mk({ _seesC:true });
  let r = run(en, 12, -8, 70, 1000, 3.2);
  assert(r.see === true && r.chase === true && r.tx === 12, 'sight itself is unranged — the relentless pursuer is untouched');
  assert(en.aware === true && en.lkp && en.lkp.x === 12 && en.lkp.y === 3.2, 'sight records aware + last-known (with its storey)');
  en._seesC = false;
  r = run(en, 40, 40, 80, 1100, 0);
  assert(r.tx === 12 && r.tz === -8, 'sight lost -> heads to the last-known position, exactly as always');
  en.mesh.position.x = 12; en.mesh.position.z = -8;
  run(en, 40, 40, 55, 1200, 0);
  r = run(en, 41, 42, 56, 4200, 0);
  assert(r.tx === 41 && r.tz === 42, 'trail expired -> live pursuit persists (aware is sticky in hunt): byte-compatible with the old fallback');
  eq(en._huntObj, undefined, 'a hunt that opened with sight never captured an objective at all');
}
{ // friendly / _noTgt (1226/1355) untouched: passive demotes hunt to patrol BEFORE the hunt branch runs
  const enF = mk({ friendly:true, _seesC:true, detectR:18, home:{ x:0, z:0 }, patrolR:8 });
  const rF = run(enF, 5, 5, 7, 1000, 0);
  assert(!rF.chase && !rF.see && enF.aware === false, 'a friendly in hunt mode still patrols and never engages');
  eq(enF._huntObj, undefined, '...and never captures a hunt objective');
  const enN = mk({ _noTgt:true, _seesC:true, home:{ x:2, z:3 }, patrolR:6 });
  const rN = run(enN, 60, 60, 85, 1000, 0);
  assert(!rN.chase && enN.aware === false && enN._huntObj === undefined, 'an ally with nothing to fight stays passive — never a cold hunt');
}
{ // patrol/hold byte-identical: the acquisition text lives in the HUNT branch alone
  const ph = fn.slice(fn.indexOf('// PATROL / HOLD'));
  assert(ph.length > 400, 'found the patrol/hold section');
  assert(!/HUNT_ACQ_MUL/.test(ph) && !/_huntObj/.test(ph), 'no acquisition text reaches patrol/hold');
  const enH = mk({ mode:'hold', detectR:14, home:{ x:5, z:5 } });
  const rH = run(enH, 50, 50, 60, 1000, 0);
  assert(!rH.chase && rH.tx === 5 && rH.tz === 5, 'hold guards its post exactly as before');
}

// ---------------------------------------------------------------- the reaction delay, executed
// The edge block lives in the frame loop (inside the enemy-AI closure — 1315's note), so it is sliced
// from the raw source and driven directly: the very text the engine runs, never a restatement.
const A = "if(en.aware && !en._wasAware){ en._wasAware=1; _lgEnemyEvent('onspot'";
const B = 'else if(!en.aware && en._wasAware) en._wasAware=0;';
const i0 = src.indexOf(A), i1 = src.indexOf(B, i0);
assert(i0 > 0 && i1 > i0, 'the aware rising-edge block exists in the frame loop');
const tick = new Function('en','_lgEnemyEvent','SFX','ENEMY_HEAVY', src.slice(i0, i1 + B.length));
const mkE = (over) => Object.assign({ aware:true, _wasAware:0, shootCd:0, cooldown:0, hp:30, maxHp:30,
  type:'grunt', mesh:{ position:{ x:1, z:2 } } }, over);
let events = 0; const lg = () => { events++; };
const sfx = { spot:0, enemySpot(){ this.spot++; } };
{ // the rising edge floors both timers, once per acquisition
  const en = mkE({});
  tick(en, lg, sfx, {});
  eq(en._wasAware, 1, 'the edge latches');
  assert(en.shootCd >= 0.35 - 1e-9 && en.shootCd <= 0.60 + 1e-9, 'shootCd floored into [0.35, 0.60] s on acquisition');
  eq(en.cooldown, 0.25, 'the melee/lunge cooldown floored to 0.25 s');
  eq(events, 1, 'the onspot event still fires'); eq(sfx.spot, 1, 'the vocal still sounds');
  en.shootCd = 0.05; en.cooldown = 0.01;   // simulate the per-frame decrement ticking down mid-engagement
  tick(en, lg, sfx, {});
  eq(en.shootCd, 0.05, 'once per ACQUISITION, never per frame — no re-floor while aware persists');
  eq(en.cooldown, 0.01, '...for either timer');
  eq(events, 1, '...and no duplicate event');
  en.aware = false; tick(en, lg, sfx, {});
  eq(en._wasAware, 0, 'the falling edge re-arms');
  en.aware = true; en.shootCd = 0; tick(en, lg, sfx, {});
  assert(en.shootCd >= 0.35 - 1e-9, 'a re-acquisition floors again');
  eq(events, 2, '...alongside the re-fired event');
}
{ // floors, never shortens: an enemy mid-cooldown keeps its longer wait
  const en = mkE({ shootCd: 5, cooldown: 3 });
  tick(en, lg, sfx, {});
  eq(en.shootCd, 5, 'a pending shootCd is never SHORTENED by the edge');
  eq(en.cooldown, 3, 'nor the melee cooldown');
}
{ // the ||0 guard: a bare stub enemy with no timers cannot be poisoned to NaN (1169's rule)
  const en = { aware:true, _wasAware:0, hp:30, maxHp:30, type:'x', mesh:{ position:{ x:0, z:0 } } };
  tick(en, lg, sfx, {});
  assert(Number.isFinite(en.shootCd) && en.shootCd >= 0.35 - 1e-9, 'an undefined shootCd floors cleanly');
  eq(en.cooldown, 0.25, 'an undefined cooldown floors cleanly');
}
for(let i = 0; i < 200; i++){ const en = mkE({}); tick(en, () => {}, sfx, {});
  if(!(en.shootCd >= 0.35 - 1e-9 && en.shootCd <= 0.60 + 1e-9)) assert(false, 'floor out of bounds: ' + en.shootCd); }

// ---------------------------------------------------------------- wiring pins
assert(src.indexOf('const HUNT_ACQ_MUL') < src.indexOf('function enemyDesiredTarget('),
  'the multiplier is declared above its reader (TDZ hygiene — 1127/1331)');
assert(/if\(en\.aware \|\| dist <= \(en\.detectR\|\|18\)\*HUNT_ACQ_MUL\) return \{ tx:px, tz:pz, ty:py, chase:true, see:false \};/.test(fn),
  'the gate: live pursuit is earned by engagement OR acquisition range, still returning the full descriptor');
eq((fn.match(/_huntObj/g) || []).length, 5, 'capture-once (2 reads) + the objective return (3 reads) — no other consumer');
{ // order inside the edge block: event -> vocal -> reaction delay -> close -> re-arm; and the floor lands
  // BEFORE the same loop body's decrement + fire gates, so the very first contact frame is covered
  const iS = src.indexOf('SFX.enemySpot(en.mesh.position, !!ENEMY_HEAVY[en.type]);', i0);
  const iF1 = src.indexOf('en.shootCd = Math.max(en.shootCd||0, 0.35 + Math.random()*0.25);', i0);
  const iF2 = src.indexOf('en.cooldown = Math.max(en.cooldown||0, 0.25); }', i0);
  assert(iS > i0 && iF1 > iS && iF2 > iF1 && iF2 < i1, 'the reaction delay rides the rising edge, after the vocal, inside the block');
  assert(i1 < src.indexOf('en.shootCd -= dt;'), 'the floor lands before the frame’s decrement/fire gate');
}
assert(src.includes('shootCd: 0.4 + Math.random()*0.8'), 'the spawn seed is untouched — the edge only ever floors it');

done('build 1371: hunt acquisition (cold hunts converge on the spawn-time objective; live pursuit is earned by range, sight or an alert) + a 0.35-0.60 s reaction beat on the aware rising edge, floored once per acquisition and never shortening');
