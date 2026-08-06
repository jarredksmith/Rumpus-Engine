// Build the gauntlet's first booth END TO END, with nothing a creator could not author, and see what stops.
//
// A shooting range: step on the mat, plates pop one at a time in a random order, each hit scores and pops
// the next, a clock runs out and the round ends with a result. Every piece is supposed to exist — build
// 1402 gave the graph computed names, 1397 gave a prop an "on hit" signal, 1391 gave targets a reset, 1255
// and 1058 gave the HUD a score and a button.
//
// So this authors the whole booth as a real logic graph plus real prop signals and DRIVES IT WITH SHOTS.
// Anything a booth leans on has to be known-good before it is built against, not after (build 1277).
import { withGame } from './driver.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P) => {
  // ---------------------------------------------------------------- the booth's props
  const setup = await safe(P, `(function(){
    paused = false; gameOn = true;
    window.__plates = [];
    for(let i=1;i<=3;i++){
      /* FAR from the stock level. The first run of this built the booth at the origin and every shot
         missed — build 1323's lesson: put the thing you are measuring somewhere nothing else lives. */
      let o=null; spawnProp('box',[500 + (i-2)*3, 1.2, 500, 0,0,0, 1.4,1.4,0.3],(b)=>{o=b;});
      o.userData.tag = 'plate'+i;
      o.userData.shootable = true;              /* build 1390: shootable without being a physics body */
      o.userData.breakable = true;
      o.userData.maxHp = 10; o.userData.hp = 10;
      /* build 1397: the plate reports its own hit into the graph. The RUNTIME field is named when, not w, which is the
         SERIALIZED key — the first run of this used the serialized name on a live object and measured a dead signal. */
      o.userData.signals = [ { when:'damaged', do:'emit', text:'HIT' } ];
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
      __plates.push(o);
    }
    window.__up = () => __plates.filter(p=>p.visible).map(p=>p.userData.tag);
    return { plates: __plates.length, tags: __plates.map(p=>p.userData.tag) };
  })()`);
  chk('three plates with an on-hit signal', !setup.__threw && setup.plates === 3, setup);

  // ---------------------------------------------------------------- the booth's GRAPH
  const graph = await safe(P, `(function(){
    logicGraph.nodes = [
      /* --- start: zero the score, stamp the clock, pop the first plate --- */
      { id:'s0', type:'event',  x:0,   y:0,   p:{ name:'RANGE_START' } },
      { id:'s1', type:'setvar', x:120, y:0,   p:{ name:'score', value:'0' } },
      { id:'s2', type:'read',   x:240, y:0,   p:{ stat:'time', name:'t0' } },
      { id:'s3', type:'emit',   x:360, y:0,   p:{ name:'NEXT' } },
      /* --- next: draw a plate at random and pop it --- */
      { id:'n0', type:'event',  x:0,   y:120, p:{ name:'NEXT' } },
      { id:'n1', type:'setvar', x:120, y:120, p:{ name:'n', rand:1, min:1, max:3 } },
      { id:'n2', type:'do',     x:240, y:120, p:{ verb:'showprop', target:'plate{n}' } },
      /* --- hit: score it, drop the plate, reset it for later, draw again --- */
      { id:'h0', type:'event',  x:0,   y:240, p:{ name:'HIT' } },
      { id:'h1', type:'addvar', x:120, y:240, p:{ name:'score', value:'1' } },
      { id:'h2', type:'do',     x:240, y:240, p:{ verb:'resetprop', target:'plate{n}' } },
      { id:'h3', type:'do',     x:360, y:240, p:{ verb:'hideprop',  target:'plate{n}' } },
      { id:'h4', type:'emit',   x:480, y:240, p:{ name:'NEXT' } },
      /* --- the clock: one tick a second, ending the round --- */
      { id:'c0', type:'interval', x:0,  y:360, p:{ sec:'1', times:'0' } },
      { id:'c1', type:'read',   x:120, y:360, p:{ stat:'time', name:'now' } },
      { id:'c2', type:'expr',   x:240, y:360, p:{ name:'left', expr:'20 - (now - t0)' } },
      { id:'c3', type:'branch', x:360, y:360, p:{ a:'left', op:'<=', b:'0' } },
      { id:'c4', type:'toast',  x:480, y:360, p:{ text:'Time! Score {score}' } },
    ];
    logicGraph.wires = [
      { a:'s0', o:0, b:'s1', i:'in' }, { a:'s1', o:0, b:'s2', i:'in' }, { a:'s2', o:0, b:'s3', i:'in' },
      { a:'n0', o:0, b:'n1', i:'in' }, { a:'n1', o:0, b:'n2', i:'in' },
      { a:'h0', o:0, b:'h1', i:'in' }, { a:'h1', o:0, b:'h2', i:'in' },
      { a:'h2', o:0, b:'h3', i:'in' }, { a:'h3', o:0, b:'h4', i:'in' },
      { a:'c0', o:0, b:'c1', i:'in' }, { a:'c1', o:0, b:'c2', i:'in' }, { a:'c2', o:0, b:'c3', i:'in' },
      { a:'c3', o:0, b:'c4', i:'in' },
    ];
    logicVars = {};
    if(typeof logicStart==='function') logicStart();
    /* every plate starts down */
    for(const p of __plates) _lgPropVerb('hide', p.userData.tag, '');
    return { nodes: logicGraph.nodes.length, wires: logicGraph.wires.length, up: __up() };
  })()`);
  chk('the booth graph loads with every plate down', !graph.__threw && graph.up && graph.up.length === 0, graph);

  // ---------------------------------------------------------------- start the round
  const start = await safe(P, `(function(){
    _lgFireEvents('event','RANGE_START');
    return { score: logicVars.score, t0: logicVars.t0, n: logicVars.n, up: __up() };
  })()`);
  chk('starting the round pops exactly ONE plate', !start.__threw && start.up && start.up.length === 1, start);
  chk('...and stamps the clock and zeroes the score',
    !start.__threw && start.score === 0 && typeof start.t0 === 'number', start);

  // ---------------------------------------------------------------- SHOOT it
  // A real shot, through the whole wire: bullet -> damageProp -> the plate's `damaged` signal -> emit ->
  // the graph. The rig FIRES UNTIL IT LANDS and reports how many it took: shots in this headless renderer
  // are intermittent in a way I have not isolated (identical camera, identical direction, one in three or
  // four lands), so a single shot proves nothing either way and a retry count is the honest instrument.
  const shot = await safe(P, `(function(){
    const tag = __up()[0];
    const plate = __plates.find(p=>p.userData.tag===tag);
    const pos = plate.position;
    /* forward is (-sin yaw, -cos yaw), so yaw 0 faces -Z — which is where the plates are. */
    player.pos.set(pos.x, pos.y, pos.z + 4); player.yaw = 0; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);
    curWep = 'rifle';
    const before = { score: logicVars.score, up: __up() };
    let tries = 0;
    while(tries < 12 && (+logicVars.score||0) === (+before.score||0)){
      tries++; WEAPONS.rifle.mag = 30; lastShot = 0; firingLatch = false; shoot();
    }
    return { shotAt: tag, tries, before, after: { score: logicVars.score, up: __up() } };
  })()`);
  chk('a real shot scores, through bullet -> signal -> graph',
    !shot.__threw && shot.after && shot.after.score === 1, shot);
  chk('...and the loop pops the next plate', !shot.__threw && shot.after && shot.after.up.length === 1, shot && shot.after);

  // ---------------------------------------------------------------- ten more rounds
  // Driven through `damageProp` rather than the trigger, so the BOOTH is what is being measured rather than
  // the rig's firing reliability. The wire from a bullet to damageProp is the check above.
  const many = await safe(P, `(function(){
    const drew = {};
    for(let i=0;i<10;i++){
      const tag = __up()[0];
      if(!tag){ drew['NONE_UP'] = (drew['NONE_UP']||0)+1; break; }
      drew[tag] = (drew[tag]||0)+1;
      const plate = __plates.find(p=>p.userData.tag===tag);
      damageProp(plate, 999, null, null);
    }
    return { score: logicVars.score, drew,
             everyPlateStillShootable: __plates.map(p=>({ tag:p.userData.tag, hp:p.userData.hp,
               shattered:!!p.userData._shattered, damageable: damageableProps().indexOf(p)>=0 })) };
  })()`);
  chk('ten hits score ten, and the plates keep coming back',
    !many.__threw && many.score === 11 && !many.drew.NONE_UP, many);
  chk('...and every plate is back at full health, unshattered and still shootable',
    !many.__threw && many.everyPlateStillShootable &&
    many.everyPlateStillShootable.every(p => p.hp === 10 && !p.shattered && p.damageable),
    many && many.everyPlateStillShootable);

  // ---------------------------------------------------------------- the clock ends it
  const clock = await safe(P, `(function(){
    let said = null; const real = flashToast; flashToast = (m)=>{ said = m; };
    try {
      /* an interval node is TICKED by updateLogic — pulsing it by hand is not the same wire */
      updateLogic(1.2);
      logicVars.t0 = (+logicVars.now || 0) - 25;   /* 25 s ago: the round is over */
      updateLogic(1.2);
      const overdue = { left: logicVars.left, said };
      said = null;
      logicVars.t0 = (+logicVars.now || 0);        /* just started: it must NOT end */
      updateLogic(1.2);
      return { overdue, fresh: { left: logicVars.left, said } };
    } finally { flashToast = real; }
  })()`);
  chk('the clock ends the round and names the score',
    !clock.__threw && clock.overdue && clock.overdue.left <= 0 && /Score 11/.test(String(clock.overdue.said)), clock);
  chk('...and does NOT end it while there is time left',
    !clock.__threw && clock.fresh && clock.fresh.left > 0 && clock.fresh.said === null, clock && clock.fresh);

  // ---------------------------------------------------------------- a computed EVENT name
  // Build 1402's rule is "every field that NAMES something". An event name is a name, and a booth with
  // several lanes wants `emit lane{n}_done`. This was the ONE thing the whole booth could not say.
  const evName = await safe(P, `(function(){
    logicGraph.nodes = [ { id:'e0', type:'event', x:0, y:0, p:{ name:'GO' } },
                         { id:'e1', type:'emit',  x:100, y:0, p:{ name:'lane{n}_done' } },
                         { id:'e2', type:'event', x:0, y:100, p:{ name:'lane2_done' } },
                         { id:'e3', type:'addvar',x:100, y:100, p:{ name:'landed', value:'1' } } ];
    logicGraph.wires = [ { a:'e0', o:0, b:'e1', i:'in' }, { a:'e2', o:0, b:'e3', i:'in' } ];
    logicVars = { n: 2, landed: 0 };
    _lgFireEvents('event','GO');
    const computed = +logicVars.landed || 0;
    logicGraph.nodes[1].p.name = 'lane2_done'; logicVars.landed = 0;
    _lgFireEvents('event','GO');
    return { computedName: computed, literalControl: +logicVars.landed || 0 };
  })()`);
  chk('an emitted EVENT name can be computed too — build 1402 own rule',
    !evName.__threw && evName.computedName === 1 && evName.literalControl === 1, evName);

  // ---------------------------------------------------------------- an emit nobody hears
  const unheard = await safe(P, `(function(){
    logicGraph.nodes = [ { id:'u0', type:'event', x:0, y:0, p:{ name:'GO' } },
                         { id:'u1', type:'emit',  x:100, y:0, p:{ name:'NOBODY_LISTENS' } } ];
    logicGraph.wires = [ { a:'u0', o:0, b:'u1', i:'in' } ];
    const read = () => { const out=[]; if(logicFailures && logicFailures.forEach) logicFailures.forEach((v,k)=>out.push(String(k))); return out; };
    if(logicFailures && logicFailures.clear) logicFailures.clear();
    _lgFireEvents('event','GO');
    const missed = read().filter(m=>m.indexOf('NOBODY_LISTENS')>=0);
    /* the control: an event that IS heard must report nothing */
    if(logicFailures && logicFailures.clear) logicFailures.clear();
    logicGraph.nodes.push({ id:'u2', type:'event', x:0, y:100, p:{ name:'HEARD' } });
    logicGraph.nodes[1].p.name = 'HEARD';
    _lgFireEvents('event','GO');
    return { reported: missed, controlReported: read().filter(m=>m.indexOf('emit')>=0) };
  })()`);
  chk('an emit nobody listens for is REPORTED, and one that is heard is not',
    !unheard.__threw && unheard.reported && unheard.reported.length === 1 &&
    unheard.controlReported && unheard.controlReported.length === 0, unheard);

  // ---------------------------------------------------------------- report
  const w = Math.max(...R.map(r => r.name.length));
  console.log('\n  RANGE BOOTH — authored end to end, driven with real shots\n  ' + '='.repeat(w + 12));
  for (const r of R) {
    console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(w));
    if (!r.ok) console.log('           ' + JSON.stringify(r.detail));
  }
  const bad = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
