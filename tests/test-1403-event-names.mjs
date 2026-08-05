// build 1403 — an event NAME is a name too, and an emit nobody hears says so.
//
// Found by building the gauntlet's first booth end to end (tools/probe/range-booth.mjs) with nothing a
// creator could not author, and seeing what stopped. Eleven of twelve things worked; the twelfth was this:
// build 1402 gave the graph computed names and its own rule was "every field that NAMES something", and the
// `emit` node's event name was still a literal. A booth with several lanes wants `emit lane{n}_done`.
//
// The second half is the same defect build 1214 fixed for tags: an event nobody listens for did exactly
// nothing, SILENTLY. A graph that looks correct and never runs is the hardest kind to debug, and a computed
// name makes it likelier — a `lane{n}` with `n` unset fires `lane0`.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------ the two AUTHORED emit sites ----
{
  eq((src.match(/_lgEmit\(_lgName\(/g) || []).length, 2,
    'both places a creator types an event name to FIRE it interpolate: the emit NODE and the emit SIGNAL verb');

  const pulse = extractFunction('_lgPulse');
  assert(/case 'emit': \{ _lgEmit\(_lgName\(p\.name\)\); /.test(pulse), 'the emit node');
  assert(/if\(s\.do==='emit'\)\{[^\n]*_lgEmit\(_lgName\(s\.text\)\)/.test(extractFunction('_applySignalAction')),
    'and the prop signal, so a plate can report into a lane of its own');

  // THE LISTENER STAYS LITERAL, and that is a decision rather than an omission: an `On event` name is
  // MATCHED, not computed, so a listener whose own name moved with a variable would answer a different
  // question every time the graph happened to evaluate it.
  const evCase = pulse.slice(pulse.indexOf("case 'event':"), pulse.indexOf("case 'event':") + 200);
  assert(!/_lgName/.test(evCase), 'the On-event node does NOT interpolate its own name');
  assert(/String\(name\|\|''\)\.trim\(\)/.test(extractFunction('logicEvent')),
    '...and the matcher it feeds still compares a plain trimmed string');

  // everything else that fires an event names a FIXED event per control and keeps calling logicEvent
  assert((src.match(/logicEvent\(/g) || []).length > 3,
    'the HUD button, the trigger zones and the action binds still call logicEvent directly');
}

// ------------------------------------------------------------ executed: heard vs unheard ----
{
  const api = new Function('logicGraph', 'notes', 'fired',
    extractFunction('_lgEventHeard') + '\n' +
    'function _noteLogicFailure(m){ notes.push(m); }\n' +
    'function logicEvent(n){ fired.push(n); }\n' +
    extractFunction('_lgEmit') + '\nreturn { emit:_lgEmit, heard:_lgEventHeard };');

  const run = (nodes, name) => {
    const notes = [], fired = [];
    api({ nodes }, notes, fired).emit(name);
    return { notes, fired };
  };

  const G = [{ type: 'event', p: { name: 'HIT' } }, { type: 'do', p: {} }, { type: 'event', p: { name: ' NEXT ' } }];

  { const r = run(G, 'HIT');
    eq(r.notes.length, 0, 'an event a node listens for is reported as nothing...');
    eq(r.fired[0], 'HIT', '...and fires'); }

  { const r = run(G, 'NEXT');
    eq(r.notes.length, 0, 'a listener whose authored name has stray spaces still counts as listening'); }

  { const r = run(G, 'NOBODY');
    eq(r.notes.length, 1, 'an event nobody listens for is REPORTED — build 1214\'s channel');
    assert(/NOBODY/.test(r.notes[0]), '...by name, so the creator can find the typo');
    eq(r.fired[0], 'NOBODY',
      '...and STILL FIRES. A report is a note in the Level Check, never a refusal: a prop signal or a HUD ' +
      'button may legitimately be the only thing that hears an event this run'); }

  { const r = run(G, '   ');
    eq(r.notes.length, 1, 'a blank name is reported...');
    eq(r.fired.length, 0, '...and is the one case that fires nothing, because there is nothing to fire'); }

  { const r = run(G, null); eq(r.fired.length, 0, 'and so is a missing one'); }

  // it must never throw on a graph that is not there yet — the emit verb runs from prop signals, which
  // can fire before or after a graph is loaded
  const heard = new Function('logicGraph', extractFunction('_lgEventHeard') + '\nreturn _lgEventHeard;');
  eq(heard(undefined)('X'), true, 'no graph reports nothing rather than reporting everything');
  eq(heard({})('X'), true, 'and neither does a graph with no node list');
  eq(heard({ nodes: [null, { type: 'event' }] })('X'), false, 'a null node and a nameless one are skipped safely');
}

// ------------------------------------------------------------ the whole booth, verified live ----
// tools/probe/range-booth.mjs authors the gauntlet's first booth as a real logic graph plus real prop
// signals and runs it. Every piece is a creator-reachable construct:
//
//   RANGE_START -> setvar score=0 -> read time -> emit NEXT
//   NEXT        -> setvar n random 1..3 -> showprop plate{n}
//   HIT         -> addvar score+1 -> resetprop plate{n} -> hideprop plate{n} -> emit NEXT
//   every 1 s   -> read time -> expr left = 20 - (now - t0) -> branch left<=0 -> toast 'Time! Score {score}'
//   each plate   carries a `damaged` signal (build 1397) that emits HIT
//
//   12/12 verified — one plate up at a time, a real shot scoring through bullet -> damageProp -> signal ->
//   graph, ten hits scoring ten with every plate back at full health and still shootable, the clock ending
//   the round and naming the score while NOT ending it with time left, a computed emit landing on a literal
//   listener, and an unheard emit reported with a heard one as the control.
//
// FOUR INSTRUMENT FAULTS on the way there, and every one of them read as a broken feature:
//   1. the booth was built at the origin, where the stock level's own geometry is in the way — build 1323's
//      rule, that you build the thing you are measuring somewhere nothing else lives;
//   2. the plates carried `w:'damaged'`, which is the SERIALIZED key; the runtime field is `when`;
//   3. `yaw = Math.PI` aimed the firing line away from the plates — forward is (-sin yaw, -cos yaw);
//   4. an `interval` node is TICKED by updateLogic and pulsing it by hand is not the same wire.
//
// And one thing NOT isolated, stated rather than papered over: **shots in the headless renderer are
// intermittent** — identical camera, identical direction, the mag decrements every time, and roughly one in
// three lands. The probe therefore fires until it lands and reports the count, and drives the ten-round loop
// through `damageProp` so what is measured is the booth rather than the rig.
done('build 1403: a computed event name, and an emit nobody hears that says so');
