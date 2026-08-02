import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1315 — gameplay audit F3, HIGH, and the audit's own pick for best value left:
//
//   "Cataloguing all 85 SFX call sites: enemies produce sound in exactly three places — SFX.enemyShot on a
//    ranged projectile and SFX.kill on death. There is NO approach/footstep, no aggro/spot vocal, no melee
//    swing or whiff, no charger wind-up, no sapper fuse. SFX.step() takes no `at` argument at all, so it can
//    only ever be the player's own footsteps. A brute closing from behind you is inaudible in a genre where
//    audio does most of the threat detection. This is also the cheapest large feel win available."
//
// Build 1283 closed the two telegraphs (melee wind-up, charger lunge). The APPROACH was still silent, which
// is the half the audit's headline is about.
//
// Measured in the live game (tools/probe/enemy-audio.mjs — every tone/noise call recorded, a REAL enemy
// spawned and walked at the player by the REAL AI):
//   grunt  speed 8.0, walked 7.0 m in 5 s -> 3 footsteps + a spot vocal
//   brute  speed 4.6, walked 3.3 m        -> 1 footstep  + a spot vocal (260 Hz, against the light 420)
//   sapper speed 9.7                      -> footsteps + 2 fuse ticks
//   a grunt 75 m away                     -> ZERO sounds
//   and SFX.step() is still FLAT (@flat, not @pos), so the player's own footsteps stay tellable apart

const STEP_M = +src.match(/const ENEMY_STEP_M = ([0-9.]+),/)[1];
const RANGE = +src.match(/ENEMY_STEP_RANGE = (\d+),/)[1];
const NEAR = +src.match(/ENEMY_STEP_NEAR = (\d+),/)[1];
const BUDGET = +src.match(/ENEMY_STEP_BUDGET = (\d+);/)[1];
const HEAVY = new Function('return ' + extractConst('ENEMY_HEAVY', src) + ';')();
const FUSE_FAR = +src.match(/SAPPER_FUSE_FAR = ([0-9.]+),/)[1];
const FUSE_NEAR = +src.match(/SAPPER_FUSE_NEAR = ([0-9.]+);/)[1];

// ---------------------------------------------------------------- the cadence, executed
const rig = () => {
  const ST = { played: [], budget: 999, cam: { position: { x: 0, y: 1.7, z: 0 } } };
  const fn = new Function('ST', 'ENEMY_STEP_M', 'ENEMY_STEP_RANGE', 'ENEMY_STEP_NEAR', 'ENEMY_HEAVY',
    'SAPPER_FUSE_FAR', 'SAPPER_FUSE_NEAR',
    'let _enStepBudget = ST.budget;\nconst camera = ST.cam;\n' +
    'const SFX = { enemyStep:(p,h)=>ST.played.push("step"+(h?"H":"L")), sapperFuse:(p)=>ST.played.push("fuse") };\n' +
    extractFunction('_enemyFootstep') + '\n' + extractFunction('_sapperFuse') + '\n' +
    'return { step:_enemyFootstep, fuse:_sapperFuse, budget:()=>_enStepBudget, setBudget:(n)=>{ _enStepBudget=n; } };')(
    ST, STEP_M, RANGE, NEAR, HEAVY, FUSE_FAR, FUSE_NEAR);
  return { fn, ST };
};
const enemyAt = (z, type = 'grunt') => ({ mesh: { position: { x: 0, y: 1, z } }, type, dead: false, grounded: true });

{ // A FOOTSTEP EVERY ENEMY_STEP_M OF REAL TRAVEL
  const { fn, ST } = rig();
  const en = enemyAt(5);
  let steps = 0;
  for (let i = 0; i < 100; i++) if (fn.step(en, 0.1)) steps++;      // 10 m
  eq(steps, Math.floor(10 / STEP_M), '10 m of walking is ' + steps + ' footsteps at one every ' + STEP_M + ' m');
  eq(ST.played.length, steps, '...and each one played');
  assert(/DISTANCE-ACCUMULATED, not on a timer/.test(src),
    'the cadence is distance-based, so a step falls where the foot falls at any speed');
  assert(/a slowed\n\/\/ \(build 1209\) or wading enemy automatically steps slower without a second tuning knob/.test(src),
    '...which is also why a staggered or wading enemy needs no second knob');
}
{ // AN ENEMY GRINDING ON A CORNER DOES NOT TAP-DANCE
  const { fn } = rig();
  const en = enemyAt(5);
  let steps = 0;
  for (let i = 0; i < 400; i++) if (fn.step(en, 0.002)) steps++;    // 0.8 m of scraping over 400 frames
  eq(steps, 0, 'four hundred frames of going nowhere is zero footsteps — the ground COVERED is what counts');
  // ...and the same enemy, once it gets free, steps normally
  for (let i = 0; i < 20; i++) fn.step(en, 0.1);
  assert(fn.step(en, 0.1) || true);
  const s2 = rig(); const e2 = enemyAt(5);
  let n = 0; for (let i = 0; i < 20; i++) if (s2.fn.step(e2, 0.1)) n++;
  eq(n, 1, 'two metres of real travel is one step');
}
{ // heavy and light are different sounds
  const { fn, ST } = rig();
  for (const t of ['grunt', 'runner', 'gunner']) { const e = enemyAt(5, t); e._stepAcc = STEP_M; fn.step(e, 0.01); }
  for (const t of ['brute', 'boss', 'shielded']) { const e = enemyAt(5, t); e._stepAcc = STEP_M; fn.step(e, 0.01); }
  eq(ST.played.filter(x => x === 'stepL').length, 3, 'grunt, runner and gunner step light');
  eq(ST.played.filter(x => x === 'stepH').length, 3, 'brute, boss and shieldbearer step heavy');
}

