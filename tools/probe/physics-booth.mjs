// The PHYSICS booth, verified end to end in the running game.
//
// Companion to feature-sweep.mjs and booth-sweep.mjs, and the third of the three the gauntlet is scoped
// around ("range + physics + AI", "movement & traversal", "logic & interaction"). The other two are swept;
// this one was not, so anything a physics booth leans on was unverified.
//
// Same discipline, and it was earned: every check drives the REAL entry point and reads a REAL observable
// (a world position, a velocity, a collider, a variable) rather than a flag the feature sets about itself;
// every probe call is isolated so one unknown identifier cannot end the run; every fixture is built FAR
// from the stock level, because building at the origin is how three separate probes this session measured
// a working feature as broken (build 1323's rule); and anything that mutates shared state restores it.
import { withGame } from './driver.mjs';

const R = [];
const chk = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

// The booth's own corner — INSIDE the arena, because the ground plane stops at +-ARENA (70 by default) and
// a prop built outside it falls forever. The first run of this put the booth at 700 to be "far from the
// stock level" (build 1323) and measured three features as broken: a crate that never landed, a blast that
// moved nothing because its target was already 50 m below the world, and a goal zone whose ball had fallen
// out of the height band. Far from the level's own geometry, not out of the level.
const B = 46;

await withGame(async (P, page) => {
  const rig = await safe(P, `(function(){
    paused = false; gameOn = true;
    player.hp = player.maxHp || 100;
    window.__B = ${B};
    /* a dynamic prop the way a creator makes one: place it, tick Physics. setPropDynamic is the real door —
       hand-setting userData.phys is NOT the same thing and measures as a broken feature (see feature-sweep). */
    window.__dyn = function(tag, dx, dy, dz, tune){
      let o=null; spawnProp('box',[__B+dx, dy, __B+dz, 0,0,0, 1,1,1],(b)=>{o=b;});
      if(!o) return null;
      o.userData.tag = tag;
      if(typeof setPropDynamic==='function') setPropDynamic(o, true);
      if(tune) tune(o);
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
      return o;
    };
    window.__step = function(n, dt){ for(let i=0;i<(n||30);i++){ if(typeof updatePhysics==='function') updatePhysics(dt||1/60); } };
    window.__at = function(o){ if(!o || !o.position) return ['?','?','?'];
      return [ +o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2) ]; };
    window.__home = function(){ player.pos.set(__B, 1.7, __B+8); player.vel.set(0,0,0); player.yaw=0; player.pitch=0;
      camera.position.copy(player.pos); camera.rotation.set(0,0,0,'YXZ'); camera.updateMatrixWorld(true); };
    __home();
    return { physWorld: (typeof physWorld!=='undefined' && !!physWorld), dynamicProps: dynamicProps.length };
  })()`);
  chk('rig', 'the physics world is live', !rig.__threw && rig.physWorld, rig);

  // ============================================================ A PROP WITH MASS
  {
    const r = await safe(P, `(function(){
      const c = __dyn('drop', 0, 6, 0);
      if(!c) return { err:'no prop' };
      const y0 = c.position.y;
      __step(120);
      const y1 = c.position.y;
      const settled = Math.abs(c.position.y - y1) < 0.01;
      __step(30);
      /* a box primitive is BASE-at-origin (build 871: y is a piece's base), so resting ON the ground is
         y ~= 0 — the first run of this asserted y > 0 and read a correct landing as a failure */
      return { y0:+y0.toFixed(2), y1:+y1.toFixed(2), fell: y1 < y0 - 2, onGround: y1 >= -0.05 && y1 < 0.6,
               settled: Math.abs(c.position.y - y1) < 0.05, isDyn: !!c.userData.phys,
               inDynamicProps: dynamicProps.indexOf(c) >= 0 };
    })()`);
    chk('mass', 'a dynamic prop falls and comes to rest on the ground',
      !r.__threw && r.fell && r.onGround && r.settled, r);
    chk('mass', '...through the real setPropDynamic door, so every damage and physics consumer sees it',
      !r.__threw && r.isDyn && r.inDynamicProps, r);
  }

  // ============================================================ SHOVING IT
  {
    const r = await safe(P, `(function(){
      const c = __dyn('shove', 6, 1.5, 0);
      __step(60);
      const before = __at(c);
      /* the graph's own push verb (build 1258), away from a place */
      _applyWorldAction({ do:'pushprop', target:'shove', at:'me', amt:40 });
      __step(60);
      const after = __at(c);
      const moved = Math.hypot(after[0]-before[0], after[2]-before[2]);
      /* AWAY from the player, not toward: the player is at +Z of the booth centre */
      const awayFromPlayer = (after[2] - before[2]) < 0;
      return { before, after, moved:+moved.toFixed(2), awayFromPlayer };
    })()`);
    chk('push', 'the graph can SHOVE a prop, away from a place (build 1258)',
      !r.__threw && r.moved > 0.5 && r.awayFromPlayer, r);
  }

  {
    // mass matters — the same shove moves a heavy prop less
    const r = await safe(P, `(function(){
      const light = __dyn('mLight', -6, 1.5, 0, o=>{ o.userData.mass = 1; });
      const heavy = __dyn('mHeavy', -9, 1.5, 0, o=>{ o.userData.mass = 40; });
      /* the mass is read when the BODY is built, so rebuild both against the tuned values */
      if(typeof buildPhysWorld==='function') buildPhysWorld();
      __step(60);
      const l0 = __at(light), h0 = __at(heavy);
      _applyWorldAction({ do:'pushprop', target:'mLight', at:'me', amt:40 });
      _applyWorldAction({ do:'pushprop', target:'mHeavy', at:'me', amt:40 });
      __step(60);
      const l = Math.hypot(__at(light)[0]-l0[0], __at(light)[2]-l0[2]);
      const h = Math.hypot(__at(heavy)[0]-h0[0], __at(heavy)[2]-h0[2]);
      return { light:+l.toFixed(2), heavy:+h.toFixed(2), lightMass:light.userData.mass, heavyMass:heavy.userData.mass };
    })()`);
    // build 1258 deliberately multiplies the impulse by mass so "20" moves a crate and a barrel the same —
    // this records WHICH semantics ship rather than assuming one.
    chk('push', 'a heavy prop and a light prop take the same authored shove (build 1258: the amount is a ' +
      'velocity change, not a raw impulse)',
      !r.__threw && r.light > 0.3 && r.heavy > 0.3 && Math.abs(r.light - r.heavy) < Math.max(r.light, r.heavy) * 0.5, r);
  }

  // ============================================================ A STACK TOPPLES
  {
    const r = await safe(P, `(function(){
      const st = [];
      for(let i=0;i<4;i++) st.push(__dyn('stack'+i, 12, 0.5 + i*1.02, 0));
      if(typeof buildPhysWorld==='function') buildPhysWorld();
      __step(120);
      const settled = st.map(o=>__at(o));
      const stacked = settled.every((p,i)=> i===0 || p[1] > settled[i-1][1] + 0.5);
      _applyWorldAction({ do:'pushprop', target:'stack3', at:'me', amt:60 });
      __step(120);
      const after = settled.map((_,i)=>__at(st[i]));
      const topMoved = Math.hypot(after[3][0]-settled[3][0], after[3][2]-settled[3][2]);
      const anyOtherMoved = after.some((p,i)=> i<3 && Math.hypot(p[0]-settled[i][0], p[2]-settled[i][2]) > 0.2);
      return { stacked, settled, after, topMoved:+topMoved.toFixed(2), anyOtherMoved };
    })()`);
    chk('stack', 'four crates stack on each other and stay stacked', !r.__threw && r.stacked, r);
    chk('stack', '...and shoving the top one knocks it off', !r.__threw && r.topMoved > 0.5, r);
  }

  // ============================================================ SHOOTING IT
  {
    const r = await safe(P, `(function(){
      const c = __dyn('shot', 0, 1.5, -6, o=>{ o.userData.maxHp = 1000; o.userData.hp = 1000; });
      __step(60);
      const before = __at(c);
      const hp0 = c.userData.hp;
      /* explodeAt is the real blast every grenade, rocket and barrel routes through */
      explodeAt(new THREE.Vector3(before[0], before[1], before[2] + 1.2), 6, 40);
      __step(60);
      const after = __at(c);
      return { before, after, moved:+Math.hypot(after[0]-before[0], after[2]-before[2]).toFixed(2),
               hp0, hp1: c.userData.hp, damaged: c.userData.hp < hp0 };
    })()`);
    chk('blast', 'a blast both DAMAGES a dynamic prop and launches it', !r.__threw && r.damaged && r.moved > 0.3, r);
  }

  // ============================================================ EXPLOSIVE BARRELS, CHAINED
  {
    const r = await safe(P, `(function(){
      const a = __dyn('barrelA', 0, 1.5, -14, o=>{ o.userData.explosive = true; o.userData.breakable = true;
        o.userData.maxHp = 20; o.userData.hp = 20; o.userData.blastR = 8; o.userData.blastDmg = 60; });
      const b = __dyn('barrelB', 3, 1.5, -14, o=>{ o.userData.explosive = true; o.userData.breakable = true;
        o.userData.maxHp = 20; o.userData.hp = 20; o.userData.blastR = 8; o.userData.blastDmg = 60; });
      __step(60);
      player.pos.set(__B, 1.7, __B + 40);   /* well clear of the blast */
      damageProp(a, 999, null, null);        /* pop the first one */
      for(let i=0;i<200;i++){ if(typeof updateFragments==='function') updateFragments(1/60); __step(2); }
      return { aGone: !!a.userData._shattered, bAlso: !!b.userData._shattered,
               bHp: b.userData.hp, playerHp: player.hp };
    })()`);
    chk('barrels', 'an explosive barrel destroyed by damage takes its neighbour with it',
      !r.__threw && r.aGone && r.bAlso, r);
  }

  // ============================================================ GRAB / CARRY / THROW
  {
    const r = await safe(P, `(function(){
      const c = __dyn('carry', 0, 1.2, 2);
      __step(60);
      __home();
      /* face it: forward is (-sin yaw, -cos yaw), and the crate sits at +Z of the player, so yaw = PI */
      player.pos.set(__B, 1.7, __B + 0.5); player.yaw = Math.PI;
      camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
      const got = (typeof grabSpecificProp==='function') ? grabSpecificProp(c) : null;
      const held = (typeof heldProp!=='undefined') ? heldProp : null;
      const at0 = __at(c);
      /* walk away holding it */
      player.pos.set(__B + 10, 1.7, __B + 10);
      camera.position.copy(player.pos); camera.updateMatrixWorld(true);
      for(let i=0;i<30;i++){ if(typeof updateHeld==='function') updateHeld(1/60); __step(1); }
      const carried = __at(c);
      const cameAlong = Math.hypot(carried[0]-at0[0], carried[2]-at0[2]) > 3;
      if(typeof throwHeld==='function') throwHeld();
      __step(45);
      const thrown = __at(c);
      return { grabbed: !!held, cameAlong, at0, carried, thrown,
               flew: Math.hypot(thrown[0]-carried[0], thrown[2]-carried[2]) > 0.5,
               released: (typeof heldProp!=='undefined') ? !heldProp : null };
    })()`);
    chk('carry', 'a prop can be picked up and carried', !r.__threw && r.grabbed && r.cameAlong, r);
    chk('carry', '...and thrown, which releases it', !r.__threw && r.flew && r.released !== false, r);
  }

  // ============================================================ THE GOAL: a zone that sees a prop
  {
    const r = await safe(P, `(function(){
      const step = [];
      const T = (n, f) => { try { step.push(n + ':' + JSON.stringify(f())); } catch(e){ step.push(n + ':THREW ' + e.message); } };
      let ball = null;
      T('spawn', ()=>{ ball = __dyn('ball', 20, 1.2, 0); return ball ? __at(ball) : 'null'; });
      T('settle', ()=>{ __step(45); return __at(ball); });
      T('arm', ()=>{
        triggerZones.length = 0; _trigState.length = 0;
        triggerZones.push(_migrateTrigger({ x: __B+20, z: __B, r: 3, h: 6, who:'prop', ptag:'ball', ev:'GOAL' }));
        logicGraph.nodes = [ { id:'g0', type:'event', x:0, y:0, p:{ name:'GOAL' } },
                             { id:'g1', type:'addvar', x:100, y:0, p:{ name:'goals', value:'1' } } ];
        logicGraph.wires = [ { a:'g0', o:0, b:'g1', i:'in' } ];
        logicVars = { goals: 0 };
        return { zone:[__B+20, __B], ptag: triggerZones[0].ptag, who: triggerZones[0].who };
      });
      T('inside', ()=>{ updateTriggerZones(1/60); return { goals:+logicVars.goals||0, at:__at(ball) }; });
      /* the CONTROL: take it out, and back in. Each step reports the ball's POSITION, because "the edge did
         not re-arm" and "the ball never actually left" look identical from the score alone. */
      T('out',  ()=>{ ball.position.set(__B-30, 1.2, __B-30); updateTriggerZones(1/60); return { goals:+logicVars.goals||0, at:__at(ball) }; });
      T('back', ()=>{ ball.position.set(__B+20, 1.2, __B);    updateTriggerZones(1/60); return { goals:+logicVars.goals||0, at:__at(ball) }; });
      T('clean',()=>{ triggerZones.length = 0; _trigState.length = 0; return 1; });
      return { step, goals:+logicVars.goals||0 };
    })()`);
    chk('goal', 'a trigger zone scores when a PROP rolls into it, once per entry (build 1276)',
      !r.__threw && r.goals === 2 && !String(r.step).includes('THREW'), r);
  }

  // ============================================================ RESET
  {
    const r = await safe(P, `(function(){
      const c = __dyn('reset', -14, 1.2, 0);
      __step(45);
      const home = __at(c);
      _applyWorldAction({ do:'pushprop', target:'reset', at:'me', amt:60 });
      __step(90);
      const away = __at(c);
      if(typeof resetDynamicProps==='function') resetDynamicProps();
      __step(10);
      const back = __at(c);
      return { home, away, back,
               moved: Math.hypot(away[0]-home[0], away[2]-home[2]) > 0.5,
               returned: Math.hypot(back[0]-home[0], back[2]-home[2]) < 0.6 };
    })()`);
    chk('reset', 'a knocked-about prop returns to its authored home on Deploy', !r.__threw && r.moved && r.returned, r);
  }

  // ============================================================ JOINTS — the see-saw
  {
    const r = await safe(P, `(function(){
      const j = (typeof JOINT_KINDS!=='undefined') ? Object.keys(JOINT_KINDS)
              : (typeof _jointKinds!=='undefined' ? Object.keys(_jointKinds) : null);
      return { kinds: j, hasBuild: typeof buildJoints, hasApply: typeof jointApply };
    })()`);
    chk('joints', 'the joint machinery is reachable', !r.__threw && r.hasBuild === 'function', r);
  }

  // ============================================================ report
  const w = Math.max(...R.map(r => r.name.length));
  let g = '';
  console.log('\n  PHYSICS BOOTH — driven in the running game\n  ' + '='.repeat(w + 12));
  for (const r of R) {
    if (r.group !== g) { g = r.group; console.log('  ' + g.toUpperCase()); }
    console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(w));
    if (!r.ok) console.log('           ' + JSON.stringify(r.detail));
  }
  const bad = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
