// The gauntlet's first booth, AS A LEVEL FILE — authored, saved, reloaded, and then played.
//
// `range-booth.mjs` already builds this booth in memory and drives it with shots (12/12). What it never
// does is the thing a creator does every single session: press Save, come back, and play what came out.
// That gap is where this engine's expensive bugs live — 1398 (a shootable target saved and was never read
// back), 1400 (five game settings written and never loaded), 1401 (thirteen sections a co-op joiner never
// received), 1406 (fourteen of seventeen signal verbs lost every parameter), 1420 (the format was not
// idempotent). Builds 1421-1423 have just changed what `breakable` means, which props a Destroy mission
// counts, and what the Level Check says — all of it prop and objective state that travels in the file.
//
// So: author the whole booth, `serializeLevel()`, `restoreLevel()` the JSON, and assert every authored
// piece came back — then SHOOT IT, on the restored props, and watch the score climb.
import { withGame } from './driver.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P) => {
  // ---------------------------------------------------------------- author the booth
  // Everything here is reachable from the editor: props with signals, a logic graph, a HUD widget, a
  // world sign, an objective. Nothing is engine-internal.
  const built = await safe(P, `(function(){
    paused = false;
    /* build 1323: put it where nothing else lives, or the stock level's geometry eats the shots */
    const AT = 500;
    window.__mk = (src, t, f) => { let o=null; spawnProp(src, t, (b)=>{o=b;}); f(o); return o; };

    /* three plates: bolted down (1390), breakable, each reporting its own hit (1397) */
    for(let i=1;i<=3;i++) __mk('box', [AT + (i-2)*3, 1.2, AT, 0,0,0, 1.4,1.4,0.3], (o)=>{
      o.userData.tag = 'plate'+i;
      o.userData.name = 'Plate '+i;
      o.userData.shootable = true;
      o.userData.breakable = true;
      o.userData.objective = true;                       /* build 1422: counts toward Destroy */
      o.userData.maxHp = 20; o.userData.hp = 20;
      o.userData.breakStyle = 'puff';
      o.userData.hitSnd = 'https://example.invalid/steel.mp3';   /* build 1305 */
      o.userData.signals = [{ when:'damaged', do:'emit', text:'PLATE_HIT' }];
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    });

    /* an INFINITE practice plate: build 1421's case — takes hits forever, never disappears */
    __mk('box', [AT + 6, 1.2, AT, 0,0,0, 1.4,1.4,0.3], (o)=>{
      o.userData.tag = 'practice';
      o.userData.shootable = true;
      o.userData.breakable = false;                      /* the setting the report was about */
      o.userData.signals = [{ when:'damaged', do:'emit', text:'PLATE_HIT' }];
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    });

    /* a lever that resets the booth (1391's verb, via a signal) */
    __mk('box', [AT - 6, 1.0, AT, 0,0,0, 0.6,1.2,0.6], (o)=>{
      o.userData.tag = 'lever';
      o.userData.interact = true;
      o.userData.signals = [{ when:'interacted', do:'emit', text:'RANGE_START' }];
    });

    /* a scoreboard IN THE WORLD (build 1411) reading the same variable the HUD does */
    __mk('sign', [AT, 3.2, AT - 4, 0,0,0, 4,2,1], (o)=>{
      o.userData.tag = 'board';
      o.userData.sign = { text:'SCORE {score}', size:80, color:'#eafff7', bg:'#0b1418', bga:0.85, align:'center' };
      if(typeof _signRender==='function') _signRender(o);
    });

    /* the graph: hit -> +1 and reset that plate; the lever zeroes it */
    logicGraph.nodes = [
      { id:'h0', type:'event',  x:0,   y:0,   p:{ name:'PLATE_HIT' } },
      { id:'h1', type:'addvar', x:150, y:0,   p:{ name:'score', value:'1' } },
      { id:'r0', type:'event',  x:0,   y:150, p:{ name:'RANGE_START' } },
      { id:'r1', type:'setvar', x:150, y:150, p:{ name:'score', value:'0' } },
      { id:'r2', type:'do',     x:300, y:150, p:{ verb:'resetprop', target:'plate1' } },
    ];
    logicGraph.wires = [
      { a:'h0', o:0, b:'h1', i:'in' },
      { a:'r0', o:0, b:'r1', i:'in' }, { a:'r1', o:0, b:'r2', i:'in' },
    ];

    /* the HUD readout. NOTE the field: widgets live in a TOP-LEVEL hudWidgets array, not on hudCfg —
       the first run of this probe wrote hudCfg.widgets, which nothing serializes, and then reported the
       widget as lost. Read the serializer before believing a round-trip failure. */
    hudWidgets = _sanitizeHudWidgets([{ kind:'text', label:'SCORE {score}', anchor:'tc', x:0, y:17, size:18 }]);

    gameCfg.objective = 'destroy';
    gameCfg.goalText  = 'Clear the range.';

    return { props: propModels.length, nodes: logicGraph.nodes.length, widgets: hudWidgets.length };
  })()`);
  chk('the booth is authored', !built.__threw && built.nodes === 5 && built.widgets === 1, built);

  // ---------------------------------------------------------------- what the check says about it
  const issues = await safe(P, `levelIssues().filter(m=>/objective is|Objective target/.test(m))`);
  chk('Level Check is quiet — the booth is winnable as authored (build 1423)',
    Array.isArray(issues) && issues.length === 0, issues);

  // ---------------------------------------------------------------- SAVE, then LOAD
  const trip = await safe(P, `(function(){
    const json = JSON.stringify(serializeLevel());
    window.__json = json;
    restoreLevel(JSON.parse(json));                       /* the REAL runtime loader */
    const by = t => propModels.find(o=>o&&o.userData&&o.userData.tag===t);
    const p1 = by('plate1'), pr = by('practice'), lv = by('lever'), bd = by('board');
    return {
      bytes: json.length,
      plate: p1 && { shootable:!!p1.userData.shootable, breakable:p1.userData.breakable,
                     objective:!!p1.userData.objective, maxHp:p1.userData.maxHp, hp:p1.userData.hp,
                     style:p1.userData.breakStyle, snd:!!p1.userData.hitSnd, name:p1.userData.name,
                     sig:(p1.userData.signals||[]).map(s=>s.when+'/'+s.do+'/'+s.text).join(',') },
      practice: pr && { shootable:!!pr.userData.shootable, breakable:pr.userData.breakable,
                        sig:(pr.userData.signals||[]).map(s=>s.when+'/'+s.do+'/'+s.text).join(',') },
      lever: lv && { interact:!!lv.userData.interact,
                     sig:(lv.userData.signals||[]).map(s=>s.when+'/'+s.do+'/'+s.text).join(',') },
      board: bd && { text:(bd.userData.sign||{}).text, drawn:!!(bd.material && bd.material.map) },
      nodes: logicGraph.nodes.length, wires: logicGraph.wires.length,
      resetTarget: ((logicGraph.nodes||[]).find(n=>n.type==='do')||{p:{}}).p.target,
      widget: ((hudWidgets||[])[0]||{}).label,
      widgetCount: (hudWidgets||[]).length,
      objective: gameCfg.objective, goal: gameCfg.goalText,
      damageable: damageableProps().length,
    };
  })()`);
  console.log('\nafter save -> load:', JSON.stringify(trip, null, 1).slice(0, 1400));

  chk('the shootable target came back shootable (build 1398)', trip.plate && trip.plate.shootable, trip.plate);
  chk('...with its health, break style, name and impact sound',
    trip.plate && trip.plate.maxHp === 20 && trip.plate.style === 'puff' && trip.plate.snd && trip.plate.name === 'Plate 1', trip.plate);
  chk('...and its on-hit signal, parameters intact (build 1406)',
    trip.plate && trip.plate.sig === 'damaged/emit/PLATE_HIT', trip.plate && trip.plate.sig);
  chk('...and its Objective-target flag (build 1422)', trip.plate && trip.plate.objective, trip.plate);
  chk('the UNBREAKABLE practice plate came back unbreakable (build 1421)',
    trip.practice && trip.practice.breakable === false && trip.practice.shootable, trip.practice);
  chk('...and it is still damageable, which is the whole of that build',
    trip.damageable >= 4, trip.damageable);
  chk('the lever kept its interact flag and its signal',
    trip.lever && trip.lever.interact && trip.lever.sig === 'interacted/emit/RANGE_START', trip.lever);
  chk('the world sign kept its text and was re-drawn on load (build 1411)',
    trip.board && trip.board.text === 'SCORE {score}' && trip.board.drawn, trip.board);
  chk('the graph survived, reset verb and target included',
    trip.nodes === 5 && trip.wires === 3 && trip.resetTarget === 'plate1', trip);
  chk('the HUD widget survived', trip.widget === 'SCORE {score}', trip.widget);
  chk('the objective and its goal line survived',
    trip.objective === 'destroy' && trip.goal === 'Clear the range.', trip);

  // ---------------------------------------------------------------- idempotent? (build 1420)
  // Measured as STABILITY, not as reproduction of the very first save, because the two are different
  // claims and only one of them matters. The boot state carries `aim.state.ry` = ...045 while
  // `aimWep.sniper.ry` = ...046, and the loader makes the global pose adopt the per-weapon one — a
  // ONE-ULP, ONE-TIME normalisation. Measured over six cycles: 0 -> 1 differs, 1 -> 2 -> 3 -> 4 -> 5 are
  // byte-identical. What would matter is a value that moves a LITTLE EVERY TIME, because this engine
  // autosaves every 20 seconds; that is what build 1420 was about and it is not happening.
  const again = await safe(P, `(function(){
    const cyc = [];
    let prev = null, drift = 0;
    for(let i=0;i<4;i++){
      if(typeof resetDynamicProps==='function') resetDynamicProps();
      const j = JSON.stringify(serializeLevel());
      if(prev !== null && j !== prev) drift++;
      cyc.push(j.length); prev = j;
      restoreLevel(JSON.parse(j));
    }
    return { drift, lens: cyc, settledFromFirstReload: drift === 0 };
  })()`);
  chk('the booth is byte-stable across repeated save/reload cycles (build 1420)',
    again.settledFromFirstReload, again);

  // ---------------------------------------------------------------- now PLAY it
  const play = await safe(P, `(function(){
    const by = t => propModels.find(o=>o&&o.userData&&o.userData.tag===t);
    const hit = (t, n, d) => { const o = by(t);
      for(let i=0;i<n;i++){ _lgBudget = 0; o.userData._hitSndT = 0;
        damageProp(o, d, o.position.clone(), new THREE.Vector3(0,0,-1), 1, null); } };
    logicVars = {};
    _setupDestroyTargets();
    const started = { targets: _destroyTotal };

    hit('plate1', 1, 5);                       // a scoring hit that does not kill
    const one = { score: logicVars.score||0, hp: by('plate1').userData.hp };

    hit('practice', 10, 999);                  // the infinite plate
    const prac = { score: logicVars.score||0, gone: !!by('practice').userData._shattered,
                   hp: by('practice').userData.hp };

    hit('plate1', 1, 999); hit('plate2', 1, 999); hit('plate3', 1, 999);
    objectiveTick(0.016);
    const cleared = { score: logicVars.score||0, remain: _destroyRemain, total: _destroyTotal };

    /* the lever: zero the score and bring plate1 back (build 1391) */
    logicEvent('RANGE_START');
    const after = { score: logicVars.score||0, plate1: { gone: !!by('plate1').userData._shattered,
                    hp: by('plate1').userData.hp, visible: by('plate1').visible } };

    /* and it takes damage again, which is what makes a range a range */
    hit('plate1', 1, 5);
    return { started, one, prac, cleared, after, reshot: { score: logicVars.score||0, hp: by('plate1').userData.hp } };
  })()`);
  console.log('\nplayed:', JSON.stringify(play, null, 1).slice(0, 1200));

  chk('the Destroy mission counted the three plates and not the unbreakable one (build 1422)',
    play.started && play.started.targets === 3, play.started);
  chk('one shot scores and leaves the plate standing', play.one && play.one.score === 1 && play.one.hp === 15, play.one);
  chk('the practice plate scored 10 more hits and never broke (build 1421)',
    play.prac && play.prac.score === 11 && play.prac.gone === false, play.prac);
  chk('destroying all three finishes the mission', play.cleared && play.cleared.remain === 0 && play.cleared.total === 3, play.cleared);
  chk('the lever zeroed the score and restored plate 1 (build 1391)',
    play.after && play.after.score === 0 && play.after.plate1.gone === false && play.after.plate1.visible, play.after);
  chk('...and the restored plate takes damage again', play.reshot && play.reshot.score === 1 && play.reshot.hp === 15, play.reshot);
}, { settleMs: 5000 });

let bad = 0;
for (const r of R) { if (!r.ok) bad++; console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name +
  (r.ok ? '' : '   ' + String(JSON.stringify(r.detail)).slice(0, 220))); }
console.log('\n' + (R.length - bad) + '/' + R.length + (bad ? '  — ' + bad + ' FAILED' : '  the booth survives a save and plays'));
process.exit(bad ? 1 : 0);
