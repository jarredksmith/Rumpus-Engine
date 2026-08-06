// The LOGIC & INTERACTION booth, driven in the running game.
//
// The last of the gauntlet's five scoped sections. The three booths before it (range, physics, AI) and the
// movement booth cover what the player DOES; this covers what a creator WIRES — the graph's flow control
// and arithmetic, the variable and list stores, the interaction chain from a keypress to a door, the lock
// and inventory gates, the trigger-zone edges, and the HUD that reports it all back.
//
// It deliberately does NOT re-check what feature-sweep and booth-sweep already drive (a door toggling, a
// lock refusing without its key, a HUD button firing, a branch taking both outputs, an effect zone healing).
// Every check here is something no sweep has run.
//
// Instrument: tools/probe/drive.mjs. Two of its rules earned their place the hard way and both apply here —
// `removeProp` takes an INDEX so fixtures must go through __kill, and the delay/interval nodes are driven by
// updateLogic on SIMULATED time, which is exactly what __drive advances.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const R = [];
const chk = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

const B = 40;

await withGame(async (P) => {
  const rig = await safe(P, `(function(){
    paused = false; gameOn = true;
    window.__B = ${B};
    ${DRIVE_RIG}

    window.__props = [];
    window.__prop = function(kind, x,y,z, sx,sy,sz){
      let o=null; spawnProp(kind,[x,y,z, 0,0,0, sx,sy,sz],(b)=>{o=b;});
      if(o){ if(typeof refreshPropCollider==='function') refreshPropCollider(o); __props.push(o); }
      return o;
    };
    window.__clearProps = function(){ for(const o of __props.splice(0)) try{ __kill(o); }catch(e){}
      if(typeof buildPhysWorld==='function') buildPhysWorld(); };

    /* a graph, built from scratch — every check owns its own nodes and wires */
    window.__graph = function(nodes, wires){
      logicGraph = { nodes: nodes, wires: wires || [] };
      logicVars = {}; logicLists = {};
      _lgBudget = 0;
      return logicGraph;
    };
    /* A start NODE IS NOT PULSED BY ID. It is an event SOURCE: logicStart seeds the timers and calls
        _lgFireEvents('start',''), and pulsing the node directly does nothing at all — which reads as every
        downstream node being broken. This is the engine's own entry point, minus the state reset the
        checks below do themselves. */
    window.__fire = function(){ _lgBudget = 0; _lgFireEvents('start',''); };
    window.__pulse = function(id){ _lgBudget = 0; _lgPulse(id); };
    window.__N = function(id, type, p){ return { id:id, type:type, x:0, y:0, p:p||{} }; };
    window.__W = function(a, o, b){ return { a:a, o:(o||0), b:b, i:'in' }; };

    window.__home = function(){ player.pos.set(__B, 1.7, __B); player.vel.set(0,0,0);
      player.yaw = Math.PI; player.hp = player.maxHp || 100;
      camera.position.copy(player.pos); camera.updateMatrixWorld(true); };

    window.__hud0 = hudWidgets.slice();
    window.__hudClear = function(){ hudWidgets.length = 0; for(const w of __hud0) hudWidgets.push(w);
      _hwRev++; };

    __wavesOff(); __clearEnemies(); __home();
    return { nodeTypes: Object.keys(LG_DEFS).length };
  })()`);
  chk('rig', 'the booth rig is up and the graph vocabulary is present',
    !rig.__threw && rig.nodeTypes >= 20, rig);

  // ============================================================ ARITHMETIC AND EXPRESSIONS
  {
    const r = await safe(P, `(function(){
      __graph([
        __N('s','start'),
        __N('m','math', { name:'hp2', a:'40', op:'\u00d7', b:'3' }),   /* the table's ops are x and / as SYMBOLS */
        __N('e','expr', { name:'pct', expr:'clamp(hp2 / 2, 0, 100)' }),
        __N('d','math', { name:'oops', a:'5', op:'\u00f7', b:'0' }),
        __N('k','math', { name:'wrap', a:'-1', op:'%', b:'4' }),
      ], [ __W('s',0,'m'), __W('m',0,'e'), __W('e',0,'d'), __W('d',0,'k') ]);
      __fire();
      return { hp2: logicVars.hp2, pct: logicVars.pct, oops: logicVars.oops, wrap: logicVars.wrap };
    })()`);
    chk('graph', 'Math and the expression node compute and chain (builds 1169/1271)',
      !r.__threw && r.hp2 === 120 && r.pct === 60, r);
    chk('graph', '...and neither can produce a NaN or a negative modulo (build 1169)',
      !r.__threw && r.oops === 0 && r.wrap === 3, r);
  }

  // ============================================================ LISTS: A DECK, DEALT
  {
    const r = await safe(P, `(function(){
      __graph([
        __N('s','start'),
        __N('f','list', { name:'deck', op:'fill', value:'4' }),
        __N('d1','list', { name:'deck', op:'draw', var:'card' }),
        __N('d2','list', { name:'deck', op:'draw', var:'card2' }),
        __N('n','list', { name:'deck', op:'len', var:'left' }),
        __N('h','list', { name:'deck', op:'has', value:'3', var:'hasThree' }),
      ], [ __W('s',0,'f'), __W('f',0,'d1'), __W('d1',0,'d2'), __W('d2',0,'n'), __W('n',0,'h') ]);
      __fire();
      return { deck: (logicLists.deck||[]).slice(), card: logicVars.card, card2: logicVars.card2,
               left: logicVars.left, hasThree: logicVars.hasThree };
    })()`);
    chk('graph', 'a list fills, deals and reports what is left (build 1269)',
      !r.__threw && r.card === 1 && r.card2 === 2 && r.left === 2 && r.hasThree === 1, r);
  }

  // ============================================================ IT CAN READ THE WORLD
  {
    const r = await safe(P, `(function(){
      __home(); player.hp = 55;
      __clearEnemies();
      spawnEnemy({ x: __B + 6, z: __B, type:'grunt' });
      spawnEnemy({ x: __B + 9, z: __B, type:'grunt' });
      __graph([
        __N('s','start'),
        __N('r1','read', { stat:'hp',      name:'hp' }),
        __N('r2','read', { stat:'enemies', name:'foes' }),
        __N('r3','read', { stat:'propdist', item:'plinth', name:'far' }),
      ], [ __W('s',0,'r1'), __W('r1',0,'r2'), __W('r2',0,'r3') ]);
      const plinth = __prop('box', __B, 0, __B - 12, 1, 1, 1);
      if(plinth) plinth.userData.tag = 'plinth';
      __fire();
      const out = { hp: logicVars.hp, foes: logicVars.foes, far: logicVars.far };
      __clearProps(); __clearEnemies(); player.hp = player.maxHp || 100;
      return out;
    })()`);
    chk('graph', 'the graph reads live health, the enemy count and a distance (builds 1169/1352)',
      !r.__threw && r.hp === 55 && r.foes === 2 && Math.abs(r.far - 12) < 0.5, r);
  }

  // ============================================================ TIME: DELAY AND INTERVAL
  {
    const r = await safe(P, `(function(){
      __graph([
        __N('s','start'),
        __N('d','delay', { sec:'0.5' }),
        __N('a','addvar', { name:'late', value:'1' }),
        __N('iv','interval', { sec:'0.25', times:'0' }),
        __N('t','addvar', { name:'ticks', value:'1' }),
      ], [ __W('s',0,'d'), __W('d',0,'a'), __W('iv',0,'t') ]);
      logicStart();                                    /* seeds the repeating timers and fires 'start' */
      const atOnce = { late: logicVars.late||0, ticks: logicVars.ticks||0 };
      for(let i=0;i<12;i++) __drive(1);                /* 0.2 s */
      const early = { late: logicVars.late||0, ticks: logicVars.ticks||0 };
      for(let i=0;i<48;i++) __drive(1);                /* to 1.0 s */
      const later = { late: logicVars.late||0, ticks: logicVars.ticks||0 };
      return { atOnce, early, later };
    })()`);
    chk('graph', 'a Delay holds a pulse until its time, and an Every-X-sec keeps firing',
      !r.__threw && r.atOnce.late === 0 && r.early.late === 0 && r.later.late === 1 &&
      r.later.ticks >= 3, r);
  }

  // ============================================================ A NAMED EVENT IS A FUNCTION
  {
    const r = await safe(P, `(function(){
      __graph([
        __N('s','start'),
        __N('em','emit', { name:'openVault' }),
        __N('ev','event', { name:'openVault' }),
        __N('a','addvar', { name:'opened', value:'1' }),
        __N('em2','emit', { name:'nobodyListens' }),
      ], [ __W('s',0,'em'), __W('em',0,'em2'), __W('ev',0,'a') ]);
      const before = (typeof logicFailures!=='undefined') ? logicFailures.size : 0;
      __fire();
      const after = (typeof logicFailures!=='undefined') ? logicFailures.size : 0;
      return { opened: logicVars.opened, reportedUnheard: after > before };
    })()`);
    chk('graph', 'emit calls a named event node, and an event nobody hears is reported (build 1403)',
      !r.__threw && r.opened === 1 && r.reportedUnheard, r);
  }

  // ============================================================ A RUNAWAY WIRE STALLS THE GRAPH, NOT THE GAME
  {
    const r = await safe(P, `(function(){
      __graph([ __N('s','start'), __N('a','addvar',{ name:'n', value:'1' }), __N('b','addvar',{ name:'n', value:'1' }) ],
              [ __W('s',0,'a'), __W('a',0,'b'), __W('b',0,'a') ]);
      const t0 = __vnow;
      __fire();
      __drive(2);
      return { n: logicVars.n, alive: gameOn && !paused, budget: (typeof _lgBudget!=='undefined') ? _lgBudget : null };
    })()`);
    chk('graph', 'a wire loop with no delay is budgeted rather than hanging the frame (build 1027)',
      !r.__threw && r.n > 0 && r.n < 1000 && r.alive, r);
  }

  // ============================================================ THE INTERACTION CHAIN
  {
    const r = await safe(P, `(function(){
      __clearProps(); __home();
      /* a lever the player can reach, wired to a counter that needs TWO distinct senders */
      const lever = __prop('box', __B, 0, __B - 3, 1, 2, 1);
      lever.userData.interact = true;
      lever.userData.signals = [ { when:'used', do:'emit', text:'pulled' } ];
      __graph([ __N('ev','event',{ name:'pulled' }), __N('c','counter',{ target:'2' }),
                __N('a','addvar',{ name:'doorOpen', value:'1' }) ],
              [ __W('ev',0,'c'), __W('c',0,'a') ]);
      logicVars = {};

      /* fire the prop's own signal the way the interact key does */
      const once = () => { if(typeof fireSignals==='function') fireSignals(lever, 'used');
                           else if(typeof _fireSignals==='function') _fireSignals(lever, 'used'); };
      once();
      const afterOne = logicVars.doorOpen || 0;
      once();
      const afterTwo = logicVars.doorOpen || 0;
      const out = { afterOne, afterTwo };
      __clearProps();
      return out;
    })()`);
    chk('interaction', 'a Counter holds the door until the second pull (build 1027)',
      !r.__threw && r.afterOne === 0 && r.afterTwo === 1, r);
  }

  // ============================================================ A KEY IS SPENT
  {
    const r = await safe(P, `(function(){
      __clearProps(); __home();
      inventory.length = 0;
      defineItem({ id:'brassKey', name:'Brass key' });
      giveItem('brassKey', 1);
      const door = __prop('box', __B, 0, __B - 5, 2, 3, 1);
      door.userData.signals = [ { when:'used', do:'emit', text:'unlocked',
                                  needItem:'brassKey', needConsume:1 } ];
      __graph([ __N('ev','event',{ name:'unlocked' }), __N('a','addvar',{ name:'opens', value:'1' }) ],
              [ __W('ev',0,'a') ]);
      logicVars = {};
      const fire = () => { if(typeof fireSignals==='function') fireSignals(door, 'used'); };
      fire();
      const first = { opens: logicVars.opens||0, held: invCount('brassKey') };
      fire();
      const second = { opens: logicVars.opens||0, held: invCount('brassKey') };
      const out = { first, second };
      inventory.length = 0; __clearProps();
      return out;
    })()`);
    chk('interaction', 'a signal that needs an item spends it, and will not fire twice (build 706)',
      !r.__threw && r.first.opens === 1 && r.first.held === 0 && r.second.opens === 1, r);
  }

  // ============================================================ A ZONE WATCHES FOR A PROP
  {
    const r = await safe(P, `(function(){
      __clearProps(); __home();
      /* a zone has ONE mode (on: enter / exit / stay), not an in-event and an out-event, so the
          goal is TWO zones over the same volume — which is also how a creator would author it */
      const vol = { x: __B - 20, z: __B - 20, r: 4, y: 0, h: 4, who:'prop', ptag:'ball', once:0 };
      triggerZones.length = 0;
      triggerZones.push(_migrateTrigger(Object.assign({}, vol, { on:'enter', ev:'scored' })));
      triggerZones.push(_migrateTrigger(Object.assign({}, vol, { on:'exit',  ev:'left' })));
      const ball = __prop('sphere', __B, 0, __B, 1, 1, 1);
      if(ball) ball.userData.tag = 'ball';
      __graph([ __N('e1','event',{ name:'scored' }), __N('a','addvar',{ name:'goals', value:'1' }),
                __N('e2','event',{ name:'left' }),   __N('b','addvar',{ name:'outs',  value:'1' }) ],
              [ __W('e1',0,'a'), __W('e2',0,'b') ]);
      logicVars = {};
      __drive(6);
      const before = { goals: logicVars.goals||0, outs: logicVars.outs||0 };
      ball.position.set(__B - 20, ball.position.y, __B - 20);
      __drive(6);
      const scored = { goals: logicVars.goals||0, outs: logicVars.outs||0 };
      ball.position.set(__B, ball.position.y, __B);
      __drive(6);
      const left = { goals: logicVars.goals||0, outs: logicVars.outs||0 };
      const out = { before, scored, left };
      triggerZones.length = 0; __clearProps();
      return out;
    })()`);
    chk('interaction', 'a trigger zone fires on the BALL entering and again on it leaving (build 1276)',
      !r.__threw && r.before.goals === 0 && r.scored.goals === 1 && r.scored.outs === 0 &&
      r.left.outs === 1, r);
  }

  // ============================================================ THE HUD REPORTS IT
  {
    const r = await safe(P, `(function(){
      __hudClear();
      logicVars = {}; logicVars.goals = 3;
      hudWidgets.length = 0;
      hudWidgets.push(..._sanitizeHudWidgets([
        { kind:'text', x:10, y:10, label:'GOALS {goals}' },
        { kind:'text', x:10, y:20, label:'SECRET', when:'hidden' },   /* the gate field is named when */
      ]));
      _hwRev++;                       /* the host is rebuilt only when the revision moves */
      __drive(2);
      const host = document.getElementById('hudWidgets') || document.body;
      const txt = host.textContent || '';
      const out = { shows: txt.indexOf('GOALS 3') >= 0, hides: txt.indexOf('SECRET') < 0 };
      __hudClear();
      return out;
    })()`);
    chk('hud', 'a widget interpolates a live variable, and show-when hides one (builds 1058/1255)',
      !r.__threw && r.shows && r.hides, r);
  }

  // ============================================================ WIN AND LOSE ARE REACHABLE
  {
    const r = await safe(P, `(function(){
      let won = 0, lost = 0;
      const rw = (typeof gameWon==='function') ? gameWon : null;
      const rl = (typeof endGame==='function') ? endGame : null;
      gameWon = function(){ won++; };
      endGame = function(){ lost++; };
      try {
        __graph([ __N('s','start'), __N('w','win') ], [ __W('s',0,'w') ]); __fire();
        __graph([ __N('s2','start'), __N('l','lose') ], [ __W('s2',0,'l') ]); __fire();
      } finally { if(rw) gameWon = rw; if(rl) endGame = rl; }
      return { won, lost };
    })()`);
    chk('run', 'the graph can end the run either way', !r.__threw && r.won === 1 && r.lost === 1, r);
  }

  // ============================================================ AN OBJECTIVE LINE A PLAYER READS
  {
    const r = await safe(P, `(function(){
      const before = (typeof _curGoal!=='undefined') ? _curGoal : null;
      /* __graph resets the variable store, so the seed has to come AFTER it — the first draft set it
          before and then measured its own reset ("Destroy 0 more") */
      __graph([ __N('s','start'), __N('o','do', { verb:'objective', text:'Destroy {left} more' }) ],
              [ __W('s',0,'o') ]);
      logicVars.left = 2;
      __fire();
      const after = (typeof _curGoal!=='undefined') ? _curGoal : null;
      return { before, after, interpolated: /2/.test(String(after||'')) };
    })()`);
    chk('run', 'the objective line updates and interpolates a variable (builds 692/1402)',
      !r.__threw && r.interpolated, r);
  }

  // put the world back
  await safe(P, `(function(){ __clearProps(); __clearEnemies(); __hudClear();
    if(typeof triggerZones!=='undefined') triggerZones.length = 0;
    logicVars = {}; logicLists = {}; __wavesOn(); __home(); __release(); return 1; })()`);

  const w = Math.max(...R.map(r => r.name.length));
  let g = '';
  console.log('\n  LOGIC & INTERACTION BOOTH — driven in the running game\n  ' + '='.repeat(w + 12));
  for (const r of R) {
    if (r.group !== g) { g = r.group; console.log('  ' + g.toUpperCase()); }
    console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(w));
    if (!r.ok) console.log('           ' + JSON.stringify(r.detail));
  }
  const bad = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
