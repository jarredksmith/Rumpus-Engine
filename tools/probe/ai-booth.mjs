// The AI booth, verified end to end in the running game.
//
// The last of the three the gauntlet is scoped around ("range + physics + AI"). The range booth and the
// physics booth are swept; the AI side had two thin checks in feature-sweep — an enemy spawns, takes damage
// and dies, and every type spawns without throwing — which says nothing about whether the AI does anything.
//
// THE INSTRUMENT. There is no `updateEnemyAI`: the enemy tick is INLINE in `loop()` (build 1315 recorded the
// same wall from the other side — "_enStep, _enemyFootstep, _sapperFuse and updateEnemies are inside the
// enemy-AI closure"). And real frames are useless here: measured in this sandbox, `_frameNo` advances
// exactly 3 times in 3 seconds, so the 3 simulated seconds a chase needs would take 3 real minutes.
//
// So `__drive(n)` calls the REAL `loop()` n times with DRAWING switched off — `renderer.render` a no-op, the
// rAF re-arm neutralised so the loop cannot avalanche, and `clock.getDelta` pinned to a fixed step so the
// simulated time is exact instead of being whatever the wall clock happened to give. The AI, the physics,
// the logic graph and the objectives are all untouched. Measured: 300 frames in 469 ms, against 3 frames in
// 3,000 ms of real time — and `_frameNo` proves the loop actually ran.
//
// Same discipline otherwise, and each of the last two sweeps earned it: drive the REAL entry point, read a
// REAL observable (a world position, an HP, a nav path), isolate every probe call so one unknown identifier
// cannot end the run, build every fixture INSIDE the arena but away from the stock geometry (build 1323's
// rule, plus build 1405's correction — the ground plane stops at +-ARENA), and restore anything shared. A
// check that mutates the world and leaves it mutated makes the next three read as broken.
import { withGame } from './driver.mjs';

const R = [];
const chk = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

const B = 44;   // the booth's corner, inside the arena and clear of the stock level

