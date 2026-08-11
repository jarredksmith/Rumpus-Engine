// build 1489 — the signal editor offered verbs it could not configure, and hid ten more
//
// The prop signal editor used ONE flag for two questions — "hide the target-tag box" and "show the parameter
// row" — and those differ. `view` (1404) and `marker` (1412) take no tag and DO have parameters, so they were
// offered, given a useless tag box, and given no way to say WHICH camera or WHICH place. And ten verbs the
// Logic graph has offered for builds were missing from the dropdown entirely, though SIG_KEYS serialized them
// and _applyWorldAction applied them.
//
// The interesting failure is in the TEST that was supposed to prevent it: `test-1406` pinned that the `view`
// row EXISTS and nothing pinned that it is ever rendered — build 1277's two-ends-of-a-wire defect inside the
// guard written against it.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

const setOf = (name) => new Set([...src.slice(src.indexOf('const ' + name),
    src.indexOf(']);', src.indexOf('const ' + name))).matchAll(/'([a-z]+)'/g)].map(m => m[1]));
const TAGGED = setOf('_SIG_TAG_VERBS');
const ROWED  = setOf('_SIG_ROW_VERBS');

// ---------------------------------------------------------------- the two questions, executed
{
  const fn = new Function(
    src.slice(src.indexOf('const _SIG_TAG_VERBS'), src.indexOf('function _sigNeedsRow')) +
    'function _sigNeedsRow(v){ return _SIG_ROW_VERBS.has(v); }' +
    'return { tag:_sigTakesTag, row:_sigNeedsRow };')();

  eq(fn.tag('toggle'), true,  'a verb that drives a tagged prop shows the tag box');
  eq(fn.row('toggle'), false, '...and has nothing else to configure');

  eq(fn.tag('view'), false, 'the camera acts on no tagged prop...');
  eq(fn.row('view'), true,  '...and DOES need a row — the pair this build exists to separate');
  eq(fn.tag('marker'), false, 'and so does the objective marker');
  eq(fn.row('marker'), true,  '...');

  // the case the single flag could not express at all
  eq(fn.tag('moveprop'), true, 'moving props needs a TAG...');
  eq(fn.row('moveprop'), true, '...AND a place — both true at once, which one boolean cannot say');
  eq(fn.tag('pushprop'), true, 'and pushing needs both too');
  eq(fn.row('pushprop'), true, '...');

  eq(fn.tag('spawn'), false, 'a pure world verb shows no tag box (build 1074 intact)');
  eq(fn.row('spawn'), true,  '...and keeps its row');
  eq(fn.tag('emit'), false, 'and a verb with neither gets neither');
  eq(fn.row('emit'), false, '...');
}

// the render asks them SEPARATELY — one `if` each, never the same expression twice
{
  assert(/if\(_sigTakesTag\(s\.do\)\) r\.appendChild\(ti\);/.test(src), 'the tag box asks the tag question');
  assert(/if\(_sigNeedsRow\(s\.do\)\) sgBody\.appendChild\(_sigWorldRow\(s, rerender\)\);/.test(src),
    'and the row asks the row question');
  assert(!/if\(_isWorldVerb\(s\.do\)\)/.test(src),
    'neither is still asking the conflated one — that flag WAS the bug');
}

// ---------------------------------------------------------------- every offered verb is configurable
{
  const end = src.search(/\]\s*,\s*\n?\s*s\.do, v=>\{ s\.do=v; \}/);
  assert(end > 0, 'found the signal verb dropdown');
  const dd = src.slice(src.lastIndexOf('mkSel([', end), end);
  const offered = [...dd.matchAll(/\['([a-z]+)',/g)].map(m => m[1]);
  assert(offered.length >= 33, 'the dropdown offers the full set (' + offered.length + ')');

  const NOTHING = new Set(['win','checkpoint','cutscene','objective','sound','emit']);
  for(const v of offered)
    assert(TAGGED.has(v) || ROWED.has(v) || NOTHING.has(v), 'configurable somehow: ' + v);

  // ...and the ROW verbs really have a branch, which is what 1406 pinned and nothing rendered
  const row = extractFunction('_sigWorldRow', src);
  for(const v of ROWED)
    assert(new RegExp("s\\.do==='" + v + "'").test(row), 'a real branch renders it: ' + v);
}

// ---------------------------------------------------------------- the dropdown matches the graph
{
  const i = src.indexOf("do:       { t:'Do action'");
  const dn = src.slice(i, src.indexOf(']},{k:', i));
  const graph = [...dn.matchAll(/\['([a-z]+)',/g)].map(m => m[1]);
  const end = src.search(/\]\s*,\s*\n?\s*s\.do, v=>\{ s\.do=v; \}/);
  const offered = [...src.slice(src.lastIndexOf('mkSel([', end), end).matchAll(/\['([a-z]+)',/g)].map(m => m[1]);

  const missing = graph.filter(g => !offered.includes(g));
  eq(missing.length, 0, 'a prop signal can do everything the graph can: missing ' + JSON.stringify(missing));
  // the ten this build added, named so a future removal is loud
  for(const v of ['marker','modal','showprop','hideprop','moveprop','delprop','resetprop','pushprop','spawnprop','setpropvar'])
    assert(offered.includes(v), 'the dropdown offers ' + v);
}

// ---------------------------------------------------------------- the runtime is not the editor
{
  const apply = extractFunction('_applyWorldAction', src);
  assert(!/\bsel\(\[|\blab\(|\btxt\(|document\.createElement/.test(apply),
    "the RUNTIME builds no DOM. The first draft of this build anchored on a phrase that lives in BOTH functions and injected editor UI here, where a modal signal would have thrown on its first fire — a phrase anchor is only as good as that phrase is unique");
  const row = extractFunction('_sigWorldRow', src);
  assert(!/_wactSend|_lgPropVerb|applyImpulse/.test(row), '...and the editor applies nothing');
}

// every verb the dropdown offers is one the runtime can actually perform
{
  const apply = extractFunction('_applyWorldAction', src);
  const tagv = extractFunction('_lgPropVerb', src);
  const end = src.search(/\]\s*,\s*\n?\s*s\.do, v=>\{ s\.do=v; \}/);
  const offered = [...src.slice(src.lastIndexOf('mkSel([', end), end).matchAll(/\['([a-z]+)',/g)].map(m => m[1]);
  const handled = src.slice(src.indexOf('function _applySignalAction'));
  for(const v of offered){
    const seen = apply.includes("'" + v + "'") || tagv.includes("'" + v + "'")
              || handled.slice(0, 3000).includes("'" + v + "'") || src.includes("s.do==='" + v + "'");
    assert(seen, 'the runtime can perform ' + v + ' — an offered verb that does nothing is build 1277s defect');
  }
}

done();
