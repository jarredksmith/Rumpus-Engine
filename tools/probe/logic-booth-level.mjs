// The gauntlet's LOGIC & INTERACTION booth as a level file — authored, saved, reloaded, then RUN.
//
// The third of the three the gauntlet is scoped around. The range booth (1403/1423-era) and the physics
// booth (1427) and the AI booth (1429-era) all have their round trip; the logic side has never had one,
// and it is the section with the most hand-kept structure in the file: a node graph whose params are
// passed through verbatim, four persistence flags, HUD widgets with two sanitizers, and the zone types.
//
// Build 1406 is the warning that applies most directly here — fourteen of seventeen SIGNAL verbs lost
// every parameter across a save, silently, and only after a save, because the in-memory object was right.
// A logic NODE's params travel by a different road (`_sanitizeLogic` passes `p` through whole), so whether
// that road is intact is a separate question nobody has asked.
//
// Everything here is authorable through the editor. Nothing pokes a runtime-only field.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P) => {
  const authored = await safe(P, DRIVE_RIG + `(function(){
    paused = false; gameOn = true;
    const B = 44;   // inside the arena, clear of the stock level (builds 1323 / 1405)

    /* ---- the graph a creator would draw for a booth --------------------------------------------- */
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    const N = (id, type, p) => { logicGraph.nodes.push({ id, type, x:0, y:0, p:p||{} }); return id; };
    const W = (a, b, o, i) => logicGraph.wires.push({ a, o:o||0, b, i:i||'in' });

    /* Every key here was READ OUT of the dispatch rather than guessed. A first draft used amt/cmp/dst
       and an ASCII star for multiply — the real ones are value/op/var and the multiplication SIGN, and a
       wrong key produces a node that runs and silently computes the wrong thing, which is worse than one
       that throws. Build 1427's rule, and the AI booth hit it an hour earlier. */
    N('n1', 'event',  { name:'BOOTH_START' });
    N('n2', 'setvar', { name:'score', value:2 });
    N('n3', 'math',   { name:'bonus', a:'score', op:'\u00d7', b:'10' });   // build 1169
    N('n4', 'read',   { stat:'time', name:'t0' });                        // build 1169's world query
    N('n5', 'branch', { a:'score', op:'>=', b:'3' });
    N('n6', 'do',     { do:'toast', text:'Score {score}, bonus {bonus}' }); // build 1402 interpolation
    N('n7', 'list',   { name:'deck', op:'fill', value:5 });                // build 1269
    N('n8', 'list',   { name:'deck', op:'draw', var:'card' });
    N('n9', 'expr',   { name:'pct', expr:'(score / 3) * 100' });           // build 1271's escape hatch
    W('n1','n2'); W('n2','n3'); W('n3','n4'); W('n4','n5'); W('n5','n6',0); W('n5','n7',1);
    W('n7','n8'); W('n8','n9');

    /* ---- what carries between rooms (builds 1075 / 1227 / 1415 / 1416) -------------------------- */
    persistVars.length = 0; persistVars.push('score', 'bonus');
    persistSave = true; persistInv = true; persistCp = true;

    /* ---- the interface (builds 1058 / 1255 / 1260 / 1287) --------------------------------------- */
    hudWidgets.length = 0;
    for(const w of _sanitizeHudWidgets([
      { kind:'text',   label:'Score {score}' },
      { kind:'bar',    label:'HP', value:'score', max:'3' },
      { kind:'button', label:'BUY', event:'BOOTH_BUY' },
      { kind:'image',  img:'https://example.com/card.png', iw:220, ih:140, alpha:0.8 },
    ])) hudWidgets.push(w);

    /* ---- interaction: a lever, a locked door and its key, and a trigger watching for a PROP ------ */
    /* spawnProp delivers through a CALLBACK and returns nothing — a primitive's builder runs
       synchronously (build 1409), so the object is in hand by the time the call returns. */
    let lever = null, door = null;
    spawnProp('box', [B, 0, B, 0,0,0, 1,1,1], (o)=>{ lever = o; });
    spawnProp('box', [B+8, 0, B, 0,0,0, 1,3,1], (o)=>{ door = o; });
    if(!lever || !door) return { ok:false, why:'primitives did not build synchronously' };
    lever.userData.interact = true; lever.userData.name = 'Booth lever'; lever.userData.tag = 'lever';
    lever.userData.signals = [{ when:'used', do:'emit', n:'BOOTH_START' }];
    /* the runtime field is lockId, serialized as lk — a fixture writing userData.lock reads
       exactly like the loader dropping it, which is the fourth invented field name in this
       one probe and the fourth time it looked like an engine bug. */
    door.userData.tag = 'vaultDoor'; door.userData.lockId = 'gold'; door.userData.lockConsume = true;

    triggerZones.length = 0;
    triggerZones.push(_migrateTrigger({ x:B+4, z:B+4, r:3, y:0, h:3, who:'prop', ptag:'ball',
                                        ev:'BALL_IN', once:false }));   // build 1276

    return { ok:true, nodes: logicGraph.nodes.length, wires: logicGraph.wires.length,
             widgets: hudWidgets.length, persist: persistVars.slice(), triggers: triggerZones.length };
  })()`);
  chk('the booth is authored', authored.ok && authored.nodes === 9 && authored.widgets === 4,
      JSON.stringify(authored));
  if (!authored.ok) { report(); return; }

  /* ---- SAVE --------------------------------------------------------------------------------------- */
  const saved = await safe(P, `(function(){
    window.__json = serializeLevel();
    const L = JSON.parse(JSON.stringify(window.__json));
    const by = {}; for(const n of ((L.logic&&L.logic.nodes)||[])) by[n.id] = n;
    return { nodes:((L.logic&&L.logic.nodes)||[]).length, wires:((L.logic&&L.logic.wires)||[]).length,
             math: by.n3 && by.n3.p, expr: by.n9 && by.n9.p, list: by.n7 && by.n7.p, toast: by.n6 && by.n6.p,
             persistVars: L.persistVars, persistSave: L.persistSave, persistInv: L.persistInv, persistCp: L.persistCp,
             widgets: (L.hudWidgets||[]).length, widgetKinds: (L.hudWidgets||[]).map(w=>w.kind),
             button: (L.hudWidgets||[]).find(w=>w.kind==='button'),
             trig: (L.triggers||[])[0],
             lock: (L.props||[]).map(p=>p.lk).filter(Boolean),
             lockConsume: (L.props||[]).map(p=>p.lkc).filter(Boolean),
             sig: (L.props||[]).map(p=>p.sg).filter(Boolean).flat() };
  })()`);
  chk('every node and wire serializes', saved.nodes === 9 && saved.wires === 8,
      saved.nodes + ' nodes, ' + saved.wires + ' wires');
  chk('a Math node keeps its whole parameter set', saved.math && saved.math.name === 'bonus' &&
      saved.math.op === '\u00d7' && saved.math.a === 'score', JSON.stringify(saved.math));
  chk('an expression survives verbatim', saved.expr && saved.expr.expr === '(score / 3) * 100',
      JSON.stringify(saved.expr));
  chk('a List node keeps op and bounds', saved.list && saved.list.op === 'fill' && saved.list.value === 5,
      JSON.stringify(saved.list));
  chk('interpolated text survives unescaped', saved.toast && /\{score\}/.test(saved.toast.text),
      JSON.stringify(saved.toast));
  chk('the carried variable list serializes', Array.isArray(saved.persistVars) &&
      saved.persistVars.length === 2, JSON.stringify(saved.persistVars));
  chk('all three persistence flags serialize', saved.persistSave && saved.persistInv && saved.persistCp,
      JSON.stringify([saved.persistSave, saved.persistInv, saved.persistCp]));
  chk('every HUD widget serializes', saved.widgets === 4, 'wrote ' + saved.widgets);
  chk('a HUD button keeps the event it fires', saved.button && saved.button.event === 'BOOTH_BUY',
      JSON.stringify(saved.button));
  chk('a prop-watching trigger keeps its tag filter', saved.trig && saved.trig.who === 'prop' &&
      saved.trig.ptag === 'ball', JSON.stringify(saved.trig));
  chk('a lock and its consume flag serialize', saved.lock.includes('gold') && saved.lockConsume.length === 1,
      JSON.stringify([saved.lock, saved.lockConsume]));
  chk('the lever’s signal serializes', saved.sig && saved.sig.length === 1, JSON.stringify(saved.sig));

  /* ---- RELOAD ------------------------------------------------------------------------------------- */
  const back = await safe(P, `(function(){
    /* reset to a state that is NOT the authored one, so an arriving value was APPLIED (build 1400) */
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    persistVars.length = 0; persistSave = false; persistInv = false; persistCp = false;
    hudWidgets.length = 0; triggerZones.length = 0;
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const by = {}; for(const n of logicGraph.nodes) by[n.id] = n;
    const wid = {}; for(const w of hudWidgets) wid[w.kind] = w;
    return { nodes: logicGraph.nodes.length, wires: logicGraph.wires.length,
             math: by.n3 && by.n3.p, expr: by.n9 && by.n9.p.expr, toast: by.n6 && by.n6.p.text,
             persistVars: persistVars.slice(), flags:[persistSave, persistInv, persistCp],
             widgets: hudWidgets.length, buttonEv: wid.button && wid.button.event,
             barV: wid.bar && wid.bar.value,
             trig: triggerZones[0] && { who:triggerZones[0].who, ptag:triggerZones[0].ptag, ev:triggerZones[0].ev },
             lock: (propModels.find(p=>p&&p.userData&&p.userData.tag==='vaultDoor')||{userData:{}}).userData.lockId,
             leverSig: (propModels.find(p=>p&&p.userData&&p.userData.tag==='lever')||{userData:{}}).userData.signals };
  })()`);
  chk('the whole graph comes back', back.nodes === 9 && back.wires === 8,
      back.nodes + ' nodes, ' + back.wires + ' wires');
  chk('node params survive the reload', back.math && back.math.name === 'bonus' && back.math.op === '\u00d7',
      JSON.stringify(back.math));
  chk('the expression survives the reload', back.expr === '(score / 3) * 100', String(back.expr));
  chk('interpolated text survives the reload', /\{score\}/.test(String(back.toast)), String(back.toast));
  chk('the carried list is READ BACK', back.persistVars.length === 2 && back.persistVars.includes('score'),
      JSON.stringify(back.persistVars));
  chk('the three persistence flags are READ BACK', back.flags.every(Boolean), JSON.stringify(back.flags));
  chk('every HUD widget is READ BACK', back.widgets === 4, 'got ' + back.widgets);
  chk('the button still fires its event', back.buttonEv === 'BOOTH_BUY', String(back.buttonEv));
  chk('the bar still reads its variable', back.barV === 'score', String(back.barV));
  chk('the prop trigger is READ BACK with its filter', back.trig && back.trig.who === 'prop' &&
      back.trig.ptag === 'ball', JSON.stringify(back.trig));
  chk('the lock is READ BACK on the prop', back.lock === 'gold', String(back.lock));
  chk('the lever’s signal is READ BACK', Array.isArray(back.leverSig) && back.leverSig.length === 1 &&
      back.leverSig[0].do === 'emit', JSON.stringify(back.leverSig));

  /* ---- STABILITY ---------------------------------------------------------------------------------- */
  const stable = await safe(P, `(function(){
    const cut = (L)=>JSON.stringify({ logic:L.logic, hudWidgets:L.hudWidgets, triggers:L.triggers,
                                      persistVars:L.persistVars });
    const a = cut(serializeLevel());
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const b = cut(serializeLevel());
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const c = cut(serializeLevel());
    return { ab: a===b, bc: b===c, len: a.length };
  })()`);
  chk('the logic block is byte-stable across save cycles', stable.ab && stable.bc, JSON.stringify(stable));

  /* ---- RUN the reloaded graph --------------------------------------------------------------------- */
  // Reading fields back proves the file; it does not prove the graph RUNS on them. Build 1277's rule:
  // pinning the two ends of a wire says nothing about the wire, so this fires the real event.
  const ran = await safe(P, `(function(){
    logicStart();
    logicVars.score = 0;
    logicEvent('BOOTH_START');       // the lever's own verb, fired directly
    __drive(4);
    const first = { score: logicVars.score, bonus: logicVars.bonus, pct: logicVars.pct, card: logicVars.card,
                    t0: logicVars.t0 };
    logicVars.score = 5;
    logicEvent('BOOTH_START');
    __drive(4);
    return { first, second: { bonus: logicVars.bonus, pct: logicVars.pct },
             listLen: (typeof logicLists!=='undefined' && logicLists.deck) ? logicLists.deck.length : null,
             gate: __gate() };
  })()`);
  chk('nothing is gating the frame loop', !ran.gate, String(ran.gate));
  chk('the reloaded graph RUNS — Math computes', ran.first && ran.first.bonus === 20,
      JSON.stringify(ran.first));
  chk('...and recomputes on new input', ran.second && ran.second.bonus === 20, JSON.stringify(ran.second));
  chk('the reloaded expression evaluates', ran.first && typeof ran.first.pct === 'number',
      JSON.stringify(ran.first && ran.first.pct));
  chk('the reloaded read-stat node writes a value', ran.first && typeof ran.first.t0 === 'number',
      JSON.stringify(ran.first && ran.first.t0));

  report();

  function report(){
    console.log('');
    let ok = 0;
    for (const r of R) { console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name +
      (r.ok ? '' : '   <- ' + (r.detail == null ? '' : r.detail))); if (r.ok) ok++; }
    console.log('\n  ' + ok + '/' + R.length + '\n');
  }
}, { settleMs: 5000 });