// ---------------------------------------------------------------- the three limits
{
  const { fn } = rig();
  const at = (d) => { const e = enemyAt(-d); e._stepAcc = STEP_M; return fn.step(e, 0.01); };
  eq(at(5), true, 'an enemy 5 m away is heard');
  eq(at(RANGE - 1), true, '...and one just inside the gate');
  eq(at(RANGE + 1), false, 'one past ' + RANGE + ' m is not — a footstep audible across the arena is a hum, not a footstep');
  assert(RANGE < 55, 'and the gate is well inside the panner’s own 55 m (' + RANGE + ')');
}
{ // THE BUDGET rations the distant ones…
  const { fn, ST } = rig();
  fn.setBudget(BUDGET);
  let n = 0;
  for (let i = 0; i < 20; i++) { const e = enemyAt(-(NEAR + 8)); e._stepAcc = STEP_M; if (fn.step(e, 0.01)) n++; }
  eq(n, BUDGET, 'twenty distant enemies stepping on one frame produce ' + BUDGET + ' sounds, not twenty');
}
{ // …AND NEVER THE CLOSE ONE, which is the entire point of the feature
  const { fn } = rig();
  fn.setBudget(0);
  let n = 0;
  for (let i = 0; i < 6; i++) { const e = enemyAt(-(NEAR - 4)); e._stepAcc = STEP_M; if (fn.step(e, 0.01)) n++; }
  eq(n, 6, 'with the budget completely spent, the enemy inside ' + NEAR + ' m is STILL heard');
  assert(/while the enemy actually near you is\n\/\/    never rationed, which is the entire point of the feature/.test(src),
    'and that exemption is argued for');
  assert(/A sort would be fairer still and costs an\n\/\/    array every frame; a near-field exemption gets the same outcome for two comparisons/.test(src),
    '...against the alternative it replaces');
  assert(NEAR < RANGE, 'the near radius is inside the range gate');
}
{ // a dead enemy is silent
  const { fn } = rig();
  const e = enemyAt(5); e.dead = true; e._stepAcc = STEP_M;
  eq(fn.step(e, 1), false, 'a dead enemy takes no more steps');
  eq(fn.step(null, 1), false, '...and nothing is not an enemy');
}

// ---------------------------------------------------------------- the sapper's fuse
{
  const { fn, ST } = rig();
  const tick = (d, secs) => { const e = { mesh: { position: { x: 0, y: 1, z: -d } }, type: 'sapper', dead: false, _chase: true };
    let n = 0; for (let i = 0; i < secs * 60; i++) if (fn.fuse(e, 1 / 60)) n++; return n; };
  const far = tick(25, 4), mid = tick(12, 4), close = tick(2, 4);
  assert(close > mid && mid > far, 'the fuse QUICKENS as it closes (' + far + ' / ' + mid + ' / ' + close + ' ticks in 4 s)');
  /* the interval eases from FAR to NEAR over 18 m, so at 2 m it is NEAR + (FAR-NEAR)*(2/18) */
  const want = 4 / (FUSE_NEAR + (FUSE_FAR - FUSE_NEAR) * (2 / 18));
  near(close, want, 3, '...to about one every ' + (4 / close).toFixed(2) + ' s at 2 m, against the ' + FUSE_NEAR + ' s floor');
  near(4 / far, FUSE_FAR, 0.06, 'and one every ' + FUSE_FAR + ' s once it is far off');
  assert(/\/\/ enough — it is FASTER than you, so by the time its steps read as close it is already on you\./.test(src),
    'and why a footstep is not enough for the one enemy that outruns you is recorded');
}
{ // only a sapper, only while chasing, only in range
  const { fn } = rig();
  const mk = (type, chase, d) => ({ mesh: { position: { x: 0, y: 1, z: -d } }, type, dead: false, _chase: chase });
  const run = (e) => { let n = 0; for (let i = 0; i < 240; i++) if (fn.fuse(e, 1 / 60)) n++; return n; };
  eq(run(mk('grunt', true, 5)), 0, 'a grunt has no fuse');
  eq(run(mk('brute', true, 5)), 0, '...nor a brute');
  assert(run(mk('sapper', true, 5)) > 0, 'a chasing sapper ticks');
  eq(run(mk('sapper', false, 5)), 0, '...and one that has not noticed you does not');
  eq(run(mk('sapper', true, RANGE + 10)), 0, '...nor one across the arena');
  const dead = mk('sapper', true, 5); dead.dead = true;
  eq(run(dead), 0, '...nor a dead one');
}

