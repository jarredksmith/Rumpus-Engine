// build 1472 — the Level Check knows about modals, in both directions.
//
// Build 1468 refuses a modal that opens onto nothing and reports it through the run-time channel — which a
// creator sees only AFTER playing, and only if they happen to trip that branch. Both mistakes a modal
// invites are visible STATICALLY, before publishing:
//
//   - a modal a creator built and NOTHING can open is authored content that can never appear;
//   - a verb that opens a name NO WIDGET carries is a dimmed screen with nothing in it.
//
// And `mid` joins the interpolating fields, which is build 1402's own rule ("every field that NAMES
// something") applied to the field build 1468 added and did not include.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the name computes (1402's rule)
{
  const F = extractConst('_LG_NAME_FIELDS', src);
  assert(/'mid'/.test(F), 'the modal name interpolates from the Do node — `modal show booth{n}`');
  for (const k of ['target', 'prefab', 'item', 'text', 'at', 'vtag', 'escope'])
    assert(new RegExp("'" + k + "'").test(F), 'and build 1402\'s own members are untouched: ' + k);

  // the SIGNAL path resolves its own fields and does not go through _lgDoArgs, so it needs asking too
  const b = src.slice(src.indexOf("  if(s.do==='modal'){"), src.indexOf("  if(s.do==='modal'){") + 900);
  assert(/_lgName\(s\.mid\)/.test(b), 'a prop signal interpolates it as well, or the two doors disagree');
  assert(/typeof _lgName==='function'/.test(b), '...guarded, like every other call into it');
}

// ---------------------------------------------------------------- 2. both directions, executed
// levelIssues is one long function with a lot of dependencies; drive the modal block itself with the real
// source rather than a copy, so a future edit to it fails here.
{
  const block = (() => {
    const a = src.indexOf("    if(typeof hudWidgets!=='undefined' && Array.isArray(hudWidgets)){\n      const built=new Map();");
    assert(a > 0, 'the modal check is in levelIssues');
    const b = src.indexOf('// build 1166: a Sketchfab model', a);
    assert(b > a, '...and ends before build 1166\'s attribution check');
    return src.slice(a, b);
  })();

  const run = (widgets, nodes, signals) => {
    const issues = [], found = [];
    new Function('issues', 'hudWidgets', 'logicGraph', 'propModels', '_issueAt', block)(
      issues, widgets,
      { nodes },
      (signals || []).map((sg, i) => ({ userData: { signals: sg, _i: i } })),
      (msg, fn) => { found.push(msg); return msg; });
    return { issues, found };
  };
  const W = (modal) => ({ id: 'w' + modal, kind: 'text', modal });
  const NODE = (mid, mmode) => ({ type: 'do', p: { verb: 'modal', mmode: mmode || 'show', mid } });

  // -- a modal nobody opens
  let r = run([W('fairShop'), W('fairShop'), W('')], [], []);
  eq(r.issues.length, 1, 'a modal with widgets and no opener is reported');
  assert(/fairShop/.test(r.issues[0]), '...by name');
  assert(/2 widgets/.test(r.issues[0]), '...with how many widgets are stranded');
  assert(/can never appear/.test(r.issues[0]), '...and what that means');
  assert(/clear the "in modal" field/.test(r.issues[0]), '...and both ways out');
  eq(r.found.length, 0, '...as a PLAIN row: a modal is not a prop, so there is nowhere to send you (build 1300)');

  // -- the control: the same widgets, with something that opens them
  r = run([W('fairShop'), W('fairShop')], [NODE('fairShop')], []);
  eq(r.issues.length, 0, 'THE CONTROL: an opened modal is silent');
  r = run([W('fairShop')], [], [[{ do: 'modal', mmode: 'show', mid: 'fairShop' }]]);
  eq(r.issues.length, 0, '...and a PROP SIGNAL counts as an opener just as much as a graph node');

  // -- a CLOSE is not an opener
  r = run([W('fairShop')], [NODE('', 'hide')], []);
  eq(r.issues.length, 1, 'a "close" node does not count as opening it — closing a menu nobody opens is nothing');

  // -- a verb that opens nothing
  r = run([W('other')], [NODE('typo')], []);
  eq(r.issues.length, 2, 'both directions fire at once: `other` is unopened AND `typo` is empty');
  assert(r.issues.some(m => /typo/.test(m) && /dim the screen with nothing on it/.test(m)),
    '...and the empty one names what the player would actually see');
  eq(r.found.length, 0, 'a GRAPH node has nowhere to send you, so that row stays plain');

  // -- ...but a SIGNAL does have somewhere to send you
  r = run([], [], [[{ do: 'modal', mmode: 'show', mid: 'ghost' }]]);
  eq(r.issues.length, 1);
  eq(r.found.length, 1, 'a signal opening an empty modal is CLICKABLE — the prop carrying it is the thing to fix');

  // -- a computed name makes NEITHER direction decidable, and saying nothing beats guessing
  r = run([W('booth1'), W('booth2')], [NODE('booth{n}')], []);
  eq(r.issues.length, 0,
    'a name carrying `{` is resolved at run time, so an unopened modal cannot be proven unopened — and a ' +
    'wrong warning about content that works is worse than no warning');
  r = run([W('booth1')], [NODE('booth{n}'), NODE('realTypo')], []);
  eq(r.issues.filter(m => /can never appear/.test(m)).length, 0, '...the unopened direction stays quiet...');
  assert(r.issues.some(m => /realTypo/.test(m)),
    '...while a LITERAL name with no widgets is still reported, because that direction IS decidable');

  // -- nothing authored, nothing said
  eq(run([], [], []).issues.length, 0, 'a level with no modals is silent');
  eq(run([W(''), W('')], [], []).issues.length, 0, '...and so is one whose widgets are all plain HUD widgets');
  eq(run(null, [], []).issues.length, 0, 'a level with no widgets array at all does not throw');
}

// ---------------------------------------------------------------- 3. the panel renders it as prose
{
  // build 1423: these rows are set with textContent, and level-authored strings reach them
  assert(/d\.textContent=msg;/.test(extractFunction('renderLevelIssues', src)),
    'the panel sets text, not markup — a modal NAME is level data');
  const block = src.slice(src.indexOf("      const built=new Map();"), src.indexOf('// build 1166: a Sketchfab model'));
  assert(!/<[a-z]+>/.test(block), '...so these messages carry no markup of their own');
}

done('build 1472: THE LEVEL CHECK KNOWS ABOUT MODALS, in both directions. Build 1468 refuses a modal that opens onto nothing and reports it through the run-time channel — which a creator sees only AFTER playing, and only if they happen to trip that branch. Both mistakes a modal invites are decidable statically, before publishing: a modal a creator built that NOTHING can open is authored content that can never appear, and a verb that opens a name NO WIDGET carries is a dimmed screen with nothing in it. Both are executed here against the real block rather than a copy, with the opened case as the control in each direction, and a prop signal counts as an opener exactly as much as a graph node does. A CLOSE is deliberately not an opener. The clickable/plain split follows build 1300\'s rule rather than being uniform: a signal opening an empty modal takes you to the prop that carries it, and a graph node has nowhere to send you, so that row stays plain — a row that looks clickable and is not is the dead click build 1147 removed. And a name carrying `{` silences the UNOPENED direction entirely, because `mid` now interpolates: that is build 1402\'s own rule ("every field that NAMES something") applied to the field build 1468 added and did not include, so a fair with five booths can say `modal show booth{n}` instead of five branches — at which point the check cannot know what it resolves to, and a wrong warning about content that works is worse than no warning. The DECIDABLE direction still fires beside it');
