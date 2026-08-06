// build 1407 — the Do node forwards what the creator typed into it.
//
// The dispatch built a HAND-WRITTEN literal to hand to `_applySignalAction`, and the node's own parameter
// table is the list of fields a creator can fill in. Two lists, and eight builds added to one of them.
//
// Measured live (tools/probe/do-node-forward.mjs), against a control that fires:
//
//   missing: ["once", "r"]
//   control  "damage all enemies"      both enemies 31 -> 26
//   then     "damage enemies near X"   the one two metres from X: 26 -> 26
//
// So build 1288's area damage did NOTHING from the graph — the feature that unblocked tower defence, traps
// and mines — and build 1399's once-only pickup was never once-only. Neither shipped broken in the SIGNAL
// path, which is why nobody noticed: only the graph dropped them.
//
// Build 1406 had just finished paying for this exact shape one layer down (the serializer's short-key list),
// which is why this is derived rather than extended.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------- no second list ----
{
  eq((src.match(/function _lgDoArgs\(/g) || []).length, 1, 'the derivation exists once');
  eq((src.match(/_lgDoArgs\(p\)/g) || []).length, 2, '...and has exactly one caller');
  assert(!/_applySignalAction\(\{ do:_verb/.test(src),
    'the hand-written forwarding literal is gone — extending it was the mistake, not the fix');
  assert(/const _args=_lgDoArgs\(p\); _args\.target=_tgt;/.test(extractFunction('_lgPulse')),
    'the tag is written over the derived one because it was already resolved for the exists-check, ' +
    'rather than being interpolated twice');
}

// ------------------------------------------------------- executed, against the REAL param table ----
const mk = () => new Function('_lgName',
  'const LG_DEFS = ' + extractConst('LG_DEFS') + ';\n' +
  'const _LG_NAME_FIELDS = ' + extractConst('_LG_NAME_FIELDS') + ';\n' +
  extractFunction('_lgDoArgs') + '\n' +
  'return { _lgDoArgs, LG_DEFS };')(
  (v) => (v == null ? '' : String(v).slice(0, 64)));   // build 1402's interpolator, stubbed to its identity

{
  const { _lgDoArgs, LG_DEFS } = mk();
  const params = LG_DEFS.do.params.map(p => p.k).filter(k => k !== 'verb');
  assert(params.length >= 20, 'the do node really does offer a lot of fields (' + params.length + ')');

  // THE DEFECT, reproduced: the two fields the literal never carried
  assert(params.includes('once') && params.includes('r'),
    'the node offers `once` (build 1399) and `r` (build 1288)');
  {
    const got = _lgDoArgs({ verb: 'damage', who: 'near', at: 'booth', r: 12, amt: 20 });
    eq(got.r, 12, 'the area radius reaches the handler — without it _lgEnemyTargets is handed 0, which it ' +
      'correctly reads as NOWHERE, so the verb silently affects nobody');
    eq(got.who, 'near'); eq(got.at, 'booth'); eq(got.amt, 20);
  }
  {
    const got = _lgDoArgs({ verb: 'pickup', pk: 'health', once: 1, at: 'me' });
    eq(got.once, 1, 'a spawned pickup keeps its once flag');
  }

  // EVERY field, not the two that were noticed
  {
    const filled = { verb: 'damage' };
    for (const k of params) filled[k] = (k === 'vtrack') ? 1 : 'v_' + k;
    const got = _lgDoArgs(filled);
    for (const k of params) {
      assert(k in got, 'forwarded: ' + k);
      if (k !== 'vtrack') eq(String(got[k]), 'v_' + k, '...with the creator\'s value: ' + k);
    }
    eq(got.do, 'damage', 'and the verb itself rides as `do`');
  }
}

// ------------------------------------------------------- the defaults come from the table too ----
{
  const { _lgDoArgs, LG_DEFS } = mk();
  const blank = _lgDoArgs({ verb: 'damage' });

  /* every default the hand-written literal applied was already the first option of its own select, so
     deriving them changes nothing — which is what makes this safe. Checked against the real table rather
     than restated, so retuning a dropdown's order fails here instead of silently moving a default. */
  for (const pm of LG_DEFS.do.params) {
    if (pm.k === 'verb' || !pm.sel || !pm.sel.length) continue;
    eq(blank[pm.k], pm.sel[0][0], 'an unset ' + pm.k + ' defaults to its first option');
  }
  eq(blank.who, 'player'); eq(blank.etype, 'grunt'); eq(blank.pk, 'health');
  eq(blank.vmode, 'normal'); eq(blank.stat, 'speed'); eq(blank.ewho, 'enemies'); eq(blank.cmd, 'hunt');

  // a text field arrives blank rather than absent — every handler reads `+x||default` or `String(x||'')`
  eq(blank.clip, ''); eq(blank.sound, ''); eq(blank.amt, ''); eq(blank.r, '');
  eq(+blank.amt || 25, 25, 'so a blank amount still means the handler\'s own default');
  eq(+blank.r || 0, 0, '...and a blank radius still means nowhere, which is the fail-closed direction');

  // the one checkbox with a default, and the only reason `def` exists
  eq(blank.vtrack, true,
    'build 1404\'s "follows the player" is ON unless turned off — a default that lived only in the ' +
    'forwarding literal, so the editor rendered the box UNCHECKED while the runtime treated it as on');
  eq(_lgDoArgs({ verb: 'view', vtrack: 0 }).vtrack, 0, '...and an explicit 0 still turns it off');
  eq(blank.once, false, 'a checkbox with no `def` still defaults to off');
}

// ------------------------------------------------------- the four NAME fields still interpolate ----
{
  const calls = [];
  const scope = new Function('_lgName',
    'const LG_DEFS = ' + extractConst('LG_DEFS') + ';\n' +
    'const _LG_NAME_FIELDS = ' + extractConst('_LG_NAME_FIELDS') + ';\n' +
    extractFunction('_lgDoArgs') + '\n' + 'return _lgDoArgs;')(
    (v) => { calls.push(v); return 'NAMED'; });

  const got = scope({ verb: 'spawnprop', target: 'a', prefab: 'b', item: 'c', text: 'd', at: 'e', vtag: 'f',
                      sound: 'http://x/y.mp3', clip: 'Open' });
  for (const k of ['target', 'prefab', 'item', 'text', 'at', 'vtag'])
    eq(got[k], 'NAMED', 'build 1402: ' + k + ' names something, so it interpolates');
  eq(got.sound, 'http://x/y.mp3', 'a URL does not');
  eq(got.clip, 'Open', '...and neither does a clip name, which is matched rather than computed');
  /* build 1408 added the command's scope as the seventh, and that it cost ONE list entry rather than a
     second edit in the dispatch is the whole return on this build. Counting the set's members would just
     be a number to bump; what matters is that every one of them goes through the interpolator. */
  {
    const fields = extractConst('_LG_NAME_FIELDS').match(/'([^']+)'/g).map(x => x.slice(1, -1));
    assert(fields.length >= 6 && fields.includes('target') && fields.includes('at'),
      'the name fields are stated once — build 1402 listed them in a comment and applied them by hand');
    const probe = {}; for (const f of fields) probe[f] = 'x';
    const out = scope(Object.assign({ verb: 'spawnprop' }, probe));
    for (const f of fields) eq(out[f], 'NAMED', 'every member of the set interpolates: ' + f);
  }
}

// ------------------------------------------------------- the editor stops contradicting the runtime ----
{
  assert(/\{k:'vtrack',l:'follows the player',chk:1,def:1,/.test(src),
    'the default lives in the table, where both the editor and the runtime can read it');
  assert(/inp\.checked=\(n\.p\[pm\.k\]!=null\)\?!!n\.p\[pm\.k\]:!!pm\.def;/.test(src),
    'and the node editor renders an unset box as the default the runtime will actually use');
}

// Measured after, live, 5/5:
//   every field the node offers reaches the handler, with the creator's value
//   a blank field arrives as its default rather than not at all
//   control: "damage all enemies" 31 -> 26 on both
//   "damage the enemies near a place": the one 2 m away 26 -> 6, the far one untouched
//   a graph-spawned pickup keeps once
//
// Two instrument faults first, both of which read exactly like the defect: `_lgPulse` takes a node ID and
// looks it up, so passing it a node OBJECT returns immediately; and the switch is on `n.type`, not `n.t`,
// so a node keyed the other way is found and then falls through every case. Neither throws. The positive
// control — the same verb with an audience that has always worked — is what separated them from a real null.
done('build 1407: the Do node hands the handler what the creator typed');