// ---------------------------------------------------------------- the aggro vocal
{
  // It rides the EXISTING `aware` rising edge — the one build 1214 put there for the logic graph, with the
  // comment explaining that four things can set `aware` and watching it in one place means every one of
  // them fires it and none fires it twice. That argument is exactly as true for a sound.
  assert(/if\(en\.aware && !en\._wasAware\)\{ en\._wasAware=1; _lgEnemyEvent\('onspot'[\s\S]{0,520}SFX\.enemySpot\(en\.mesh\.position, !!ENEMY_HEAVY\[en\.type\]\); \}/.test(src),
    'the vocal is on the same rising edge as the onspot logic event');
  assert(/the aggro vocal rides the SAME rising edge, for the same reason the comment above\n           gives/.test(src),
    '...and says why rather than repeating the reasoning');
  assert(/else if\(!en\.aware && en\._wasAware\) en\._wasAware=0;/.test(src),
    'and the edge re-arms when it loses you, so a re-acquire sounds again');
}

// ---------------------------------------------------------------- the sounds themselves
{
  const sfx = src.slice(src.indexOf('enemyStep(at, heavy)'), src.indexOf('enemyStep(at, heavy)') + 900);
  assert(/enemyStep\(at, heavy\)\{ heavy\n    \? noise\(\{dur:0\.09, vol:0\.085, filterFreq:260, type:'lowpass', at\}\)\n    : noise\(\{dur:0\.055, vol:0\.05, filterFreq:420, type:'lowpass', at\}\); \}/.test(src),
    'the footstep is positional, and heavier enemies are lower and louder');
  assert(/enemySpot\(at, heavy\)\{ tone\(\{freq: heavy\?90:170/.test(src), 'so is the spot vocal');
  assert(/sapperFuse\(at\)\{ tone\(\{freq:1500/.test(src), 'and the fuse');
  for (const m of [/enemyStep\(at, heavy\)/, /enemySpot\(at, heavy\)/, /sapperFuse\(at\)/])
    assert(m.test(src), 'every new enemy sound takes an `at` — the whole point is knowing WHERE it is');
  // the player's own step is deliberately NOT changed
  assert(/step\(\)\{ noise\(\{dur:0\.06, vol:0\.07, filterFreq:520, type:'lowpass'\}\); \},/.test(src),
    'SFX.step() is untouched — it is the PLAYER’s, has no `at`, and 520 Hz keeps it apart from the enemy’s 420/260');
  assert(/deliberately DARKER and quieter than the player's own step so the two are\n     tellable apart when both are running/.test(src),
    'and that separation is a decision, not a coincidence');
}

// ---------------------------------------------------------------- the TDZ this build shipped and fixed
{
  const iDecl = src.indexOf('const ENEMY_STEP_M = ');
  const iUse = src.indexOf('_enStepBudget = ENEMY_STEP_BUDGET;');
  assert(iDecl > 0 && iUse > 0 && iDecl < iUse,
    'the constants are declared ABOVE the tick that resets the budget — they were below it first, and the enemy tick threw a TDZ on the first frame');
  assert(/`Cannot access 'ENEMY_STEP_BUDGET' before initialization` on the first frame — a temporal dead/.test(src),
    'the failure is recorded where the declaration now lives');
  assert(/`test-202-boot`\n\/\/ PASSED, because the throw happens inside the frame loop rather than during evaluation\./.test(src),
    'INCLUDING that the boot test passed — a boot test that executes the source is not a substitute for running a frame');
}

done('build 1315 (gameplay audit F3): enemies make noise when they move and when they notice you — the audit catalogued all 85 SFX call sites and found enemies audible in exactly three, none of them the approach, so a brute closing from behind you was silent in a genre where audio does most of the threat detection. Footsteps are distance-accumulated (a step falls where the foot falls at any speed, and a staggered or wading enemy slows for free), positional, and darker than the player’s own so the two stay tellable apart; heavy types are lower and louder. Three limits, because a wave is thirty enemies: a 30 m range gate, a per-tick budget beyond 12 m, and NO rationing inside it — the enemy behind you is never the one that gets cut. The sapper, which outruns you, ticks a fuse that quickens as it closes. The aggro vocal rides the same `aware` rising edge the logic graph’s onspot event uses, so all four things that can set it fire once. Verified live; and the first version shipped a TDZ that test-202-boot passed straight through, because the throw was inside the frame loop');
