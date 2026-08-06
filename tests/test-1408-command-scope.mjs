// build 1408 — an order can be given to the enemies at ONE place.
//
// A gauntlet is rooms, and `command` resolved its audience with
// `s.ewho==='nearest' ? 'nearest' : 'enemies'` — all of them, or the single nearest one to the PLAYER. So
// "hold position" fired at the AI booth froze every enemy in the level, including the ones down range at the
// shooting gallery. `_lgEnemyTargets` has taken a radius around a named place since build 1288 and
// damage/heal/kill have used it since; the command verb could not reach it.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------- the audience, executed ----
{
  const targets = new Function('enemies', 'player',
    extractFunction('_lgEnemyTargets') + '\nreturn _lgEnemyTargets;');

  const at = (x, z) => ({ x, z });
  const en = (name, x, z, hp) => ({ name, hp: hp == null ? 10 : hp, mesh: { position: { x, y: 0, z } } });
  const range = [en('r1', 0, 0), en('r2', 2, 0), en('r3', 4, 0)];
  const pit = [en('p1', 70, 70), en('p2', 72, 70)];
  const all = range.concat(pit);
  const T = targets(all, { pos: { x: 72.5, z: 71 } });   // the player is standing at the PIT

  eq(T('enemies').length, 5, 'the audience that always worked still reaches everybody');
  eq(T('nearest').map(e => e.name).join(), 'p2', '...and "nearest" still means nearest to the player');
  eq(T('near', at(2, 0), 12).map(e => e.name).join(), 'r1,r2,r3',
    'the enemies near the range are the three at the range');
  eq(T('near', at(71, 70), 12).map(e => e.name).join(), 'p1,p2', '...and the pit is its own booth');

  // the two fail-closed rules, which are the whole reason a scoped order is safe to author
  eq(T('near', null, 12).length, 0, 'a place that does not exist commands NOBODY, never everybody');
  eq(T('near', at(2, 0), 0).length, 0, 'and a radius of 0 is nowhere, never everywhere');
  eq(T('near', at(2, 0), 0.5).length, 1, 'a small radius is small, not empty');

  // a dead enemy is not commanded, whatever the audience
  const withDead = range.concat([en('dead', 0, 0, 0)]);
  eq(targets(withDead, { pos: { x: 0, z: 0 } })('near', at(0, 0), 20).length, 3,
    'a corpse takes no orders');
}

