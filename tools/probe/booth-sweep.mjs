// The MOVEMENT/TRAVERSAL and LOGIC/INTERACTION booths, verified end to end in the running game.
//
// Companion to feature-sweep.mjs, aimed at the gauntlet being built against this engine: a county-fair
// layout where each booth demonstrates one system. Anything a booth leans on has to be known-good BEFORE
// it is built against, not after — build 1277's six dead verbs shipped for builds because every source pin
// passed and nothing drove the wire.
//
// Same discipline as the first sweep, and it was earned there: every check drives the real entry point and
// reads a real observable, every probe call is isolated so one unknown identifier cannot end the run, and
// anything that mutates shared state restores it — a death-zone check that left the player dead made three
// later checks read as broken features (build 1345's failure #5, again).
import { withGame } from './driver.mjs';

const R = [];
const chk = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P) => {
  await P(`(function(){ paused=false; gameOn=true; player.hp = player.maxHp||100;
    window.__mk = function(tag, x, y, z, f){ let o=null;
      spawnProp('box',[x,y,z,0,0,0,2,2,2],(b)=>{o=b;}); if(o){ o.userData.tag=tag; if(f) f(o); } return o; };
    window.__home = function(){ player.pos.set(0,1.7,0); player.vel.set(0,0,0);
      camera.position.copy(player.pos); camera.rotation.set(0,0,0,'YXZ'); camera.updateMatrixWorld(true); };
    return 1; })()`);

  // ============================================================ MOVEMENT / TRAVERSAL ================
  {
    const r = await safe(P, `(function(){
      jumpPads.length = 0;
      jumpPads.push(_migrateJumpPad({ x:500, z:500, r:6, h:3 }));   /* power defaults to 22 - passing 1 launches at 1 */
      /* player.pos.y is the EYE, not the feet — at 0.1 the feet sit at -1.6, well under the pad's band. */
      player.pos.set(500, 1.8, 500); player.vel.set(0,0,0); player.onGround = true;
      gameOver = false; _jpPlayerCd = 0;
      for(let i=0;i<6;i++) updateJumpPads(0.05);
      const vy = player.vel.y;
      jumpPads.length = 0; window.__home();
      return { launched: +vy.toFixed(2), up: vy > 4,
               gates: { gameOn: gameOn, paused: paused, gameOver: gameOver, editorOpen: editorOpen } };
    })()`);
    chk('traversal', 'a jump pad launches the player upward', !r.__threw && r.up, r);
  }
  {
    const r = await safe(P, `(function(){
      ladders.length = 0;
      ladders.push(_migrateLadder({ x:520, z:520, r:3, h:8 }));
      const on = ladderAt(520, 520, 0.5);
      const off = ladderAt(560, 560, 0.5);
      ladders.length = 0;
      return { onLadder: !!on, offLadder: !!off };
    })()`);
    chk('traversal', 'a ladder is detected under the player and not elsewhere',
        !r.__threw && r.onLadder && !r.offLadder, r);
  }
  {
    // Build 1244 found the mantle probe never reached the wall for three builds. Drive the real resolver
    // against real geometry: a ledge at chest-plus height in front of the player must be grabbable.
    const r = await safe(P, `(function(){
      const led = window.__mk('ledge', 540, 0, 540, o=>{ o.scale.set(4, 2.4, 4); refreshPropCollider(o); });
      if(!led) return { err:'no prop' };
      if(colliders.indexOf(led) < 0) colliders.push(led);
      /* MANTLE_MIN 1.55 .. MANTLE_MAX 2.05 above the FEET. The box is base-at-origin and 2.4 tall, so
         the feet must sit near 0.5 for the lip to land inside that window — at y=3.0 the rise was 1.1 and
         no ledge in the level would have grabbed. */
      player.pos.set(540, 2.2, 536.0); player.yaw = 0; player.pitch = 0;
      camera.position.copy(player.pos); camera.rotation.set(0,0,0,'YXZ'); camera.updateMatrixWorld(true);
      const hits = [];
      for(let z = 537.2; z <= 539.0; z += 0.3){
        player.pos.set(540, 2.2, z);
        const m = mantleLedge(540, z, player.pos.y - (typeof EYE!=='undefined' ? EYE : 1.7));
        if(m) hits.push(+z.toFixed(1));
      }
      window.__home();
      return { grabbedAt: hits, any: hits.length > 0 };
    })()`);
    chk('traversal', 'a ledge at chest height can be grabbed (build 1244)', !r.__threw && r.any, r);
  }
  {
    const r = await safe(P, `(function(){
      /* The buoyancy lives in the movement block and asks _waterAt(x,y,z); updateWaterZones is the
         VISUAL (surface mesh + tint). So the real observable is the query the movement reads.
         NO BACKTICKS in a comment inside a template literal — fifth time this session (1328/1342/1357). */
      waterZones.length = 0;
      waterZones.push(_migrateWaterZone({ x:560, z:560, r:10, y:0, h:6 }));
      const inside  = _waterAt(560, 1.0, 560);
      const above   = _waterAt(560, 20.0, 560);
      const outside = _waterAt(700, 1.0, 700);
      waterZones.length = 0; window.__home();
      return { inside: !!inside, surf: inside ? +(inside.surfY!=null?inside.surfY:inside.y||0).toFixed(2) : null,
               above: !!above, outside: !!outside,
               ok: !!inside && !outside };
    })()`);
    chk('traversal', 'the water query the movement reads reports submersion, and only inside the zone',
        !r.__threw && r.ok, r);
  }
  {
    const r = await safe(P, `(function(){
      const s = { walk: player.walk, run: player.run, jump: player.jump };
      // the movement model itself: acceleration exists and is bounded (build 1171)
      return { walk: worldCfg.walk, run: worldCfg.run, jump: worldCfg.jump,
               jumpCut: worldCfg.jumpCut, crouch: worldCfg.crouch,
               sane: worldCfg.run > worldCfg.walk && worldCfg.jump > 0 && worldCfg.jumpCut > 0 };
    })()`);
    chk('traversal', 'walk/run/jump/crouch and the variable-jump cut are all authored', !r.__threw && r.sane, r);
  }

  // ============================================================ LOGIC / INTERACTION ================
  {
    // a door: an xa mechanism driven by the toggle verb, which is how a booth's door actually works
    const r = await safe(P, `(function(){
      const door = window.__mk('door', 600, 0, 600);
      if(!door) return { err:'no prop' };
      xaApply(door, { mode:'once', trig:'signal', mx:0, my:4, mz:0, dur:1 });
      const y0 = door.position.y;
      logicGraph.nodes = [ { id:'ev', type:'event', x:0,y:0, p:{name:'D'} },
                           { id:'n1', type:'do', x:1,y:0, p:{ verb:'toggle', target:'door' } } ];
      logicGraph.wires = [ { a:'ev', o:0, b:'n1', i:'in' } ];
      _lgFireEvents('event','D');
      for(let i=0;i<20;i++) updateXAnim(0.05);
      return { y0: y0, y1: door.position.y, moved: Math.abs(door.position.y - y0) > 0.3 };
    })()`);
    chk('interaction', 'a door mechanism opens when the graph toggles it', !r.__threw && r.moved, r);
  }
  {
    const r = await safe(P, `(function(){
      const plate = window.__mk('plate', 610, 0, 610);
      if(!plate) return { err:'no prop' };
      plate.userData.signals = [ { when:'enter', do:'setvar', target:'' } ];
      logicVars = {};
      // the real signal path: fireSignals is the one chokepoint every prop signal goes through
      let threw = null;
      try { fireSignals(plate, 'destroyed'); } catch(e){ threw = String(e.message); }
      return { fired: threw === null, threw: threw };
    })()`);
    chk('interaction', 'prop signals fire through their chokepoint without throwing', !r.__threw && r.fired, r);
  }
  {
    const r = await safe(P, `(function(){
      const chest = window.__mk('locked', 620, 0, 620, o=>{ o.userData.lockId = 'redkey'; });
      if(!chest) return { err:'no prop' };
      /* keys are playerKeys, a store of their own — NOT inventory items. giveItem was never going to
         open a lock, and it looked exactly like a broken lock system. */
      for(const k in playerKeys) delete playerKeys[k];
      const without = tryUnlockProp(chest);
      playerKeys['redkey'] = true;
      chest.userData.unlocked = false;
      const withKey = tryUnlockProp(chest);
      for(const k in playerKeys) delete playerKeys[k];
      return { lockedWithoutKey: without !== true, opensWithKey: withKey !== false,
               unlockedFlag: !!chest.userData.unlocked };
    })()`);
    chk('interaction', 'a locked prop refuses without the key and opens with it',
        !r.__threw && r.lockedWithoutKey && r.opensWithKey, r);
  }
  {
    const r = await safe(P, `(function(){
      // the interact key path itself — the one a booth's "press E" sign depends on
      const p = window.__mk('sign', 0, 0, -2.5, o=>{ o.userData.interact = true; o.userData.name = 'Sign'; });
      if(!p) return { err:'no prop' };
      if(colliders.indexOf(p) < 0) colliders.push(p);
      player.pos.set(0, 1.7, 0); player.yaw = 0; player.pitch = 0;
      camera.position.copy(player.pos); camera.rotation.set(0,0,0,'YXZ'); camera.updateMatrixWorld(true);
      let threw = null;
      try { interact(); } catch(e){ threw = String(e.message); }
      window.__home();
      return { ran: threw === null, threw: threw };
    })()`);
    chk('interaction', 'the interact key runs against an interactable prop', !r.__threw && r.ran, r);
  }
  {
    const r = await safe(P, `(function(){
      if(typeof hudWidgets === 'undefined') return { missing: true };
      logicVars = {}; hudWidgets.length = 0;
      hudWidgets.push({ kind:'button', id:'b1', label:'BUY', event:'BOUGHT', x:10, y:60 });   /* the field is event, not ev */
      logicGraph.nodes = [ { id:'ev', type:'event', x:0,y:0, p:{name:'BOUGHT'} },
                           { id:'n1', type:'setvar', x:1,y:0, p:{ name:'bought', value:1 } } ];
      logicGraph.wires = [ { a:'ev', o:0, b:'n1', i:'in' } ];
      updateHudWidgets();
      _hwFire(hudWidgets[0]);
      const v = logicVars.bought;
      hudWidgets.length = 0;
      return { fired: v === 1 };
    })()`);
    chk('interaction', 'a HUD button fires its logic event (build 1255)', !r.__threw && r.fired, r);
  }
  {
    const r = await safe(P, `(function(){
      logicVars = {};
      logicGraph.nodes = [ { id:'ev', type:'event', x:0,y:0, p:{name:'CHAIN'} },
                           { id:'b',  type:'branch', x:1,y:0, p:{ a:'n', op:'>', b:'2' } },
                           { id:'t',  type:'setvar', x:2,y:0, p:{ name:'took', value:1 } },
                           { id:'f',  type:'setvar', x:2,y:1, p:{ name:'took', value:2 } } ];
      logicGraph.wires = [ { a:'ev', o:0, b:'b', i:'in' },
                           { a:'b',  o:0, b:'t', i:'in' },
                           { a:'b',  o:1, b:'f', i:'in' } ];
      logicVars.n = 5; _lgFireEvents('event','CHAIN'); const hi = logicVars.took;
      logicVars.n = 1; _lgFireEvents('event','CHAIN'); const lo = logicVars.took;
      return { hi: hi, lo: lo, branches: hi === 1 && lo === 2 };
    })()`);
    chk('interaction', 'a branch node takes both outputs correctly', !r.__threw && r.branches, r);
  }
  {
    // the two verbs the booths just gained, driven from a real node (builds 1390/1391)
    const r = await safe(P, `(function(){
      const t = window.__mk('booth', 640, 0, 640, o=>{ o.userData.shootable = true;
        o.userData.hp = 20; o.userData.maxHp = 20; });
      if(!t) return { err:'no prop' };
      damageProp(t, 999, null, null, 4, null);
      const down = !!t.userData._destroyed;
      logicGraph.nodes = [ { id:'ev', type:'event', x:0,y:0, p:{name:'RST'} },
                           { id:'n1', type:'do', x:1,y:0, p:{ verb:'resetprop', target:'booth' } } ];
      logicGraph.wires = [ { a:'ev', o:0, b:'n1', i:'in' } ];
      _lgFireEvents('event','RST');
      return { down: down, back: !t.userData._destroyed && t.visible, hp: t.userData.hp,
               shootableAgain: damageProp(t, 5, null, null, 4, null) === false && t.userData.hp === 15 };
    })()`);
    chk('interaction', 'a shootable target resets and is shootable again (builds 1390/1391)',
        !r.__threw && r.down && r.back && r.shootableAgain, r);
  }

  const groups = [...new Set(R.map(r => r.group))];
  console.log('\n  BOOTH SWEEP — build ' + (await P('BUILD_VERSION')));
  console.log('  ' + '='.repeat(78));
  for (const g of groups) {
    console.log('  ' + g.toUpperCase());
    for (const r of R.filter(x => x.group === g))
      console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name +
        (r.ok ? '' : '\n           ' + JSON.stringify(r.detail)));
  }
  const bad = R.filter(r => !r.ok);
  console.log('\n  ' + (R.length - bad.length) + '/' + R.length + ' verified' +
    (bad.length ? '   <-- ' + bad.length + ' to investigate' : ''));
}, { settleMs: 12000 });
