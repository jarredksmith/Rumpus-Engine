// (build 1034) EDITOR QUALITY PASS — four author requests:
//  1) Do-action clip + sound fields are dropdowns (every clip placed models carry; every sound
//     URL the level uses anywhere), same combo pattern as tags/events.
//  2) Prefabs no longer trail every TARGET tab — like Material, the section shows only while
//     the Props target is active.
//  3) The prop Tag leads Object & selection AND stays in Signals — same userData.tag, so either
//     field updates the other (both funnel through renderEditorFields).
//  4) Ctrl+Shift+C collapses every editor section, through the real fold handlers so the state
//     persists exactly like manual clicks.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the clip + sound collectors ----
const glue = 'let propModels=[]; let audioZones=[]; const localStorage={ getItem:(k)=>HOOK.store[k]||null };\n'
  + extractFunction('_lgClipOptions', src) + '\n' + extractFunction('_lgSoundOptions', src) + '\n';
const world = { store:{} };
const env = new Function('HOOK', glue + `
  return { setProps:(l)=>{ propModels=l; }, setZones:(l)=>{ audioZones=l; }, clips:_lgClipOptions, sounds:_lgSoundOptions };`)(world);
env.setProps([
  { userData:{ animClipNames:['DoorOpen','DoorClose'] } },
  { userData:{ animClipNames:['DoorOpen','Spin'] } },
  { userData:{ signals:[{ do:'sound', sound:'https://h/klaxon.mp3' }] } },
  { userData:{} }, null,
]);
env.setZones([ { url:'https://h/wind.ogg' }, { url:'' } ]);
world.store['breach_audio'] = JSON.stringify({ sfx:{ explode:'https://h/boom.wav', coin:'' }, music:{ url:'https://h/theme.mp3' } });
eq(env.clips().join(','), 'DoorClose,DoorOpen,Spin', 'clip names union across placed models, deduped + sorted');
eq(env.sounds().join(','), 'https://h/boom.wav,https://h/klaxon.mp3,https://h/theme.mp3,https://h/wind.ogg',
  'sounds union signal clips + audio zones + custom SFX/music overrides');

// ---- dropdown wiring ----
assert(/\{k:'clip',l:'clip',w:80,ifv:\['verb','anim'\],listId:'lgClipList'\}/.test(src), 'the Do-action clip field opts in');
assert(/\{k:'sound',l:'url',w:96,ifv:\['verb','sound'\],listId:'lgSndList'\}/.test(src), 'the Do-action sound field opts in');
const rf = extractFunction('_lgRefreshDatalists', src);
assert(/mk\('lgClipList'\)/.test(rf) && /mk\('lgSndList'\)/.test(rf), 'both datalists are filled with the rest');

// ---- prefab section scoped to the Props target ----
const pf = extractFunction('renderPrefabsPanel', src);
assert(/const pfOn=\(typeof editorActive==='undefined' \|\| editorActive==='props'\) && \(MODE_SECTIONS\[editorMode\]\|\|\[\]\)\.indexOf\('prefabs'\)>=0;/.test(pf),
  'prefabs show only for the Props target in an owning mode (the Material pattern)');
assert(/if\(pfSec\) pfSec\.style\.display = pfOn \? '' : 'none';/.test(pf) && /if\(!pfOn\) return;/.test(pf),
  '...hiding the whole section and skipping the render otherwise');
assert(/if\(typeof renderPrefabsPanel==='function'\) renderPrefabsPanel\(\);\s+\/\/ build 1034/.test(src),
  'renderEditorFields refreshes it per target/selection (Update/Detach follow the live selection)');

// ---- the tag field: top of Object & selection, synced with Signals ----
assert(/'<div id="edPropTag"><\/div>'\s*\+ '<div id="edPicker"><\/div>'/.test(src), 'the tag host is the FIRST thing in Object & selection');
assert(/object:\['edPropTag','edShapes'/.test(src), 'contextual visibility covers it');
assert(/tin\.setAttribute\('list','lgTagList'\)/.test(src), 'the top field gets the tag dropdown too');
assert(/if\(v\) tagObj\.userData\.tag=v; else delete tagObj\.userData\.tag;[^\n]*renderEditorFields\(\);/.test(src),
  'the top field writes userData.tag and re-renders (updates the Signals copy)');
assert(/if\(v\) store\.tag=v; else delete store\.tag; if\(typeof renderEditorFields==='function'\) renderEditorFields\(\);/.test(src),
  'the Signals copy re-renders too (updates the top field) — one tag, two views');

// ---- collapse-all ----
const ca = extractFunction('edCollapseAll', src);
assert(/if\(!sx\.classList\.contains\('collapsed'\)\)\{ const h=sx\.querySelector\('\.edSecHead'\); if\(h\)\{ h\.click\(\); n\+\+; \} \}/.test(ca),
  'collapse-all CLICKS each open fold — persistence stays canonical with manual folding');
assert(/e\.shiftKey && e\.code==='KeyC' && !e\.repeat\)\{ e\.preventDefault\(\); if\(typeof edCollapseAll==='function'\) edCollapseAll\(\); return; \}/.test(src),
  'Ctrl+Shift+C triggers it (plain Ctrl+C copy untouched)');

done('build 1034: clip/sound dropdowns, prefab section scoped, tag field promoted + synced, collapse-all shortcut');