// ------------------------------------------------------- the handler's own decision ----
{
  const branch = (() => {
    const fn = extractFunction('_applyWorldAction');
    const i = fn.indexOf("if(s.do==='command'){");
    return fn.slice(i, fn.indexOf('\n  if(s.do===', i + 10));
  })();
  assert(branch.length > 200, 'found the command branch');

  const run = (s, places, live) => {
    const seen = { list: null, notes: [] };
    new Function('s', 'LG_CMDS', '_lgEnemyTargets', '_lgPlaceAt', '_noteLogicFailure', 'seen',
      branch.replace("if(s.do==='command'){", 'if(true){')
            .replace(/for\(const e of list\)\{[\s\S]*$/, 'seen.list = list; return; }'))(
      s,
      { hunt: 1, patrol: 1, hold: 1, alert: 1, calm: 1, post: 1 },
      (who, at, r) => { seen.who = who; seen.at = at; seen.r = r; return live == null ? [1] : live; },
      (tag) => places[tag] || null,
      (m) => seen.notes.push(m),
      seen);
    return seen;
  };

  const PLACES = { range: { x: 2, z: 0 }, pit: { x: 71, z: 70 } };

  // the audience is passed through rather than collapsed to two values
  eq(run({ ewho: 'near', escope: 'range', er: 12, cmd: 'hold' }, PLACES).who, 'near',
    'the "near" audience reaches _lgEnemyTargets, which the old ternary made unreachable');
  eq(run({ ewho: 'near', escope: 'range', er: 12, cmd: 'hold' }, PLACES).r, 12, '...with its radius');
  eq(run({ ewho: 'nearest', cmd: 'hold' }, PLACES).who, 'nearest', 'and the old two are unchanged');
  eq(run({ cmd: 'hold' }, PLACES).who, 'enemies');
  eq(run({ ewho: 'sneaky', cmd: 'hold' }, PLACES).who, 'enemies',
    'an audience the engine does not have falls back to all of them, exactly as it always did');

  // a scope nobody answers to commands nobody, and says so (build 1214's channel)
  {
    const s = run({ ewho: 'near', escope: 'nosuchbooth', er: 50, cmd: 'hold' }, PLACES);
    eq(s.list, null, 'nothing is commanded');
    eq(s.notes.length, 1, '...and it is reported rather than silently doing nothing');
    assert(/nosuchbooth/.test(s.notes[0]), '...naming the place that was not found: ' + s.notes[0]);
  }

  // THE FIELD THAT IS NOT `at`, which is the whole design decision
  {
    const s = run({ ewho: 'near', escope: 'range', er: 12, cmd: 'post', at: 'pit' }, PLACES);
    eq(JSON.stringify(s.at), JSON.stringify(PLACES.range),
      'the SCOPE resolves from escope — "the enemies near the range"...');
    assert(/_lgPlaceAt\(s\.at\)/.test(branch),
      '...while `at` keeps meaning the DESTINATION, so "post the range crew at the pit" stays sayable. ' +
      'Overloading one field would have made exactly that arrangement unsayable');
  }

  // the ordinary audiences never resolve a scope at all
  eq(run({ ewho: 'enemies', cmd: 'hold' }, PLACES).at, null,
    'an unscoped order looks up no place, so it cannot be refused by one');
}

// ------------------------------------------------------- both doors offer it ----
{
  const EWHO = "[['enemies','All enemies'],['nearest','Nearest enemy'],['near','Enemies near\\u2026']]";
  eq((src.match(new RegExp(EWHO.replace(/[[\]\\|(){}.*+?^$]/g, '\\$&'), 'g')) || []).length, 2,
    'the graph node and the prop-signal editor offer the same three audiences — a verb that means one ' +
    'thing from a node and another from a signal is the defect build 1277 is named after');

  // the node's own parameter table, which is all the wiring build 1407 left to do
  const T = extractConst('LG_DEFS');
  assert(/\{k:'escope',l:'near',w:84,ifv:\['verb','command'\],ifv2:\['ewho','near'\],listId:'lgPlaceList'\}/.test(T),
    'the scope field appears only for a scoped command...');
  assert(/\{k:'er',l:'radius',w:44,ifv:\['verb','command'\],ifv2:\['ewho','near'\]\}/.test(T),
    '...and so does its radius');

  /* BUILD 1407 IS WHY THAT IS THE WHOLE WIRING. Before it, a new param needed adding to the node table AND
     to a hand-written forwarding literal, and the second half is what got forgotten eight times running. */
  assert(/const _args=_lgDoArgs\(p\)/.test(extractFunction('_lgPulse')),
    'the forwarding is derived, so declaring the params IS wiring them');
  assert(!/escope/.test(extractFunction('_lgPulse')),
    '...and the dispatch names neither new field, which is the point');

  // the signal editor's own row
  const row = extractFunction('_sigWorldRow');
  const i = row.indexOf("s.do==='command'");
  const branch = row.slice(i, row.length);
  assert(/if\(s\.ewho==='near'\)\{/.test(branch), 'the signal editor shows the two fields only when scoped');
  assert(/s\.escope=v/.test(branch) && /s\.er=v/.test(branch), '...and writes both');
}

// ------------------------------------------------------- it survives the save ----
{
  const T = extractConst('SIG_KEYS');
  assert(/\bescope:'es'/.test(T) && /\ber:'er'/.test(T),
    'both fields are in build 1406\'s table, so a scoped order on a prop signal survives a reload — ' +
    'which is exactly what fourteen verbs did not do before that build');
  assert(/\'escope\'/.test(extractConst('_LG_NAME_FIELDS')),
    'and the scope NAMES a place, so it interpolates (build 1402) — booth{n} for a row of them');
}

// Measured live (tools/probe/command-scope.mjs) on two booths 70 m apart, three enemies each, with the
// other booth as the control — a scoped order that reaches nobody and one that reaches everybody are
// indistinguishable without it:
//
//   control  "all enemies patrol"        range patrol/patrol/patrol   pit patrol/patrol/patrol
//   scoped   "hold near range r12"       range hold/hold/hold         pit hunt/hunt/hunt
//   r 0.5    reaches neither booth       range hunt/hunt/hunt         pit hunt/hunt/hunt
//   bad tag  commands nobody, reported   range hunt/hunt/hunt         pit hunt/hunt/hunt
//   post     scope range, destination pit -> all three range enemies posted at 64,64 (the pit)
done('build 1408: an order reaches the enemies at one booth');
