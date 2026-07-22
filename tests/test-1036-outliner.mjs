// (build 1036) SCENE OUTLINER — the whole placed scene as one searchable panel (O / toolbar
// list button): props, lights, enemy spawns, turrets, pickups. Props file into FOLDERS
// (serialized), the eye hides an object while editing only, the padlock makes it unclickable
// in the viewport, type/folder headers select everything they contain, search + tag dropdown
// filter, double-click renames props and lights (serialized).
import { readFileSync } from 'node:fs';
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- executable: display names (rename > NPC name > primitive kind > file stem) ----
const nameFn = new Function('isPrimitive', extractFunction('_outName', src) + '\nreturn _outName;');
{
  const nm = nameFn((s)=>s==='box');
  eq(nm({ userData:{ name:'My Door', src:'box' } }), 'My Door', 'an authored name wins');
  eq(nm({ userData:{ npcName:'Bob', src:'x.glb' } }), 'Bob', 'an NPC name is next');
  eq(nm({ userData:{ src:'box' } }), 'box', 'primitives read as their shape');
  eq(nm({ userData:{ src:'https://x.y/models/Old%20Crate.glb?dl=1' } }), 'Old Crate', 'GLB props read as their decoded file stem');
  eq(nm({ userData:{} }), 'prop', 'nothing known -> generic');
}

// ---- executable: the search + tag filter ----
{
  const env = new Function(
    "let _outSearch='', _outTag='';\n" + extractFunction('_outMatch', src)
    + "\nreturn { set:(s,t)=>{ _outSearch=s; _outTag=t; }, m:_outMatch };")();
  env.set('', '');
  assert(env.m('crate', '', ''), 'no filter matches everything');
  env.set('CRA', '');
  assert(env.m('Old Crate', '', '') && !env.m('door', '', ''), 'search is case-insensitive on the name');
  assert(env.m('thing', 'crateTag', ''), '...and matches tags');
  assert(env.m('thing', '', 'Crates'), '...and folder names');
  env.set('crate', 'door1');
  assert(!env.m('Old Crate', 'other', ''), 'the tag dropdown gates even a search hit');
  assert(env.m('Old Crate', 'door1', ''), '...and passes the matching tag');
}

// ---- executable: select-all-of-a-type drives the real selection state ----
{
  const env = new Function(
    "let selProps=['x'], selLights=['y'], selSpawns=[], selTurrets=[], selPickup=7, editorActive='';\n"
    + "const propModels=[{id:0},{id:1},{id:2}], lightModels=[], spawnMarkers=[], turretModels=[];\n"
    + "const editorTargets={ props:{idx:-1}, lights:{idx:-1}, spawns:{idx:-1}, turrets:{idx:-1} };\n"
    + extractFunction('_outSelectAll', src)
    + "\nreturn { run:_outSelectAll, props:propModels, get:()=>({ selProps, selLights, selPickup, editorActive, idx:editorTargets.props.idx }) };")();
  env.run('props', [env.props[0], env.props[2]]);
  const st = env.get();
  eq(st.selProps.length, 2, 'select-all selects every object handed to it');
  eq(st.selLights.length, 0, '...clearing the other type selections');
  eq(st.selPickup, -1, '...and any grabbed pickup');
  eq(st.editorActive, 'props', 'the editor jumps to the type');
  eq(st.idx, 2, 'the primary is the last selected');
}

// ---- executable: the eye clears the flag holder's selection and editor visibility ----
{
  const env = new Function(
    "let selProps=[], selLights=[], selSpawns=[], selTurrets=[], _levelDirty=false;\n"
    + extractFunction('_outDeselect', src) + '\n' + extractFunction('_outSetHide', src) + '\n' + extractFunction('_outSetLock', src)
    + "\nreturn { hide:_outSetHide, lock:_outSetLock, sel:(o)=>selProps.push(o), get:()=>({ selProps, _levelDirty }) };")();
  const o = { userData:{}, visible:true };
  env.sel(o);
  env.hide(o, true);
  assert(o.userData.edHide===true && o.visible===false, 'hide sets the flag and turns the object off');
  eq(env.get().selProps.length, 0, '...and drops it from the selection');
  assert(env.get()._levelDirty===true, '...and marks the level dirty (it serializes)');
  env.hide(o, false);
  assert(!('edHide' in o.userData) && o.visible===true, 'show deletes the flag and restores visibility');
  env.lock(o, true);
  assert(o.userData.edLock===true, 'lock sets its flag');
  env.lock(o, false);
  assert(!('edLock' in o.userData), 'unlock deletes it');
}

// ---- serialization: name / folder / hide / lock ride the level ----
assert(/if\(o\.userData\.name\) e\.nm=String\(o\.userData\.name\)\.slice\(0,60\); if\(o\.userData\.folder\) e\.fld=String\(o\.userData\.folder\)\.slice\(0,40\); if\(o\.userData\.edHide\) e\.eh=1; if\(o\.userData\.edLock\) e\.elk=1;/.test(src),
  'propEntry stores nm/fld/eh/elk');
