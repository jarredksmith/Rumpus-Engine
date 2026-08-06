// The MOVEMENT & TRAVERSAL booth, driven in the running game.
//
// The fourth of the gauntlet's five scoped sections and the one with no end-to-end coverage at all. Every
// traversal verb here has a build behind it — variable jump height (1301), coyote time and the press buffer
// (1160), the slide (926), the ledge grab (966/1239/1243/1244/1289/1290), the mantle's exit momentum and
// air control (1361), jump pads (993), ladders, water, effect zones (1193) — and not one of them has ever
// been checked from the player's actual inputs in a running frame loop.
//
// Instrument: tools/probe/drive.mjs. Discipline, earned by the three booths before it — drive the REAL
// entry point, read a REAL observable (a world position, a velocity, a state flag), isolate every call so
// one unknown identifier cannot end the run, build every fixture INSIDE the arena but away from the stock
// geometry (the ground plane stops at +-ARENA), and put the world back afterwards.
import { withGame } from './driver.mjs';
import { DRIVE_RIG, DRIVE_CONTROL } from './drive.mjs';

const R = [];
const chk = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

const B = 40;   // the booth's corner, inside the arena and clear of the stock level

await withGame(async (P) => {
  const rig = await safe(P, `(function(){
    paused = false; gameOn = true;
    window.__B = ${B};
    ${DRIVE_RIG}

    /* the player's own inputs, driven the way the keyboard drives them */
    window.__keys = function(o){ for(const k in o){ if(o[k]) keys[k]=true; else delete keys[k]; } };
    window.__allKeysOff = function(){ for(const k of Object.keys(keys)) delete keys[k]; _jPressed=false; };
    /* A FULL RESET, not a teleport. Every check here leaves state behind — a jump cooldown, a slide
       cooldown, a pad cooldown, a live coyote or buffer window, a ledge record, a ladder engagement — and
       the next check then measures the leftovers. Two of this booth's three "engine defects" were exactly
       that: a ramp the player climbed perfectly on its own stalled halfway when run after the ledge check,
       and a jump pad that imparts 21.7 m/s standalone read "launched 0" in sequence. Anything a check can
       set, this clears.
       Yaw is a PARAMETER rather than a constant, because the first draft set it after the settle frames had
       already run facing the other way. Engine forward is (-sin yaw, -cos yaw), so PI faces +Z and 0 faces -Z. */
    window.__stand = function(x, z, y, yaw){
      __allKeysOff();
      player.pos.set(x, (y==null?1.7:y), z); player.vel.set(0,0,0);
      player.yaw = (yaw==null) ? Math.PI : yaw; player.pitch = 0;
      player.onGround = true; player.hp = player.maxHp || 100;
      player.jumpCd = 0;
      sliding = false; slideT = 0; _ledge = null;
      if(typeof slideCD!=='undefined') slideCD = 0;
      if(typeof _slideBufT!=='undefined') _slideBufT = 0;
      if(typeof _sprintGraceT!=='undefined') _sprintGraceT = 0;
      if(typeof _coyoteT!=='undefined') _coyoteT = 0;
      if(typeof _jumpBufT!=='undefined') _jumpBufT = 0;
      if(typeof _jpPlayerCd!=='undefined') _jpPlayerCd = 0;
      if(typeof _onLadder!=='undefined') _onLadder = false;
      if(typeof _ladderEngaged!=='undefined') _ladderEngaged = false;
      if(typeof _climbAnim!=='undefined') _climbAnim = 0;
      camera.position.copy(player.pos); camera.updateMatrixWorld(true);
      __drive(4);                                        /* settle onto whatever is underfoot */
    };
    window.__feet = function(){ return +(player.pos.y - EYE).toFixed(3); };
    window.__apex = function(frames){
      let top = player.pos.y;
      for(let i=0;i<(frames||90);i++){ __drive(1); if(player.pos.y > top) top = player.pos.y; }
      return +(top - EYE).toFixed(3);
    };
    /* THE JUMP IS A KEY, NOT A FLAG. _jPressed is a per-frame const derived inside loop() from the
       held key's rising edge — setting it from outside is overwritten before it is read, and the first
       draft of this booth did exactly that and measured "the jump never fires" three ways. A tap presses
       the real key for one frame; a hold leaves it down. */
    window.__tap = function(){ keys[BINDS.jump] = true; __drive(1); delete keys[BINDS.jump]; };
    window.__holdJump = function(){ keys[BINDS.jump] = true; __drive(1); };

    window.__zones0 = { pads: jumpPads.length, ladders: ladders.length,
                        water: waterZones.length, fx: (typeof fxZones!=='undefined') ? fxZones.length : 0 };
    window.__zonesClear = function(){
      jumpPads.length = __zones0.pads; ladders.length = __zones0.ladders;
      waterZones.length = __zones0.water;
      if(typeof fxZones!=='undefined') fxZones.length = __zones0.fx;
      if(typeof refreshWaterZones==='function') try{ refreshWaterZones(); }catch(e){}
    };
    window.__props = [];
    window.__prim = function(kind, x,y,z, sx,sy,sz){
      let o=null; spawnProp(kind,[x, y, z, 0,0,0, sx,sy,sz],(b)=>{o=b;});
      if(o){ if(typeof refreshPropCollider==='function') refreshPropCollider(o); __props.push(o); }
      return o;
    };
    window.__box = function(x,y,z, sx,sy,sz){ return __prim('box', x,y,z, sx,sy,sz); };
    /* A FIXTURE IS ONLY SOLID ONCE PHYSICS KNOWS ABOUT IT. The player's ground support comes from Rapier,
       and a prop spawned at runtime gets its body from a DEBOUNCED tick that runs on the wall clock — which
       a synchronous frame drive never reaches. Build 1409 is the engine fix for a prop the GRAPH spawns;
       here the fixtures stand in for authored level geometry, so they are made solid the way DEPLOY does
       it. Without this the player falls through every slab and walks through every ramp, which reads
       exactly like broken movement — it is what this booth measured on its first four runs. */
    window.__solid = function(){ if(typeof buildPhysWorld==='function') buildPhysWorld(); };
    window.__clearProps = function(){ for(const o of __props.splice(0)) try{ __kill(o); }catch(e){}
      __solid(); };

    __wavesOff(); __clearEnemies();
    return { ok:1 };
  })()`);
  chk('rig', 'the booth rig is up', !rig.__threw && rig.ok === 1, rig);

  const ctl = await safe(P, DRIVE_CONTROL);
  chk('rig', 'the drive really simulates: a control enemy closes on the player',
    !ctl.__threw && ctl.droveFrames === 120 && ctl.controlMoved > 4 && ctl.gate === '', ctl);

  // ============================================================ JUMP, AND HOW LONG YOU HOLD IT
  {
    const r = await safe(P, `(function(){
      __stand(__B, __B);
      /* HOLD: the key stays down for the whole ascent */
      __holdJump();
      const held = __apex(90);
      __stand(__B, __B);
      /* TAP: one frame of key. Height goes as v-squared, so half the launch velocity is a quarter of the
         height — build 1301's whole design in one constant. */
      __tap();
      const tapped = __apex(90);
      __stand(__B, __B);
      __allKeysOff();
      return { held, tapped, cut: (typeof JUMP_CUT_MIN!=='undefined') ? JUMP_CUT_MIN : null,
               ratio: +(tapped/held).toFixed(2) };
    })()`);
    chk('jump', 'a held jump clears about the height it always did', !r.__threw && r.held > 2.4 && r.held < 3.2, r);
    chk('jump', 'and releasing early gives a real short hop (build 1301)',
      !r.__threw && r.tapped > 0.3 && r.tapped < r.held * 0.6, r);
  }

  // ============================================================ COYOTE TIME AND THE PRESS BUFFER
  {
    const r = await safe(P, `(function(){
      /* a ledge to run off: a slab whose edge is at z = __B + 4 */
      __clearProps();
      __box(__B, 0, __B, 8, 3, 8);                       /* top at y = 3, spans z __B-4 .. __B+4 */
      __solid();
      __stand(__B, __B, 3 + EYE);
      const onSlab = __feet();

      /* walk off the edge, then jump a couple of frames LATE — the press lands with no ground under it */
      keys[BINDS.fwd] = true;
      let left = -1;
      for(let i=0;i<120 && left<0;i++){ __drive(1); if(!player.onGround) left = i; }
      __drive(2);                                        /* two frames of air: inside COYOTE_T */
      const airborne = !player.onGround;
      const vy0 = player.vel.y;
      __tap();
      const coyoteWorked = player.vel.y > vy0 + 5;
      delete keys[BINDS.fwd];

      /* the buffer: press while still falling, land, and the jump must survive the wait */
      /* THE BUFFER IS 0.15 s — nine frames. The first draft tapped at the top of a five-metre fall, which
         is a full second of air, so it expired long before the landing and read as "the buffer does not
         work". Fall until the ground is close, THEN press early. */
      __stand(__B, __B, 8 + EYE);
      for(let i=0;i<120 && (player.pos.y - EYE) > 3.6; i++) __drive(1);
      const falling = !player.onGround && player.vel.y < 0;
      __tap();                                           /* early, but inside the window */
      let landed = false, bounced = false;
      for(let i=0;i<60;i++){ __drive(1); if(player.onGround) landed = true;
        if(landed && player.vel.y > 1){ bounced = true; break; } }

      __allKeysOff(); __clearProps(); __stand(__B, __B);
      return { onSlab, left, airborne, coyoteWorked, falling, landed, bounced,
               coyote: (typeof COYOTE_T!=='undefined') ? COYOTE_T : null,
               buf: (typeof JUMP_BUF!=='undefined') ? JUMP_BUF : null };
    })()`);
    chk('jump', 'a jump pressed just after walking off a ledge still fires (coyote, build 1160)',
      !r.__threw && r.airborne && r.coyoteWorked, r);
    chk('jump', '...and one pressed just before landing is not eaten (buffer, build 1160)',
      !r.__threw && r.falling && r.landed && r.bounced, r);
  }

  // ============================================================ AIR CONTROL DOES NOT BRAKE
  {
    const r = await safe(P, `(function(){
      /* GENUINELY AIRBORNE. The first draft launched from the floor: the very first driven frame found the
         player standing on it, applied GROUND movement, and clamped 21 to the run speed before air control
         ever ran — which reads exactly like air control braking. Start well above it. */
      const LAUNCH = 21;
      __clearProps(); __solid();      /* nothing under them at all */
      const launch = () => { __stand(__B, __B); player.pos.y = 30 + EYE;
        player.vel.set(0, 0, LAUNCH); player.onGround = false; __drive(1); };

      launch(); keys[BINDS.fwd] = true;
      let minAlong = 1e9;
      for(let i=0;i<30;i++){ __drive(1); if(player.vel.z < minAlong) minAlong = player.vel.z; }
      const heldKept = +minAlong.toFixed(2);

      launch(); __allKeysOff();
      let minRel = 1e9;
      for(let i=0;i<30;i++){ __drive(1); if(player.vel.z < minRel) minRel = player.vel.z; }
      const released = +minRel.toFixed(2);

      __allKeysOff(); __stand(__B, __B);
      return { LAUNCH, heldKept, released };
    })()`);
    /* build 1361 proves the exact invariant (the along-wish component is preserved to 1e-9) against the
       extracted movement block; end to end there is more in the frame than that block, so what this booth
       claims is the property a player feels: holding forward through a fast jump keeps materially more
       speed than letting go, which is the inverse of the defect 1361 fixed (holding used to be SLOWER). */
    chk('air', 'holding forward through a fast jump keeps far more speed than releasing (build 1361)',
      !r.__threw && r.heldKept > r.released * 1.3, r);
  }

  // ============================================================ THE SLIDE
  {
    const r = await safe(P, `(function(){
      __stand(__B, __B);
      keys[BINDS.fwd] = true; keys[BINDS.sprint] = true;
      __drive(45);                                       /* get up to sprint speed */
      const runSpeed = +Math.hypot(player.vel.x, player.vel.z).toFixed(2);
      keys[BINDS.slide] = true; __drive(1); delete keys[BINDS.slide];
      const started = !!sliding;
      let peak = 0;
      for(let i=0;i<40;i++){ __drive(1); const s=Math.hypot(player.vel.x, player.vel.z); if(s>peak) peak=s; }
      __drive(60);
      const ended = !sliding;
      __allKeysOff(); __stand(__B, __B);
      return { runSpeed, started, peak:+peak.toFixed(2), ended, faster: peak > runSpeed };
    })()`);
    chk('slide', 'sprint + slide starts a slide that is faster than the run it came from (build 926)',
      !r.__threw && r.started && r.faster && r.ended, r);
  }

  // ============================================================ THE LEDGE
  {
    const r = await safe(P, `(function(){
      __clearProps();
      /* a wall whose top is above head height — build 1239: below MANTLE_MIN you simply jump onto it */
      __box(__B, 0, __B + 6, 8, 3.2, 2);                 /* top y = 3.2, near face at z = __B + 5 */
      __solid();
      __stand(__B, __B + 2);                             /* three metres short of it, facing +Z */
      keys[BINDS.fwd] = true;
      let phase = null, hangY = null;
      for(let i=0;i<200 && !phase; i++){
        if(i % 26 === 0) __tap();
        __drive(1);
        if(_ledge){ phase = _ledge.ph; hangY = +player.pos.y.toFixed(2); }
      }
      /* let it pull up */
      let ended = null, exitSpeed = null;
      for(let i=0;i<240 && _ledge; i++) __drive(1);
      if(!_ledge){ ended = +__feet().toFixed(2); exitSpeed = +Math.hypot(player.vel.x, player.vel.z).toFixed(2); }
      __allKeysOff(); const out = { phase, hangY, ended, exitSpeed, onTop: ended != null && ended > 2.9 };
      __clearProps(); __stand(__B, __B);
      return out;
    })()`);
    chk('ledge', 'running at a head-height wall grabs it (builds 1244/1290)', !r.__threw && r.phase, r);
    chk('ledge', '...and the pull-up finishes standing on top of it', !r.__threw && r.onTop, r);
  }

  // ============================================================ A RAMP IS WALKABLE
  {
    const r = await safe(P, `(function(){
      __clearProps();
      __prim('wedge', __B, 0, __B + 8, 6, 2.4, 8);
      __solid();
      /* the wedge is flat at +Z and rises toward -Z, so approach from +Z facing -Z. Engine forward is
         (-sin yaw, -cos yaw), so yaw 0 faces -Z. */
      __stand(__B, __B + 14, null, 0);                   /* yaw 0 faces -Z, up the wedge */
      keys[BINDS.fwd] = true;
      const y0 = __feet();
      let top = y0; const tr = []; let stall = null, still = 0, prevZ = player.pos.z;
      for(let i=0;i<240;i++){ __drive(1); const f=__feet(); if(f>top) top=f;
        if(i%40===0) tr.push([+player.pos.z.toFixed(1), f]);
        /* a check that fails should say WHY — eight frames of no progress, then dump the state */
        if(Math.abs(player.pos.z - prevZ) < 0.005){ still++;
          if(still === 8 && !stall) stall = { z:+player.pos.z.toFixed(2), feet:f,
            vz:+player.vel.z.toFixed(2), vy:+player.vel.y.toFixed(2), onGround:player.onGround,
            ledge:_ledge?_ledge.ph:null, sliding,
            props: propModels.length, colliders: colliders.length,
            surfHere:+surfaceTopAt(player.pos.x, player.pos.z).toFixed(2),
            surfAhead:+surfaceTopAt(player.pos.x, player.pos.z-0.6).toFixed(2),
            inSolid: (typeof insideSolid==='function') ? String(insideSolid(player.pos.x, player.pos.z-0.6, f)) : '?' }; }
        else still = 0;
        prevZ = player.pos.z; }
      __allKeysOff();
      const out = { y0, top, tr, stall, climbed: +(top - y0).toFixed(2) };
      __clearProps(); __stand(__B, __B);
      return out;
    })()`);
    chk('ramp', 'the player walks UP a ramp rather than being stopped by it',
      !r.__threw && r.climbed > 1.8, r);
  }

  // ============================================================ A JUMP PAD LAUNCHES
  {
    const r = await safe(P, `(function(){
      __zonesClear();
      jumpPads.push(_migrateJumpPad({ x: __B, z: __B, r: 6, y: 0, h: 2, power: 22 }));
      /* PLACE FIRST, THEN ARM. __stand settles the player for four frames, and standing on a pad IS the
         trigger — so the first draft launched during the settle and then measured the rise from a player
         who was already several metres up, reading "the pad did nothing". Put them down with the pad
         cooled, then let it fire and watch the velocity it imparts. */
      __stand(__B, __B);
      const y0 = player.pos.y;
      let top = y0, kick = 0;
      for(let i=0;i<120;i++){ __drive(1);
        if(player.vel.y > kick) kick = player.vel.y;
        if(player.pos.y > top) top = player.pos.y; }
      const out = { kick: +kick.toFixed(1), launched: +(top - y0).toFixed(2) };
      __zonesClear(); __stand(__B, __B);
      return out;
    })()`);
    chk('zones', 'a jump pad throws the player well above a jump (build 993)',
      !r.__threw && r.kick > 15 && r.launched > 4, r);
  }

  // ============================================================ A LADDER CLIMBS
  {
    const r = await safe(P, `(function(){
      __zonesClear();
      ladders.push(_migrateLadder({ x: __B, z: __B, r: 2, y: 0, h: 8, face: 0 }));
      __stand(__B, __B);
      const y0 = __feet();
      keys[BINDS.fwd] = true;
      __drive(150);
      const y1 = __feet();
      __allKeysOff(); __zonesClear(); __stand(__B, __B);
      return { y0, y1, climbed: +(y1 - y0).toFixed(2) };
    })()`);
    chk('zones', 'a ladder carries the player upward', !r.__threw && r.climbed > 1.5, r);
  }

  // ============================================================ EFFECT ZONES CHANGE THE RULES
  {
    const r = await safe(P, `(function(){
      if(typeof fxZones === 'undefined') return { skip: 'no fxZones in this build' };
      __zonesClear();
      /* a control apex on plain ground first, then the same jump inside low gravity */
      __stand(__B, __B);
      __holdJump();
      const plain = __apex(90);
      __allKeysOff(); __stand(__B, __B);

      fxZones.push(_migrateFxZone({ x: __B, z: __B, r: 20, y: 0, h: 30, kind:'lowgrav', amt: 70, who:'players' }));
      __holdJump();
      const moon = __apex(120);
      __allKeysOff(); __stand(__B, __B);

      /* and haste, measured as ground speed rather than height */
      fxZones.length = __zones0.fx;
      keys[BINDS.fwd] = true; __drive(60);
      const walk = +Math.hypot(player.vel.x, player.vel.z).toFixed(2);
      __allKeysOff(); __stand(__B, __B);
      fxZones.push(_migrateFxZone({ x: __B, z: __B, r: 20, y: 0, h: 30, kind:'haste', amt: 80, who:'players' }));
      keys[BINDS.fwd] = true; __drive(60);
      const fast = +Math.hypot(player.vel.x, player.vel.z).toFixed(2);

      __allKeysOff(); __zonesClear(); __stand(__B, __B);
      return { plain, moon, walk, fast };
    })()`);
    chk('zones', 'a low-gravity zone makes the same jump go higher (build 1193)',
      !r.__threw && !r.skip && r.moon > r.plain * 1.2, r);
    chk('zones', '...and a haste zone makes the same walk faster',
      !r.__threw && !r.skip && r.fast > r.walk * 1.1, r);
  }

  // ============================================================ WATER SLOWS AND HOLDS YOU UP
  {
    const r = await safe(P, `(function(){
      __zonesClear();
      __stand(__B, __B);
      keys[BINDS.fwd] = true; __drive(60);
      const dry = +Math.hypot(player.vel.x, player.vel.z).toFixed(2);
      __allKeysOff();

      waterZones.push(_migrateWaterZone({ x: __B, z: __B, r: 20, y: 0, h: 6 }));
      if(typeof refreshWaterZones==='function') try{ refreshWaterZones(); }catch(e){}
      __stand(__B, __B);
      keys[BINDS.fwd] = true; __drive(60);
      const wet = +Math.hypot(player.vel.x, player.vel.z).toFixed(2);

      /* and a fall into it does not accelerate forever */
      __allKeysOff();
      player.pos.set(__B, 5 + EYE, __B); player.vel.set(0, -20, 0); player.onGround = false;
      __drive(60);
      const sinkSpeed = +Math.abs(player.vel.y).toFixed(2);

      __allKeysOff(); __zonesClear(); __stand(__B, __B);
      return { dry, wet, sinkSpeed, slower: wet < dry * 0.95 };
    })()`);
    chk('zones', 'water slows the player and breaks their fall',
      !r.__threw && r.slower && r.sinkSpeed < 12, r);
  }

  // ============================================================ THE GRAPH CAN MOVE YOU
  {
    const r = await safe(P, `(function(){
      __clearProps();
      const pad = __box(__B - 25, 0, __B - 25, 2, 0.2, 2);
      if(pad) pad.userData.tag = 'exit';
      __solid();
      __stand(__B, __B);
      const from = [ +player.pos.x.toFixed(1), +player.pos.z.toFixed(1) ];
      logicGraph.nodes = (logicGraph.nodes||[]).filter(n => n.id !== 'mv1');
      logicGraph.nodes.push({ id:'mv1', type:'do', x:0, y:0, p:{ verb:'teleport', who:'player', at:'exit' } });
      _lgBudget = 0; _lgPulse('mv1');
      const to = [ +player.pos.x.toFixed(1), +player.pos.z.toFixed(1) ];
      logicGraph.nodes = logicGraph.nodes.filter(n => n.id !== 'mv1');
      const out = { from, to, moved: Math.hypot(to[0]-from[0], to[1]-from[1]) > 20,
                    landedOnPad: Math.hypot(to[0]-(__B-25), to[1]-(__B-25)) < 3 };
      __clearProps(); __stand(__B, __B);
      return out;
    })()`);
    chk('logic', 'the teleport verb puts the player at a named place', !r.__threw && r.moved && r.landedOnPad, r);
  }

  // put the world back
  await safe(P, `(function(){ __allKeysOff(); __clearProps(); __zonesClear(); __clearEnemies();
    __wavesOn(); __stand(0, 0); __release(); return 1; })()`);

  const w = Math.max(...R.map(r => r.name.length));
  let g = '';
  console.log('\n  MOVEMENT & TRAVERSAL BOOTH — driven from the player\'s own inputs\n  ' + '='.repeat(w + 12));
  for (const r of R) {
    if (r.group !== g) { g = r.group; console.log('  ' + g.toUpperCase()); }
    console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(w));
    if (!r.ok) console.log('           ' + JSON.stringify(r.detail));
  }
  const bad = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
