// (build 1033) TAG & EVENT PICKERS — the Do-action node's tag field and the On event /
// Send event name fields are combo boxes: a dropdown of every tag props/lights already carry
// (with counts) and every logic event name declared anywhere, while typing a brand-new name
// still works (native datalist). The prop-signal editor's target + event fields share them.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the collectors ----
const glue = 'let logicGraph={nodes:[],wires:[]};\n'
  + 'let propModels=[]; let lightModels=[];\n'
  + extractFunction('_lgTagOptions', src) + '\n'
  + extractFunction('_lgEventOptions', src) + '\n';
const env = new Function(glue + `
  return {
    setProps:(l)=>{ propModels=l; }, setLights:(l)=>{ lightModels=l; }, setGraph:(g)=>{ logicGraph=g; },
    tags:_lgTagOptions, events:_lgEventOptions,
  };`)();
env.setProps([
  { userData:{ tag:'vaultDoor' } },
  { userData:{ tag:'vaultDoor' } },
  { userData:{ tag:'alarm' } },
  { userData:{} },
  null,
  { userData:{ signals:[{ do:'emit', text:'platePressed' }, { do:'open', target:'x' }] } },
]);
env.setLights([ { userData:{ tag:'roomLight' } } ]);
env.setGraph({ nodes:[
  { type:'event', p:{ name:'roundStart' } },
  { type:'emit', p:{ name:'platePressed' } },
  { type:'toast', p:{ name:'notAnEvent' } },
], wires:[] });
const tags = env.tags();
eq(tags.map(t=>t.tag).join(','), 'alarm,roomLight,vaultDoor', 'tags collected from props AND scene lights, sorted');
eq(tags.find(t=>t.tag==='vaultDoor').n, 2, 'counts how many carry each tag');
const evts = env.events();
eq(evts.join(','), 'platePressed,roundStart', 'event names from prop signals + graph nodes, deduped and sorted');

// ---- wiring ----
assert(/\{k:'target',l:'tag',w:80,listId:'lgTagList'\}/.test(src), 'the Do-action tag field opts into the tag list');
eq((src.match(/\{k:'name',l:'name',w:86,listId:'lgEvtList'\}/g)||[]).length, 2, 'On event AND Send event name fields opt into the event list');
assert(/if\(pm\.listId\) inp\.setAttribute\('list', pm\.listId\);/.test(src), 'the param builder wires the datalist');
assert(/if\(pm\.listId==='lgEvtList'\) _lgRefreshDatalists\(\);/.test(src), 'naming a new event refreshes the list immediately');
const rf = extractFunction('_lgRefreshDatalists', src);
assert(/op\.label=t\.n\+\(t\.n===1\?' prop':' props'\)/.test(rf), 'each tag option shows its prop count');
assert(/_lgRefreshDatalists\(\);/.test(extractFunction('_lgRender', src)), 'lists refresh whenever the canvas renders');
assert(/ti\.setAttribute\('list','lgTagList'\)/.test(src), "the prop-signal editor's target field shares the tag list");
assert(/ei\.setAttribute\('list','lgEvtList'\)/.test(src), '...and its event-name field shares the event list');

done('build 1033: tag + event dropdowns everywhere a name used to be typed blind');
