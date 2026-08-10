// build 1487 — a control that fires an event nobody hears
//
// Build 1402 gave the `emit` verb exactly this report and named the three it did not cover: a HUD button, a
// trigger zone, an action bind. Those three are the ones a player can PRESS, WALK INTO and TRIGGER, and a
// dead one is silent — the "nothing happened" builds 1147, 1484 and 1486 exist to remove.
//
// Executed against the REAL `levelIssues` with the REAL `_lgEventHeard`, because the whole value is that the
// panel and build 1402's run-time report cannot come to different answers about the same name.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- run the real check in a stub world
const run = (over) => {
  const st = Object.assign({ widgets:[], triggers:[], actions:[], nodes:[] }, over);
  const scope = {
    hudWidgets: st.widgets,
    triggerZones: st.triggers,
    actionBinds: st.actions,
    logicGraph: { nodes: st.nodes, wires: [] },
    propModels: [], colliders: [], lights: [], zones: [],
  };
  const body = [
    extractFunction('_lgEventHeard', src),
    'const issues = [];',
    'const _issueAt = (m) => m;',
    st.block,
    'return issues;',
  ].join('\n');
  const keys = Object.keys(scope);
  return new Function(...keys, body)(...keys.map(k => scope[k]));
};

/* the shipped block, lifted out of `levelIssues` rather than restated — a rig that restates the code under
   test keeps passing against a stale copy (this file's recorded rule) */
const li = extractFunction('levelIssues', src);
const a = li.indexOf('build 1487');
assert(a > 0, 'the block is in levelIssues');
const start = li.indexOf('{', li.indexOf('*/', a));
let d = 0, end = -1;
for(let i = start; i < li.length; i++){
  if(li[i] === '{') d++;
  else if(li[i] === '}'){ d--; if(!d){ end = i + 1; break; } }
}
assert(end > start, 'the block brace-matches');
const BLOCK = li.slice(start, end);

const go = (over) => run(Object.assign({ block: BLOCK }, over));

// ---------------------------------------------------------------- the three controls, one at a time
{
  const r = go({ widgets:[{ kind:'button', label:'Buy a prize', event:'buy' }] });
  eq(r.length, 1, 'a HUD button whose event nothing listens for is REPORTED');
  assert(/HUD button/.test(r[0]) && /Buy a prize/.test(r[0]),
    '...naming the control, so the creator knows which one');
  assert(/“buy”/.test(r[0]), '...and the event name');
  assert(/On event/.test(r[0]) && /logic graph/.test(r[0]),
    '...and the fix, rather than only the fact (build 1423s rule)');
}
eq(go({ triggers:[{ ev:'stepped' }] }).length, 1, 'a trigger zone likewise');
assert(/trigger zone/.test(go({ triggers:[{ ev:'stepped' }] })[0]), '...named as a trigger zone');
eq(go({ actions:[{ event:'wave' }] }).length, 1, 'an action bind likewise');
assert(/action bind/.test(go({ actions:[{ event:'wave' }] })[0]), '...named as an action bind');

// ---------------------------------------------------------------- the CONTROL: a wired event is silent
{
  eq(go({ widgets:[{ kind:'button', label:'Buy', event:'buy' }],
          nodes:[{ type:'event', p:{ name:'buy' } }] }).length, 0,
     'a button whose event IS listened for reports NOTHING — a panel that always complains is not read');
  eq(go({ triggers:[{ ev:'stepped' }], nodes:[{ type:'event', p:{ name:'stepped' } }] }).length, 0,
     'and so does a wired trigger');
  eq(go({ actions:[{ event:'wave' }], nodes:[{ type:'event', p:{ name:'wave' } }] }).length, 0,
     'and a wired action bind');
  // a DIFFERENT listener is not a listener
  eq(go({ widgets:[{ kind:'button', event:'buy' }], nodes:[{ type:'event', p:{ name:'sell' } }] }).length, 1,
     'a listener for a different name does not count');
  // and a node of a different type carrying the same name is not a listener either
  eq(go({ widgets:[{ kind:'button', event:'buy' }], nodes:[{ type:'do', p:{ name:'buy' } }] }).length, 1,
     'nor a node that merely carries the name');
}

// ---------------------------------------------------------------- blanks are deliberately not reported
{
  eq(go({ widgets:[{ kind:'button', label:'x', event:'' }] }).length, 0,
     'a BLANK event is not reported: all three sites guard on truthiness, so it fires nothing rather than firing into the void');
  eq(go({ widgets:[{ kind:'button', label:'x' }] }).length, 0, 'and neither is a missing one');
  eq(go({ triggers:[{ ev:'   ' }] }).length, 0, 'whitespace is blank');
  eq(go({ widgets:[{ kind:'text', event:'buy' }] }).length, 0,
     'only a BUTTON fires — an event field on a text widget is inert and must not be reported');
}

// ---------------------------------------------------------------- one row per NAME, not per control
{
  const r = go({ widgets:[{ kind:'button', label:'A', event:'buy' }, { kind:'button', label:'B', event:'buy' }],
                 triggers:[{ ev:'buy' }] });
  eq(r.length, 1, 'three controls firing ONE dead event is one row, not three');
  assert(/A/.test(r[0]) && /B/.test(r[0]) && /trigger zone/.test(r[0]), '...listing what fires it');
  assert(/ fire /.test(r[0]), '...and reading as a plural');
}
{
  const one = go({ widgets:[{ kind:'button', label:'A', event:'buy' }] })[0];
  assert(/ fires /.test(one), 'a single control reads as a singular');
}

// hostile / huge levels stay bounded
{
  const many = [];
  for(let i = 0; i < 30; i++) many.push({ kind:'button', label:'b'+i, event:'ev'+i });
  const r = go({ widgets:many });
  eq(r.length, 7, 'capped at six rows plus a summary — the panel must stay readable');
  assert(/and 24 more/.test(r[6]), '...and the summary counts the rest');
}
{
  const many = [];
  for(let i = 0; i < 12; i++) many.push({ kind:'button', label:'b'+i, event:'same' });
  const r = go({ widgets:many });
  eq(r.length, 1, 'twelve controls on one dead name is still one row');
  eq((r[0].match(/“b\d/g) || []).length, 4, '...listing at most four of them');
}

// ---------------------------------------------------------------- it asks 1402's predicate, not a copy
{
  assert(/_lgEventHeard\(nm\)/.test(BLOCK),
    'the panel asks the SAME predicate the emit verb asks at run time, so they cannot disagree');
  assert(!/logicGraph/.test(BLOCK.replace(/_lgEventHeard/g, '')),
    '...and holds no second copy of "does anything listen"');
  const emit = extractFunction('_lgEmit', src);
  assert(/_lgEventHeard\(nm\)/.test(emit), 'and build 1402s run-time report still asks it too');
}

// a missing graph is fail-SAFE: report nothing rather than flood the panel
{
  const noGraph = new Function('hudWidgets', 'triggerZones', 'actionBinds',
    extractFunction('_lgEventHeard', src) + '\nconst issues=[]; const _issueAt=(m)=>m;\n' + BLOCK + '\nreturn issues;');
  eq(noGraph([{ kind:'button', event:'buy' }], [], []).length, 0,
     'with no logicGraph at all the check stays quiet — an engine without one is not a broken level');
}

// ---------------------------------------------------------------- the rows are plain, never clickable
{
  assert(!/_issueAt/.test(BLOCK),
    'a HUD button and a trigger zone are not props, so these rows have nowhere to send you and must not look clickable (1300/1423)');
}

done();