await withGame(async (P) => {
  const rig = await safe(P, `(function(){
    paused = false; gameOn = true;
    window.__B = ${B};

    /* THE DRIVE — the real frame loop, without the drawing. Everything is restored in a finally, so a throw
       inside the AI cannot leave the game unable to render.

       performance.now IS PART OF THE INSTRUMENT, not a nicety. Half the AI's timers are wall-clock
       TIMESTAMPS rather than countdowns — the melee wind-up is stamped
       _windupT = performance.now() + ENEMY_MELEE_WINDUP_MS and read as now < _windupT — so a drive that
       advances the SIMULATED clock and leaves the real one alone runs 240 frames in ~100 ms of wall time
       and a 320 ms wind-up NEVER completes. Measured before this: the telegraph fired, the squash played,
       and the swing never landed, which reads exactly like a broken melee. Pinning performance.now to the
       same step makes simulated time coherent everywhere.

       Two things that took a run each to get right:
       - THE VIRTUAL CLOCK MUST BE THE ONLY CLOCK. The first draft clamped it forward to the real one after
         each drive (Math.max), meaning to keep the engine from seeing time run backwards. What that
         actually did, whenever real time led, was advance the clock at the REAL rate — 2 ms a call instead
         of 16.67 — so an enemy 20 simulated seconds into a chase had not moved. It is a pure counter now.
       - REAL FRAMES MUST NOT RUN BETWEEN DRIVES. The page's own rAF keeps firing between probe calls, and
         those frames would tick the AI on the real clock, which by then is a different timeline from the
         stamps the drive has been writing. _tabHidden is the engine's own switch for "do not simulate";
         it is held ON outside the drives and released at the end of the sweep.

       And the gates: loop() early-returns past the ENTIRE simulation — before the AI, the physics and the
       logic — when the level loader, a cutscene, an interstitial, the shop, the upgrade picker, the map,
       the inventory or plain 'paused' is up. '_frameNo' is incremented BEFORE all of them, so a drive that
       simulates nothing at all still reports its full frame count. That is what made two runs of this sweep
       disagree 8/15 against 11/15 on the same tree: clearing the field reaches 'beginUpgradeChoice', and
       every later check then read an enemy the loop was stepping past. They are cleared at the head of
       every drive, and '__gate()' names the one that was closed. */
    window.__gates = ['_levelLoaderActive','_cineActive','_interActive','shopOpen','choosingUpgrade',
                      'mapOpen','invOpen','paused'];
    window.__gate = function(){                       // which gate is closed right now, or '' — the diagnosis
      for(const g of __gates){ try { if(eval(g)) return g; } catch(e){} }
      return (typeof gameOn!=='undefined' && !gameOn) ? 'gameOn' : '';
    };
    window.__ungate = function(){
      paused = false; gameOn = true;
      if(typeof shopOpen!=='undefined') shopOpen = false;
      if(typeof choosingUpgrade!=='undefined') choosingUpgrade = false;
      if(typeof mapOpen!=='undefined') mapOpen = false;
      if(typeof invOpen!=='undefined') invOpen = false;
      if(typeof _levelLoaderActive!=='undefined') _levelLoaderActive = false;
      if(typeof _cineActive!=='undefined') _cineActive = false;
      if(typeof _interActive!=='undefined') _interActive = false;
    };

    window.__vnow = performance.now() + 1e5;   // start clear of the real clock: only the drive advances it
    window.__drive = function(n, dt){
      dt = dt || 1/60;
      __ungate();
      const rr = renderer.render, raf = window.requestAnimationFrame, gd = clock.getDelta,
            pn = performance.now.bind(performance);
      renderer.render = function(){};
      window.requestAnimationFrame = function(){ return 0; };
      clock.getDelta = function(){ return dt; };
      performance.now = function(){ return __vnow; };
      _tabHidden = false;
      try { for(let i=0;i<n;i++){ __vnow += dt*1000; loop(); } }
      finally { renderer.render = rr; window.requestAnimationFrame = raf; clock.getDelta = gd;
                performance.now = pn; _tabHidden = true; }
    };

    /* SUPPRESS THE WAVE MACHINE — through the engine's own switch, not by poking a timer.
       The first draft cleared spawnQueue and set a "waveTimer" that does not exist, which left the real
       loop intact: an empty field with toSpawn at 0 reaches beginUpgradeChoice, which sets
       choosingUpgrade and releases the pointer, and the very next check reads an enemy that never ticks.
       That is exactly why two runs of the same sweep disagreed — 8/15 then 11/15, same tree. Build 685's
       puzzle objective makes noEnemyMode() true, so the whole wave block is skipped by the engine. */
    window.__obj0 = gameCfg.objective;
    window.__wavesOff = () => { gameCfg.objective = 'puzzle';
      if(typeof spawnQueue!=='undefined') spawnQueue.length = 0;
      if(typeof toSpawn!=='undefined') toSpawn = 0;
      if(typeof choosingUpgrade!=='undefined') choosingUpgrade = false; };
    window.__wavesOn  = () => { gameCfg.objective = __obj0; };
    window.__clear = () => { for(let i=enemies.length-1;i>=0;i--){ try{ killEnemy(enemies[i]); }catch(e){} }
      enemies.length = 0; __wavesOff(); };
    window.__spawn = (opts) => { const n=enemies.length; spawnEnemy(opts);
      return enemies.length > n ? enemies[enemies.length-1] : null; };
    window.__at = (e) => [ +e.mesh.position.x.toFixed(2), +e.mesh.position.z.toFixed(2) ];
    window.__home = () => { player.pos.set(__B, 1.7, __B); player.vel.set(0,0,0); player.hp = player.maxHp||100;
      camera.position.copy(player.pos); camera.updateMatrixWorld(true); };
    window.__props = () => propModels.length;

    __wavesOff(); __clear(); __home();
    /* THE POSITIVE CONTROL. Every null in this sweep is "the enemy did not move", which reads identically
       to an instrument that is not driving the AI at all — so prove it can produce a positive first. */
    const f0 = _frameNo, t0 = performance.now();
    const ctl = __spawn({ x: __B, z: __B - 20, type:'grunt' });
    const cz0 = ctl ? ctl.mesh.position.z : null;
    __drive(120);
    const moved = ctl ? +(ctl.mesh.position.z - cz0).toFixed(2) : null;
    __clear();
    return { spawnedOnly: enemies.length, types: Object.keys(ENEMY_TYPES).length,
             droveFrames: _frameNo - f0, ms: Math.round(performance.now()-t0),
             controlMoved: moved, gate: __gate() };
  })()`);
  chk('rig', 'the drive runs REAL frames of the real loop', !rig.__threw && rig.droveFrames === 120, rig);
  chk('rig', 'and it really drives the AI: a control enemy closes on the player',
    !rig.__threw && rig.controlMoved > 4, rig);
  chk('rig', 'the wave machine is off and no UI gate is skipping the sim',
    !rig.__threw && rig.spawnedOnly === 0 && rig.gate === '' && rig.types >= 8, rig);

  // ============================================================ IT COMES FOR YOU
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      /* build 1371: a cold hunt advances on where the target WAS until it earns live pursuit — inside
         detectR*2.5 (18*2.5 = 45) it chases live, which is the ordinary combat case this checks */
      const e = __spawn({ x: __B, z: __B - 30, type:'grunt' });
      if(!e) return { err:'no spawn' };
      const start = __at(e);
      const d0 = Math.hypot(start[0]-player.pos.x, start[1]-player.pos.z);
      __drive(180);
      const end = __at(e);
      const d1 = Math.hypot(end[0]-player.pos.x, end[1]-player.pos.z);
      return { start, end, d0:+d0.toFixed(1), d1:+d1.toFixed(1), closed:+(d0-d1).toFixed(1), aware:!!e.aware };
    })()`);
    chk('hunt', 'a spawned enemy closes on the player', !r.__threw && r.closed > 5, r);
  }

  // ============================================================ IT GOES AROUND THINGS
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      /* a wall between the enemy and the player, with a gap at one end. Build 1148 made the collider tight
         to the triangles, so a 1-unit-thick wall really is 1 unit thick here. */
      window.__wall = [];
      for(let i=-5;i<=5;i++){
        if(i>3) continue;                                   /* the gap, off to one side */
        let o=null; spawnProp('box',[__B + i*2, 0, __B-12, 0,0,0, 2,4,1],(b)=>{o=b;});
        if(o){ if(typeof refreshPropCollider==='function') refreshPropCollider(o);
               if(typeof navDirtyRect==='function') navDirtyRect(__B+i*2-2, __B-14, __B+i*2+2, __B-10);
               __wall.push(o); }
      }
      const e = __spawn({ x: __B, z: __B - 24, type:'grunt' });
      const start = __at(e);
      __drive(900);                                          /* 15 simulated seconds */
      const end = __at(e);
      const path = (typeof navFindPath==='function' && typeof navNearestWalkable==='function' && NAV.built)
        ? navFindPath(navNearestWalkable(__B, __B-24, 1), navNearestWalkable(__B, __B, 1)) : null;
      const inWall = Math.abs(end[1] - (__B-12)) < 1.2 && end[0] < __B + 5;
      const reached = Math.hypot(end[0]-player.pos.x, end[1]-player.pos.z);
      for(const o of __wall) try{ removeProp(o); }catch(e){}
      __wall.length = 0;
      return { start, end, navBuilt: !!NAV.built, pathLen: path ? path.length : null,
               reached:+reached.toFixed(1), inWall };
    })()`);
    chk('nav', 'the nav grid finds a route round a wall', !r.__threw && r.navBuilt && r.pathLen > 1, r);
    chk('nav', '...and the enemy takes it rather than grinding on the wall',
      !r.__threw && r.reached < 8 && !r.inWall, r);
  }

  // ============================================================ THE GRAPH COMMANDS THEM
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      const e = __spawn({ x: __B+10, z: __B+10, type:'grunt' });
      const out = {};
      const cmd = (c, at) => { _applyWorldAction({ do:'command', ewho:'enemies', cmd:c, at:at||'' }); };
      /* the handler writes e.mode for hunt/patrol/hold and e.home for hold/post — read what it WRITES */
      cmd('hold');   out.hold   = { mode: e.mode, home: !!e.home };
      cmd('patrol'); out.patrol = { mode: e.mode };
      cmd('hunt');   out.hunt   = { mode: e.mode };
      e.aware = true; e.lkp = { x: 1, z: 1 };
      cmd('calm');   out.calm   = { aware: !!e.aware, lkp: !!e.lkp };
      cmd('alert', 'me'); out.alert = { aware: !!e.aware, lkp: e.lkp ? [ +e.lkp.x.toFixed(0), +e.lkp.z.toFixed(0) ] : null };
      e.home = null;
      cmd('post',  'me'); out.post  = { home: e.home ? [ +e.home.x.toFixed(0), +e.home.z.toFixed(0) ] : null };
      cmd('post',  'nosuchtag'); out.refused = { home: e.home ? [ +e.home.x.toFixed(0), +e.home.z.toFixed(0) ] : null };
      return out;
    })()`);
    chk('command', 'every enemy command the dropdown offers does something (build 1077)',
      !r.__threw && r.hold && r.hold.mode === 'hold' && r.hold.home && r.patrol.mode === 'patrol' &&
      r.hunt.mode === 'hunt' && r.calm.aware === false && r.calm.lkp === false &&
      r.alert.aware === true && r.alert.lkp && r.post.home && r.post.home[0] === B, r);
    chk('command', '...and a place nothing answers changes nothing (build 1214)',
      !r.__threw && r.refused && r.post.home && r.refused.home &&
      r.refused.home[0] === r.post.home[0] && r.refused.home[1] === r.post.home[1], r);
  }

  // ============================================================ FACTIONS
  {
    const r = await safe(P, `(function(){
      __clear();
      player.pos.set(__B, 1.7, __B - 40); player.hp = player.maxHp||100;   /* well out of it */
      camera.position.copy(player.pos); camera.updateMatrixWorld(true);
      const ally    = __spawn({ x: __B,   z: __B, type:'gunner', fac: 0 });
      const hostile = __spawn({ x: __B+6, z: __B, type:'gunner', fac: 1 });
      if(!ally || !hostile) return { err:'no spawn' };
      const a0 = ally.hp, h0 = hostile.hp, p0 = player.hp;
      __drive(600);
      /* the spawn descriptor key is 'fac'; what lands on the enemy is 'faction' — reading 'fac' back
         reports undefined on both, which looks exactly like the spawn ignoring the field */
      return { allyFac: ally.faction, hostileFac: hostile.faction, a0, h0, gate: __gate(),
               allyHp: ally.hp, hostileHp: hostile.hp,
               allyHurt: ally.hp < a0, hostileHurt: hostile.hp < h0,
               allyAware: !!ally.aware, hostileAware: !!hostile.aware,
               playerUntouched: player.hp === p0 };
    })()`);
    chk('factions', 'an ally and a hostile pick each other and leave the player alone (build 1355)',
      !r.__threw && r.allyFac === 0 && r.hostileFac === 1 &&
      (r.allyHurt || r.hostileHurt) && r.playerUntouched, r);
  }

  // ============================================================ A PACIFIST STAYS ONE
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      const npc = __spawn({ x: __B+4, z: __B+4, type:'grunt', friendly: true });
      const p0 = player.hp;
      __drive(300);
      const alive = (typeof _hostileAlive==='function') ? _hostileAlive() : null;
      return { friendly: !!npc.friendly, aware: !!npc.aware, playerHp: player.hp, p0, hostileAlive: alive };
    })()`);
    chk('npc', 'a friendly NPC never becomes aware, never attacks, and holds no wave open (build 1226)',
      !r.__threw && r.friendly && !r.aware && r.playerHp === r.p0 && r.hostileAlive === 0, r);
  }

  // ============================================================ IT REACTS TO BEING SHOT
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      const e = __spawn({ x: __B, z: __B - 8, type:'brute' });
      __drive(30);
      const hp0 = e.hp;
      /* a heavy hit from the player's side — build 1209's own threshold is a quarter of max HP */
      enemyHurt(e, Math.ceil(e.maxHp*0.3), player.pos.x, player.pos.z);
      const flinched = Math.hypot(e.evx||0, e.evz||0);
      const slowed = e._slowT||0;
      /* the flinch pushes AWAY from the shot, so an enemy north of the player moves further north */
      const z0 = e.mesh.position.z;
      __drive(10);
      return { hp0, hp1: e.hp, flinch:+flinched.toFixed(2), slowed:+slowed.toFixed(3),
               shoved:+(e.mesh.position.z - z0).toFixed(3) };
    })()`);
    chk('reaction', 'a heavy hit staggers an enemy and slows it (build 1209)',
      !r.__threw && r.hp1 < r.hp0 && r.flinch > 0.01 && r.slowed > 0, r);
  }

  // ============================================================ THE TELEGRAPH
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      const e = __spawn({ x: __B, z: __B - 2.2, type:'brute' });
      e.aware = true;
      let sawWindup = false, sawSquash = false;
      const p0 = player.hp;
      for(let i=0;i<240;i++){
        __drive(1);
        /* __vnow is the clock the drive just advanced — reading the real one here would say the wind-up
           is always still pending, which is what the first draft measured */
        if(e._windupT && __vnow < e._windupT){
          sawWindup = true;
          const v = e.mesh && e.mesh.children && e.mesh.children[0];
          if(e._teleSc != null && v && v.scale && Math.abs(v.scale.y - e._teleSc) > 1e-4) sawSquash = true;
        }
      }
      return { sawWindup, sawSquash, p0, playerHp: player.hp, hurt: player.hp < p0 };
    })()`);
    chk('telegraph', 'a melee enemy winds up before it hits, and lands the hit (builds 627/1367)',
      !r.__threw && r.sawWindup && r.hurt, r);
    chk('telegraph', '...and the capsule squashes while it winds up (build 1367)',
      !r.__threw && r.sawSquash, r);
  }

  // ============================================================ WAVES A CREATOR AUTHORED
  {
    const r = await safe(P, `(function(){
      __clear(); __home();
      /* parseWaveManifest returns an ARRAY of waves; manifestWaveDescriptors takes ONE of them */
      const waves = parseWaveManifest('2x brute, 1x runner');
      const d = manifestWaveDescriptors(waves[0], ARENA, Math.random);
      const kinds = {};
      for(const s of (d||[])) kinds[s.type] = (kinds[s.type]||0) + 1;
      /* and the per-level tuning reaches a spawn */
      const before = _enemyEff('grunt').hp;
      gameCfg.enemyMods = _sanitizeEnemyMods({ grunt: { hp: 999 } });
      const after = _enemyEff('grunt').hp;
      gameCfg.enemyMods = _sanitizeEnemyMods(null);
      return { waves: waves.length, kinds, n: (d||[]).length, before, after, restored: _enemyEff('grunt').hp };
    })()`);
    chk('waves', 'a wave manifest composes the squad a creator typed (build 1179)',
      !r.__threw && r.n === 3 && r.kinds.brute === 2 && r.kinds.runner === 1, r);
    chk('waves', '...and per-level enemy tuning reaches the spawn, then restores (build 1191)',
      !r.__threw && r.after === 999 && r.restored === r.before, r);
  }

  // ============================================================ IT CLIMBS
  {
    const r = await safe(P, `(function(){
      __clear();
      /* a ramp up to a ledge with the player on top — build 1158's own case, which shipped BROKEN for
         six hundred builds: an enemy at the foot of a 2.4 m ramp read 0.00 m of climb, forever */
      let ramp=null, top=null;
      spawnProp('wedge',[__B-20, 0, __B-6, 0,0,0, 5,2.4,8],(b)=>{ramp=b;});
      spawnProp('box',  [__B-20, 0, __B-14, 0,0,0, 8,2.4,8],(b)=>{top=b;});
      if(typeof refreshPropCollider==='function'){ if(ramp) refreshPropCollider(ramp); if(top) refreshPropCollider(top); }
      /* the nav grid is built once and only notices new geometry through a dirty rect (build 1200). Without
         this the enemy paths as though the ramp were open ground, walks PAST it, and stops at the
         platform's foot — a fixture fault that reads exactly like build 1158's own defect coming back. */
      if(typeof navDirtyRect==='function') navDirtyRect(__B-26, __B-20, __B-14, __B+1);
      player.pos.set(__B-20, 2.4+1.7, __B-14); player.vel.set(0,0,0);
      camera.position.copy(player.pos); camera.updateMatrixWorld(true);
      __drive(120);                                          /* let the dirty patch resample */
      const e = __spawn({ x: __B-20, z: __B-1, type:'grunt' });
      const y0 = e.mesh.position.y;
      let best = y0;
      for(let i=0;i<120;i++){ __drive(10); if(e.mesh.position.y > best) best = e.mesh.position.y; }
      const out = { y0:+y0.toFixed(2), best:+best.toFixed(2), climbed:+(best-y0).toFixed(2), at: __at(e),
                    toPlayer: +Math.hypot(e.mesh.position.x-player.pos.x, e.mesh.position.z-player.pos.z).toFixed(1) };
      try{ removeProp(ramp); removeProp(top); }catch(e){}
      return out;
    })()`);
    chk('climb', 'an enemy walks UP a ramp to reach a player above it (build 1158)',
      !r.__threw && r.climbed > 1.5, r);
  }

  // put the world back the way the sweep found it — including the frame loop
  await safe(P, `(function(){ __clear(); __wavesOn(); __home(); _tabHidden = false; return 1; })()`);

  const w = Math.max(...R.map(r => r.name.length));
  let g = '';
  console.log('\n  AI BOOTH — driven in the running game\n  ' + '='.repeat(w + 12));
  for (const r of R) {
    if (r.group !== g) { g = r.group; console.log('  ' + g.toUpperCase()); }
    console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(w));
    if (!r.ok) console.log('           ' + JSON.stringify(r.detail));
  }
  const bad = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
