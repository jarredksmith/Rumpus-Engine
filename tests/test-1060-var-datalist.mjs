// (build 1060) VARIABLE DROPDOWN — author: "add hud target variables as dropdown in the node
// signals? That would make it easier than trying to remember what all you name them." The logic
// editor already backed its event/tag/clip fields with <datalist>s; variables now get the same
// treatment, and the list is shared BOTH ways — it's fed by the graph's own setvar/addvar/branch
// nodes AND by the HUD widgets, and it's attached to the variable fields in both places. Type a
// name once (in a node or on a widget) and it's a click away everywhere else.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the collector, executed against a stubbed graph + widgets ----
const mk = new Function('logicGraph', 'hudWidgets',
  extractFunction('_lgVarOptions', src) + '\nreturn _lgVarOptions();');
const env = (g, w) => mk(g, w);
{
  const graph = { nodes: [
    { type: 'setvar', p: { name: 'score' } },
    { type: 'addvar', p: { name: 'combo' } },
    { type: 'branch', p: { a: 'score', b: '10' } },     // 'score' is a var, '10' is a literal
    { type: 'toast', p: { text: 'Wave {wave} · {score}' } },
    { type: 'interval', p: { sec: '2' } },              // no variables
    { type: 'repeat', p: { times: '3' } },              // #i is managed, never offered
  ] };
  const widgets = [
    { value: 'gameTimer', max: '100', when: 'started', label: 'HP {hp}' },
    { value: 'score', max: 'scoreMax', when: '', label: '' },   // dedupes with the graph's 'score'
  ];
  const vars = env(graph, widgets);
  eq(vars.join(','), 'combo,gameTimer,hp,score,scoreMax,started,wave',
    'names collect from both the graph and the widgets, sorted and de-duped');
  assert(!vars.includes('10') && !vars.includes('100'), 'numeric literals are never offered as variables');
  assert(!vars.includes('#i'), 'the repeat index #i is managed, not offered');
}
eq(env({ nodes: [] }, []).length, 0, 'an empty project offers nothing');
eq(env({ nodes: [{ type: 'setvar', p: { name: '' } }] }, []).length, 0, 'a blank name is ignored');
eq(env(undefined, undefined).length, 0, 'missing graph/widgets are safe');

// ---- the datalist is built and shared ----
assert(/const vl=mk\('lgVarList'\);/.test(src), 'a shared lgVarList datalist is created');
assert(/for\(const nm of _lgVarOptions\(\)\)\{ const op=document\.createElement\('option'\); op\.value=nm; vl\.appendChild\(op\); \}/.test(src),
  'it is populated from _lgVarOptions');

// ---- the fields that name/reference variables point at it ----
assert(/setvar:.*\{k:'name',l:'name',w:66,listId:'lgVarList'\}/.test(src), 'Set variable’s name field uses it');
assert(/addvar:.*\{k:'name',l:'name',w:66,listId:'lgVarList'\}/.test(src), 'Change variable’s name field uses it');
assert(/branch:.*\{k:'a',l:'A',w:56,listId:'lgVarList'\}.*\{k:'b',l:'B',w:56,listId:'lgVarList'\}/.test(src),
  'Branch’s A and B both use it');

// ---- typing a name anywhere refreshes the list live ----
assert(/if\(pm\.listId==='lgEvtList' \|\| pm\.listId==='lgVarList'\) _lgRefreshDatalists\(\);/.test(src),
  'editing a variable field in a node re-scans so the name appears in the others immediately');

// ---- the HUD widget editor shares the same dropdown, both directions ----
assert(/const inp=\(val,ph,wd,fn,listId\)=>\{[^]*if\(listId\) i\.setAttribute\('list', listId\);/.test(src),
  'the widget field helper accepts a datalist');
assert(/inp\(w\.value,'e\.g\. time',80, v=>\{ w\.value=v\.trim\(\)\.slice\(0,24\); \}, 'lgVarList'\)/.test(src),
  'the timer/bar value field offers the variables');
assert(/inp\(w\.max,'100 or a variable',90, v=>\{ w\.max=v\.trim\(\)\.slice\(0,24\); \}, 'lgVarList'\)/.test(src),
  'the bar max field offers them too');
assert(/inp\(w\.when,'always',70, v=>\{ w\.when=v\.trim\(\)\.slice\(0,24\); \}, 'lgVarList'\)/.test(src),
  'the show-when field offers them');
assert(/if\(typeof _lgRefreshDatalists==='function'\) try\{ _lgRefreshDatalists\(\); \}catch\(e\)\{\}   \/\/ build 1060: seed the variable dropdown from the graph/.test(src),
  'opening the HUD tab seeds the list from the graph');

done('build 1060: variable names are a dropdown in the logic nodes and the HUD widgets — no more remembering what you named them');
