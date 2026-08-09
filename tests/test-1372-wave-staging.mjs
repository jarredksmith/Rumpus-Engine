// build 1372 (feel review #8): wave STAGING. The formula wave was a ring of hunt-mode capsules around
// the ORIGIN - a player who crossed the map fought every wave from one side - with no direction bias
// and a flat 0.6 s spawn metronome; and two enemy types (runner 11-13, sapper 9.5-12.5) were flatly
// faster than a sprinting player, so "run away" was never an answer. Now the ring centres on the
// PLAYER, its direction draws ~2:1 from their rear half, every point hard-clamps inside the arena,
// formula descriptors carry delta-encoded spawn delays that cluster the wave into loose squads over
// ~2-4 s, and runner/sapper top speeds drop under sprint (10.5-11.5 / 11.8) with build 1191 overrides
// still winning. Manifest waves, authored markers and the milestone boss are byte-identical (1179).
import { gameSource, extractFunction, extractConst, evalIn, done, assert, eq, near } from './harness.mjs';
const src = gameSource();

// deterministic LCG so every figure below is stable run to run
const lcg = (s)=>()=>{ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

// the REAL randomWaveDescriptors, with a player stub in scope
const mkWave = (playerStub, bossWave)=> new Function('Math','player',
  '"use strict"; const gameCfg={bossWave:'+(bossWave||0)+'}; '
  + extractFunction('pickEnemyType') + '; '
  + extractFunction('randomWaveDescriptors') + '; return randomWaveDescriptors;')(Math, playerStub);

// ---------------------------------------------------------------- 1. the ring centres on the PLAYER
{
  // player well off-centre: the old origin ring put spawns 6-99 m from them; the new one keeps every
  // spawn inside the ring reach FROM THE PLAYER, with wall-clamped points only ever NEARER.
  const f = mkWave({ pos:{ x:30, y:1.7, z:-20 }, yaw:0.7 }, 0);
  const rng = lcg(12345);
  let tot=0, oob=0, close=0, ring=0, far=0;
  for(let w=0; w<30; w++) for(const d of f(6, 70, rng)){
    tot++;
    if(Math.abs(d.x)>67 || Math.abs(d.z)>67) oob++;
    const r = Math.hypot(d.x-30, d.z+20);
    if(r < 12) close++;
    if(r > 41.9 && r < 63.1) ring++;
    if(r > 63.1) far++;
  }
  eq(oob, 0, 'every one of '+tot+' spawns is clamped inside the arena walls (player off-centre)');
  eq(far, 0, 'no spawn is further than the ring reaches FROM THE PLAYER (the origin ring put them up to ~99 m away)');
  assert(ring >= tot*0.55, 'the majority sit at true ring distance 0.6-0.9 arena from the player ('+ring+'/'+tot+'; the rest are wall-clamped nearer)');
  eq(close, 0, 'none spawns within 12 m of a player standing in the open');
}

// corner player: the clamp is the guarantee, and the proximity floor keeps spawns out of their lap
{
  const f = mkWave({ pos:{ x:60, y:1.7, z:60 }, yaw:2.5 }, 0);
  const rng = lcg(999);
  let tot=0, oob=0, close=0;
  for(let w=0; w<40; w++) for(const d of f(6, 70, rng)){ tot++;
    if(Math.abs(d.x)>67 || Math.abs(d.z)>67) oob++;
    const dx=d.x-60, dz=d.z-60; if(dx*dx+dz*dz < 144) close++;
  }
  eq(oob, 0, 'corner player: the hard clamp still guarantees in-bounds ('+tot+' samples)');
  assert(close <= tot*0.05, 'and the proximity floor tests the CLAMPED point, so lap-spawns stay rare even jammed in a corner ('+close+'/'+tot+' within 12 m)');
}

// ---------------------------------------------------------------- 2. rear 180deg at ~2:1
{
  const yaw = 2.1, f = mkWave({ pos:{ x:0, y:1.7, z:0 }, yaw:yaw }, 0);
  const rng = lcg(777);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let behind=0, front=0;
  for(let w=0; w<60; w++) for(const d of f(10, 70, rng)){
    if(d.x*fx + d.z*fz < 0) behind++; else front++;
  }
  const ratio = behind/front;
  assert(ratio > 1.6 && ratio < 2.6, 'the rear half draws ~2:1 ('+behind+' behind vs '+front+' ahead, '+ratio.toFixed(2)+':1)');
  // and at the origin (nothing clamps or rejects) every spawn keeps the classic ring distance band
  const g = mkWave({ pos:{ x:0, y:0, z:0 }, yaw:0 }, 0);
  let rMin=1e9, rMax=0;
  for(const d of g(8, 70, lcg(31337))){ const r=Math.hypot(d.x, d.z); rMin=Math.min(rMin,r); rMax=Math.max(rMax,r); }
  assert(rMin > 41.9 && rMax < 63.1, 'ring radius stays 0.6-0.9 arena FROM THE PLAYER ('+rMin.toFixed(1)+'-'+rMax.toFixed(1)+')');
}

// ---------------------------------------------------------------- 3. delays: loose squads over ~0-4 s
{
  const f = mkWave({ pos:{ x:0, y:0, z:0 }, yaw:0 }, 0);
  const w = f(6, 70, lcg(4242));
  eq(w.length, 15, 'wave 6 formula count unchanged (3 + wave*2)');
  assert(w.every(d => typeof d.delay==='number' && isFinite(d.delay) && d.delay>=0), 'every formula descriptor carries a finite gap >= 0');
  const abs=[]; let c=0;
  for(let i=0;i<w.length;i++){ c = (i===0) ? w[0].delay : c + w[i].delay; abs.push(c); }
  assert(abs[0] <= 0.3, 'the first squad arrives almost immediately (t='+abs[0].toFixed(2)+' s)');
  const span = abs[abs.length-1];
  assert(span >= 1.2 && span <= 4.5, 'the wave lands over ~2-4 s, not a 9 s metronome drip (span '+span.toFixed(2)+' s)');
  const bounds = w.filter(d => d.delay > 0.5).length;
  assert(bounds >= 2, 'the arrival clusters into squads ('+bounds+' inter-squad gaps over 0.5 s)');
  assert(w.filter(d => d.delay < 0.26).length >= 10, 'squad members land within a beat of each other');
  // a deep wave still fits the window: the 4 s squad-base cap holds however many squads there are
  const big = f(20, 70, lcg(5150));
  eq(big.length, 43, 'wave 20 count unchanged');
  let c2=0; for(let i=0;i<big.length;i++) c2 = (i===0) ? big[0].delay : c2 + big[i].delay;
  assert(c2 <= 4.5, 'a 43-member wave still lands inside the ~4 s window ('+c2.toFixed(2)+' s)');
}

// ---------------------------------------------------------------- 4. the milestone boss is untouched
{
  const f = mkWave({ pos:{ x:5, y:0, z:5 }, yaw:1 }, 5);
  const w = f(5, 70, lcg(11));
  const boss = w[w.length-1];
  eq(boss.type, 'boss', 'the milestone boss still joins the milestone wave, last');
  eq(boss.x, 0, '...at its classic gate x');
  near(boss.z, -(70*0.72), 1e-12, '...and z: 1179, milestone composition is not restaged');
  assert(!('delay' in boss), 'the boss carries NO delay field (the loop gives it the stock 0.6 s gap)');
  assert(/out\.push\(\{ x:0, z:-\(arena\*0\.72\), mode:'hunt', type:'boss' \}\);/.test(src), 'the boss push literal is byte-identical');
  assert(!f(4, 70, lcg(12)).some(d=>d.type==='boss'), 'no boss off the cadence');
}

// ---------------------------------------------------------------- 5. manifest waves are byte-identical
{
  const TYPES = evalIn(extractConst('ENEMY_TYPES'));
  const mwd = new Function('Math','ENEMY_TYPES','propModels',
    '"use strict"; ' + extractFunction('manifestWaveDescriptors') + '; return manifestWaveDescriptors;')(Math, TYPES, []);
  const md = mwd({ list:[{ type:'grunt', n:4, at:'' }, { type:'brute', n:2, at:'' }] }, 70, lcg(55));
  eq(md.length, 6, 'manifest descriptors spawn as authored');
  assert(md.every(d => Object.keys(d).join(',') === 'x,z,mode,type'), 'a manifest descriptor carries exactly the pre-1372 fields: NO delay (the 1179 rule)');
  assert(!/delay/.test(extractFunction('manifestWaveDescriptors')), 'manifestWaveDescriptors never mentions delay');
  assert(!/delay/.test(extractFunction('descFromMarker')), 'marker descriptors never carry one either');
  assert(/if\(_mf\)\{ for\(const d of manifestWaveDescriptors\(_mf, ARENA, Math\.random\)\) spawnQueue\.push\(d\); \}/.test(src), 'the manifest loader line in startWave is untouched');
  assert(/else for\(const d of randomWaveDescriptors\(wave, ARENA, Math\.random\)\) spawnQueue\.push\(d\);/.test(src), 'and so is the formula loader line');
}

// ---------------------------------------------------------------- 6. the REAL spawn loop honours the gaps
{
  const li = src.indexOf('else if(toSpawn>0){');
  const end = src.indexOf('} else if(_hostileAlive()===0){', li);
  assert(li > 0 && end > li, 'the spawn-consume block is findable');
  const block = src.slice(li, end);
  const step = new Function('S','dt',
    '"use strict"; let toSpawn=S.toSpawn, spawnTimer=S.spawnTimer; const spawnQueue=S.spawnQueue;'
    + ' const spawnEnemy=(d)=>S.spawned.push({ d:d, t:S.t }); const updateHUD=()=>{};'
    + ' if(false){} ' + block + ' } S.toSpawn=toSpawn; S.spawnTimer=spawnTimer;');
  const run = (queue)=>{ const S={ toSpawn:queue.length, spawnTimer:0, spawnQueue:queue.slice(), spawned:[], t:0 };
    let g=0; while(S.toSpawn>0 && g++<100000){ S.t += 1/60; step(S, 1/60); } return S; };

  // no-delay descriptors (manifest + markers): the exact 0.6 s metronome, byte-identical pacing
  const M = run([{ type:'grunt' }, { type:'grunt' }, { type:'grunt' }, { type:'grunt' }]);
  eq(M.spawned.length, 4, 'a plain queue drains');
  for(let i=1;i<4;i++){ const g = M.spawned[i].t - M.spawned[i-1].t;
    assert(g >= 0.6 - 1e-9 && g <= 0.6 + 1/60 + 1e-9, 'no-delay gap '+i+' is the stock 0.6 s metronome ('+g.toFixed(4)+' s)'); }

  // formula descriptors: each delta gap is honoured to within one frame
  const f = mkWave({ pos:{ x:0, y:0, z:0 }, yaw:0 }, 0);
  const wave = f(6, 70, lcg(2024));
  const R = run(wave);
  eq(R.spawned.length, 15, 'every delayed descriptor spawns - the accounting never wedges');
  for(let i=1;i<R.spawned.length;i++){
    const want = wave[i].delay, got = R.spawned[i].t - R.spawned[i-1].t;
    assert(got >= want - 1e-9 && got <= want + 1/60 + 1e-9, 'gap '+i+' honours the descriptor delay ('+got.toFixed(3)+' s for '+want.toFixed(3)+')');
  }
  assert(R.spawned[R.spawned.length-1].t <= 5.5, 'the whole wave is on the field within ~4.5 s ('+R.spawned[R.spawned.length-1].t.toFixed(2)+' s)');
}

// ---------------------------------------------------------------- 7. _hostilePending counts delayed descriptors
{
  const f = mkWave({ pos:{ x:0, y:0, z:0 }, yaw:0 }, 0);
  const q = f(3, 70, lcg(88));                  // 9 delayed hostiles
  q.push({ friendly:true }); q.push({ fac:0 }); // plus a villager and an ally
  const pend = new Function('toSpawn','spawnQueue',
    '"use strict"; const FACTION_DEFAULT=1; const FACTION_NAMES=["a","b","c","d"]; '
    + extractFunction('_facOf') + '; ' + extractFunction('_hostilePending') + '; return _hostilePending();')(q.length, q);
  eq(pend, 9, '_hostilePending: 11 queued - 1 friendly - 1 ally = 9 (the delay field never touches the count)');
}

// ---------------------------------------------------------------- 8. speed defaults + 1191 overrides
{
  const TYPES = evalIn(extractConst('ENEMY_TYPES'));
  eq(TYPES.runner.speedMin, 10.5, 'runner floor 10.5');
  eq(TYPES.runner.speedMax, 11.5, 'runner ceiling 11.5: under a committed sprint, so it can finally be outrun');
  eq(TYPES.sapper.speedMin, 9.5, 'sapper floor unchanged at 9.5');
  eq(TYPES.sapper.speedMax, 11.8, 'sapper ceiling 11.8: the fuse can be outrun too');
  assert(TYPES.runner.speedMin > TYPES.grunt.speedMax, 'the runner still outruns every grunt (pressure survives the retune)');
  // The rig LIFTS the capture from source rather than restating it — right, but it pinned that line's exact
  // text and build 1449 legitimately added five fields to it. Slice it by its own anchors instead, so the
  // rig keeps testing the real capture without asserting one spelling of it.
  const _bi = src.indexOf('const ENEMY_BASE = {};'), _bj = src.indexOf('const ENEMY_MOD_RANGED', _bi);
  assert(_bi > 0 && _bj > _bi, 'found the 1191 factory-baseline capture');
  const baseLine = [src.slice(_bi, _bj)];
  const eff = (cfg)=> new Function('gameCfg',
    '"use strict"; const ENEMY_TYPES = ' + extractConst('ENEMY_TYPES') + '; const ENEMY_TYPE_KEYS = ' + extractConst('ENEMY_TYPE_KEYS')
    + '; const RANGED_AIM_MS = ' + extractConst('RANGED_AIM_MS') + '; const ENEMY_MOD_RANGED = ' + extractConst('ENEMY_MOD_RANGED') + '; '
    + baseLine[0] + ' ' + extractFunction('_enemyEff') + '; return _enemyEff;')(cfg);
  const d = eff({})('runner');
  eq(d.speedMin, 10.5, '_enemyEff serves the new runner floor'); eq(d.speedMax, 11.5, '...and ceiling');
  const o = eff({ enemyMods:{ runner:{ spd:2 }, sapper:{ spd:1.5 } } });
  eq(o('runner').speedMax, 23, 'a 1191 spd override still WINS (2x runner -> 23)');
  near(o('sapper').speedMax, 17.7, 1e-9, '...and multiplies the NEW sapper base (1.5 x 11.8)');
  near(o('sapper').speedMin, 14.25, 1e-9, '...min and max together, so gait variance survives (1191)');
}

// ---------------------------------------------------------------- 9. shape pins
{
  assert(/spawnTimer = \(_nx && _nx\.delay!=null\) \? _nx\.delay : 0\.6;/.test(src), 'the loop reads the head descriptor gap, defaulting to the 0.6 metronome');
  const rwd = extractFunction('randomWaveDescriptors');
  assert(/typeof player !== 'undefined'/.test(rwd), 'the ring centre reads the player, harness-safe');
  assert(/rng\(\) < 2\/3/.test(rwd), 'the rear half is drawn at 2:1');
  assert(/out\.sort\(\(a,b\)=>a\.delay-b\.delay\);/.test(rwd), 'arrivals sort before delta-encoding');
  assert(/qx = px>B \? B : \(px<-B \? -B : px\); qz = pz>B \? B : \(pz<-B \? -B : pz\);/.test(rwd), 'the wall clamp is computed per candidate...');
  assert(/px = qx; pz = qz;/.test(rwd), '...and the emitted point is the clamped one: in-bounds is a guarantee');
  assert(/out\.push\(\{ x:px, z:pz, mode:'hunt', type: pickEnemyType\(waveNum, rng\), delay:/.test(rwd), 'descriptors still ship explicit x/z (build 407) plus the gap');
}

done('build 1372 (feel review #8): waves stage around the player - the formula ring centres on them, draws ~2:1 from their rear half, clamps inside the arena, and arrives in loose squads over ~2-4 s via delta-encoded descriptor delays the spawn loop honours (manifest waves, markers and the milestone boss keep the stock 0.6 s metronome byte-identically, and _hostilePending never sees the difference); runner 10.5-11.5 and sapper max 11.8 sit under a committed sprint with 1191 speed overrides still multiplying the new bases');
