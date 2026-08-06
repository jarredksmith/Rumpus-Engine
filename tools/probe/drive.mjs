// The frame drive, shared.
//
// There is no `updateEnemyAI` and no `updatePlayer` — the simulation is INLINE in `loop()`. And real frames
// are useless in this sandbox: measured, `_frameNo` advances exactly 3 times in 3 seconds, so the few
// simulated seconds a chase or a jump arc needs would take real minutes.
//
// `__drive(n)` calls the REAL `loop()` n times with drawing switched off. Measured: 300 frames in 469 ms.
// Everything the engine simulates is untouched; only `renderer.render` and the rAF re-arm are neutralised.
//
// Three things in it are load-bearing, and each cost a run to find (see CLAUDE.md, build 1406's AI booth):
//
//  - `loop()` early-returns past the ENTIRE simulation when any UI gate is up — the level loader, a
//    cutscene, an interstitial, the shop, the upgrade picker, the map, the inventory, `paused` — and
//    `_frameNo` is bumped BEFORE all of them, so a drive that simulated nothing still reports its full
//    frame count. Clearing the field reaches `beginUpgradeChoice`, which is how two runs of one sweep
//    disagreed 8/15 against 11/15 on an unchanged tree.
//  - Half the engine's timers are wall-clock TIMESTAMPS rather than countdowns, so simulated time has to be
//    the clock everything reads. It is a PURE counter: clamping it forward to the real clock advanced it at
//    the real rate — 2 ms a call instead of 16.67 — and an actor twenty simulated seconds into a chase had
//    not moved.
//  - The page's own rAF keeps firing between probe calls, and those frames would tick on the real clock,
//    which by then is a different timeline. `_tabHidden` is the engine's own "do not simulate" switch and
//    is held ON outside the drives.
//
// Every probe that uses this must call `__release()` before it finishes, or the page stays frozen.
export const DRIVE_RIG = `
  window.__gates = ['_levelLoaderActive','_cineActive','_interActive','shopOpen','choosingUpgrade',
                    'mapOpen','invOpen','paused','gameOver'];
  window.__gate = function(){
    for(const g of __gates){ try { if(eval(g)) return g; } catch(e){} }
    return (typeof gameOn!=='undefined' && !gameOn) ? 'gameOn' : '';
  };
  window.__ungate = function(){
    paused = false; gameOn = true;
    /* gameOver does not stop the frame loop, but it stands down the jump pads, the death zones and the
       rest of the zone updates — so a sweep that only cleared the loop's own gates measured "a jump pad
       does nothing" with the pad and the player both exactly where they should be. */
    if(typeof gameOver!=='undefined') gameOver = false;
    if(typeof shopOpen!=='undefined') shopOpen = false;
    if(typeof choosingUpgrade!=='undefined') choosingUpgrade = false;
    if(typeof mapOpen!=='undefined') mapOpen = false;
    if(typeof invOpen!=='undefined') invOpen = false;
    if(typeof _levelLoaderActive!=='undefined') _levelLoaderActive = false;
    if(typeof _cineActive!=='undefined') _cineActive = false;
    if(typeof _interActive!=='undefined') _interActive = false;
  };
  window.__vnow = performance.now() + 1e5;   // clear of the real clock: only the drive advances it
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
  window.__release = function(){ _tabHidden = false; __ungate(); };

  /* REMOVEPROP TAKES AN INDEX, NOT A PROP. Every probe in this directory had been calling it with the
     object — propModels[obj] is undefined and it returns immediately, so the fixture stayed in the world
     AND in the collider list. That is silent: the next check then measures a scene it thinks it cleared. It cost
     two false engine defects in the movement booth (a ramp the player climbs perfectly "stalled" halfway
     against the previous check's 3.2 m wall, and a jump pad "did nothing" with a leftover slab under it).
     __kill takes the prop. */
  window.__kill = function(o){ if(!o) return false;
    const i = propModels.indexOf(o); if(i < 0) return false;
    removeProp(i); return true; };

  /* the wave machine, off through the engine's own switch rather than by poking a timer: build 685's
     puzzle objective makes noEnemyMode() true, so the whole wave block is skipped */
  window.__obj0 = gameCfg.objective;
  window.__wavesOff = () => { gameCfg.objective = 'puzzle';
    if(typeof spawnQueue!=='undefined') spawnQueue.length = 0;
    if(typeof toSpawn!=='undefined') toSpawn = 0;
    if(typeof choosingUpgrade!=='undefined') choosingUpgrade = false; };
  window.__wavesOn = () => { gameCfg.objective = __obj0; };
  window.__clearEnemies = () => { for(let i=enemies.length-1;i>=0;i--){ try{ killEnemy(enemies[i]); }catch(e){} }
    enemies.length = 0; __wavesOff(); };
`;

// The positive control every sweep that drives frames should run first: prove the instrument can produce a
// result before believing any null it reports. Returns { droveFrames, controlMoved, gate }.
export const DRIVE_CONTROL = `(function(){
  __wavesOff(); __clearEnemies();
  const f0 = _frameNo;
  const e = (function(){ const n=enemies.length; spawnEnemy({ x: player.pos.x, z: player.pos.z - 20, type:'grunt' });
    return enemies.length > n ? enemies[enemies.length-1] : null; })();
  const z0 = e ? e.mesh.position.z : null;
  __drive(120);
  const moved = e ? +(e.mesh.position.z - z0).toFixed(2) : null;
  __clearEnemies();
  return { droveFrames: _frameNo - f0, controlMoved: moved, gate: __gate() };
})()`;