eq(src.split('if(p.nm) obj.userData.name=String(p.nm).slice(0,60); if(p.fld) obj.userData.folder=String(p.fld).slice(0,40); if(p.eh) obj.userData.edHide=true; if(p.elk) obj.userData.edLock=true;').length - 1, 4,
  'restored at all four prop entry-apply sites (boot / net / restore / prefab spawn)');
assert(/if\(g\.userData\.name\) o\.nm=String\(g\.userData\.name\)\.slice\(0,60\); if\(g\.userData\.edHide\) o\.eh=1; if\(g\.userData\.edLock\) o\.elk=1;/.test(src),
  'lights serialize name/hide/lock too');
assert(/if\(opts\.nm\) g\.userData\.name=String\(opts\.nm\)\.slice\(0,60\); if\(opts\.eh\) g\.userData\.edHide=true; if\(opts\.elk\) g\.userData\.edLock=true;/.test(src),
  '...and buildLight restores them');

// ---- locked / hidden objects dodge viewport picking ----
assert(/for\(const p of propModels\)\{ if\(p && !\(p\.userData && \(p\.userData\.edLock \|\| p\.userData\.edHide\)\)\) targets\.push\(p\); \}/.test(src),
  'locked/hidden props are not click targets');
assert(/if\(g\.userData\.marker && g\.visible && !g\.userData\.edLock\) targets\.push\(g\.userData\.marker\);/.test(src), 'locked/hidden lights are not click targets');
assert(/for\(const g of spawnMarkers\)\{ if\(g\.visible && !g\.userData\.edLock\) targets\.push\(g\); \}/.test(src), 'locked spawns are not click targets');
assert(/if\(!p \|\| \(p\.userData && \(p\.userData\.edLock \|\| p\.userData\.edHide\)\)\) continue; _marqueeV/.test(src), 'the marquee skips them too');

// ---- editing-only visibility: everything plays visible ----
assert(/function _outOnEditorClose\(\)\{/.test(src) && /if\(o && o\.userData && o\.userData\.edHide\) o\.visible=true;/.test(extractFunction('_outOnEditorClose', src)),
  'closing the editor re-shows everything the outliner hid');
eq((src.match(/if\(typeof _outOnEditorClose==='function'\) _outOnEditorClose\(\);/g)||[]).length, 4,
  '...on all four editor-close paths (toggle / deploy / menu / end)');
assert(/if\(o && o\.userData && o\.userData\.edHide\) o\.visible=false;/.test(extractFunction('_outOnEditorOpen', src)),
  'opening the editor re-applies the hides');

// ---- panel wiring: toolbar button, O key, palette, refresh hook ----
assert(/mk\('tbOut', I\.list, 'Outliner \\u2014 the whole scene as a list: search, folders, hide, lock \(O\)'\)/.test(src), 'the toolbar grows a list button');
assert(/e\.code==='KeyO' && !e\.ctrlKey && !e\.metaKey && !e\.altKey && !e\.shiftKey/.test(src) && /if\(typeof _outToggle==='function'\) _outToggle\(\); keys\['KeyO'\]=false;/.test(src),
  'O toggles it (guarded so typing O in a field does not)');
assert(/A\('Toggle Outliner','scene hierarchy list tree folders o'/.test(src), 'the command palette knows it');
assert(/if\(typeof _outQueueRefresh==='function'\) _outQueueRefresh\(\);/.test(src), 'renderEditorFields keeps the panel in step');
assert(/localStorage\.getItem\('breach_outliner_on'\)/.test(src) && /breach_outliner_folds/.test(src), 'open state + fold state persist (breach_ keys)');

// ---- the panel itself: folders, select-all, rename, tag filter ----
assert(/_outFolds\['f:'\+fname\]/.test(src) && /_outMoveSel\(v==='::root' \? '' : v\.slice\(4\)\);/.test(src), 'folders: fold state + the move-selection dropdown');
assert(/'\+ new folder…'/.test(src) || /'\+ new folder\\u2026'/.test(src), '...including creating a new folder inline');
assert(/'Select every '\+label\.toLowerCase\(\)\+' shown \(locked ones stay put\)'/.test(src), 'type headers select all of that type');
assert(/'Select the folder contents'/.test(src), 'folder headers select their contents');
assert(/function _outRenameEl\(/.test(src) && /o\.userData\.name=v\.slice\(0,60\);/.test(src), 'double-click rename writes the serialized name');
assert(/_lgTagOptions==='function'/.test(extractFunction('_outRefresh', src)), 'the tag dropdown reuses the live tag collector');
assert(/\[\['props','Props'\],\['lights','Lights'\],\['spawns','Enemy spawns'\],\['turrets','Turrets'\],\['pickups','Pickups'\]\]/.test(src),
  'all five scene collections are listed');

// ---- CSS + docs ----
assert(/#outliner \{ position:fixed;/.test(html), 'the panel has its fixed-position style');
assert(/body:has\(#editor\.dockLeft\) #outliner \{ left:auto;/.test(html), '...and flips sides with a left-docked editor');
assert(/Outliner \(scene hierarchy\)/.test(manual) && /<kbd>O<\/kbd>/.test(manual), 'the field manual documents the outliner and its key');

done('build 1036: the scene is a searchable hierarchy — folders, tags, hide, lock, select-by-type');
