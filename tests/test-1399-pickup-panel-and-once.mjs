// build 1399 — two halves of one report about the pickup authoring surface:
//
//   1. "there's something going on with the pickup tab in gameplay. It doesn't show correctly unless you
//      click another dropdown tab and then go back to it. Even then it's a little finnicky."
//   2. "there needs to be an option from the node signals editor to make a pickup spawn only once."
//
// The first is build 1293's gate with a hole in it. That build stopped rendering the big global sections
// when none was on screen, and its own comment says the block is skipped "only when NONE of the SIX is on
// screen" — the list it checks has FIVE. The Pickups panel is BUILT INSIDE that block and was not in the
// list that decides whether the block runs, so opening the Pickups fold while the five listed ones happened
// to be collapsed skipped the whole thing. Toggling any other fold made one of the five visible, the block
// ran, and Pickups filled in. That is the reported workaround, exactly.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// -------------------------------------------- every host BUILT in the block is in its gate ----
// The defect is a set difference, so the guard is the set difference — not a list of names, which would
// drift the same way the original did.
{
  const fn = extractFunction('renderEditorFields');
  const gate = fn.match(/if\(worldHost && _edAnyOnScreen\(\[([^\]]*)\]\)\)\{/);
  assert(gate, 'the gate is findable');
  const listed = gate[1].split(',').map(s => s.trim()).filter(Boolean);
  eq(listed.length, 7, 'seven hosts are tested — the five build 1293 listed, plus Pickups and Cutscenes, ' +
    'which were built inside the block all along');
  for (const h of ['worldHost', 'enemyHost', 'gameHost', 'lootHost', 'crosshairHost', 'pickupsHost', 'cutsHost'])
    assert(listed.includes(h), h + ' is in the gate');

  // The two hosts that were out of step are each resolved EXACTLY ONCE in the whole file, so the gate and
  // the build cannot name different elements. (The first draft of this swept the rest of the function for
  // any `querySelector('#ed...')` and caught fourteen legitimate ones belonging to panels OUTSIDE the block
  // — an over-broad pin that would have failed on every unrelated future panel.)
  for (const id of ['#edPickups', '#edCutscenes'])
    eq((src.match(new RegExp("querySelector\\('" + id + "'\\)", 'g')) || []).length, 1,
      id + ' is queried in exactly one place — the gate site');

  assert(/const pkHost = pickupsHost \|\| gHost;/.test(fn), 'the pickup panel builds into the host the gate tested');
  assert(/const _cutHost=cutsHost;/.test(fn), '...and so does the cutscene panel');
}

// ------------------------------------------------------ the `once` option, executed ----
{
  // the handler pushes the flag onto the live pad
  const wa = extractFunction('_applyWorldAction');   /* `pickup` is a WORLD verb — _applySignalAction routes it onward */
  const _p0 = wa.indexOf("if(s.do==='pickup'){");
  assert(_p0 >= 0, 'the pickup branch is findable');
  const blk = wa.slice(_p0, wa.indexOf("if(s.do===", _p0 + 10));
  assert(/once:!!s\.once, ready:true, gone:false/.test(blk),
    'a spawned pad carries the authored flag, and starts available');

  // and build 1396's predicate is what decides — no second copy of the rule
  const once = new Function('POWERUP_KINDS', extractFunction('_puOnce') + '\nreturn _puOnce;')(
    { health: {}, shotgun: {}, item: {}, key_red: { key: 'red' } });
  eq(once({ kind: 'shotgun' }), false, 'a spawned shotgun pad comes back, as every spawned pad always has');
  eq(once({ kind: 'shotgun', once: true }), true, '...unless the creator ticked once');
  eq(once({ kind: 'key_red' }), true, 'a spawned KEY is one-shot by its kind, with no flag needed');
  eq(once({ kind: 'item' }), true, '...and so is an inventory item');
  eq((src.match(/function _puOnce\(/g) || []).length, 1,
    'the rule is written once — an authored spot (build 1396) and a spawned pad ask the same function, so ' +
    'they cannot come to different answers about the same kind');
}

// ------------------------------------------------------------------- both doors ----
{
  // the graph's Do node
  assert(/\{k:'once',l:'once',chk:1,ifv:\['verb','pickup'\]\}/.test(src),
    'the Do node offers it, only for the pickup verb');
  // the signal editor's own row (the surface the report names)
  assert(/chk\('once', s\.once, v=>\{ if\(v\) s\.once=1; else delete s\.once; \}\);/.test(src),
    'and so does the signal editor row');
  assert(/const chk=\(label,val,on\)=>\{/.test(src), '...through a checkbox helper beside its lab/sel/txt siblings');
  assert(/pushUndoSnapshot\(\); on\(e\.checked\);/.test(src), '...through undo, like every other signal field');
  assert(/if\(v\) s\.once=1; else delete s\.once;/.test(src),
    'unticking DELETES the key rather than storing false, so an untouched signal serializes exactly as before');
}

// Probed live (tools/probe/pickup-panel-once.mjs) in the real editor:
//
//   ONLY Pickups open   edPickups onScreen true, 71 nodes; the other six all off screen
//   DECISIVE            with only Pickups open, adding spots and re-rendering made the panel read
//                       "1 placed" then "3 placed" — it FOLLOWS the data
//   Cutscenes           the same shape, unreported, now covered
//   once OFF vs ON      predicate false/true · after taking, gone false/true
//                       20 s later, standing away: ordinary pad ready+visible (respawns 1),
//                       one-shot still not ready and not visible
//   spawned key         one-shot by kind with no flag set
//
// NODE COUNTS ALONE COULD NOT HAVE PROVEN THE PANEL HALF. With the block skipped the panel is not cleared
// either, so it keeps STALE content rather than going empty — which is what "a little finnicky" describes,
// and why the decisive check is whether the panel FOLLOWS a change rather than whether it has nodes in it.
//
// And the respawn row first read both pads as not-ready, which looked like the flag failing on both. The
// probe had spawned them at the player start and the ordinary pad was respawning under the player's feet
// and being instantly re-collected. Standing 300 m away made the control produce its positive.
done('build 1399: the pickup panel builds when it is the thing on screen, and a spawned pickup can be one-shot');
