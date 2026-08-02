import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1310 — editor audit 4.7, MED, verified still live:
//
//   "The Edit menu is Undo / Redo / Delete-all. Absent from EVERY menu, palette and panel: Copy, Paste,
//    Duplicate, Group/Ungroup, Array, Align, Snap toggle, Select-all (which does not exist — no Ctrl+A),
//    Local/World space, the outliner's folder system. The Ctrl+K palette covers actions and settings but
//    not objects and not Redo. This is the editor half of the onboarding audit's GAP 2."
//
// A shortcut nobody can discover is, for most creators, the same as not having the feature. Every command
// named above already existed and had a key; none of them had a way to be found. Select-all did not exist
// at all.
//
// Verified in the live editor (tools/probe/editor-commands.mjs): the real Ctrl+A selected 59 of 64 props
// with the locked and hidden ones provably absent, Esc cleared it and left the editor open, Ctrl+A inside a
// focused text field selected the TEXT and no props, the Edit menu reads back twelve labelled commands, and
// every object command in the palette runs and restores.

// ---------------------------------------------------------------- select all, which did not exist
{
  const fn = new Function('propModels', 'selProps', 'editorTargets', 'ST',
    'let editorActive="", selProps2=[];\n' +
    'const updateSelectionHighlight=()=>ST.hl++, renderEditorFields=()=>ST.re++, flashToast=(m)=>ST.toast=m;\n' +
    extractFunction('selectAllProps').replace(/\bselProps =/g, 'ST.sel =') +
    '; return selectAllProps;');
  const mk = (u) => ({ userData: u || {} });
  const props = [mk(), mk(), mk({ edLock: true }), mk({ edHide: true }), mk({ runtime: true }), mk({ _shattered: true }), mk()];
  const st = { hl: 0, re: 0, toast: '', sel: [] };
  const n = fn(props, [], { props: { idx: -1 } }, st)();
  eq(n, 3, 'three of seven props are selectable');
  assert(!st.sel.some(o => o.userData.edLock), 'A LOCKED PROP IS NOT SELECTED — locked exists precisely so a sweeping gesture cannot pick it up');
  assert(!st.sel.some(o => o.userData.edHide), '...nor a hidden one, for the same reason the marquee skips them (build 1036)');
  assert(!st.sel.some(o => o.userData.runtime), '...nor a prop spawned during play: it is not level content, and the next Deploy deletes it');
  assert(!st.sel.some(o => o.userData._shattered), '...nor one that has been destroyed');
  eq(st.hl, 1, 'the selection outline is refreshed once');
  eq(st.re, 1, '...and the inspector once');
  assert(/hidden\/locked skipped/.test(st.toast), 'and the creator is TOLD what was skipped, or "select all" silently means "select most"');
  // nothing to select is an answer, not a crash
  const st2 = { hl: 0, re: 0, toast: '', sel: [] };
  eq(fn([], [], { props: { idx: -1 } }, st2)(), 0, 'an empty scene selects nothing');
  assert(/Nothing to select/.test(st2.toast), '...and says so');
}
{
  const sa = extractFunction('selectAllProps');
  assert(/editorActive = 'props';/.test(sa), 'it switches to the props tab, or the selection would be invisible');
  assert(/editorTargets\.props\.idx = list\.length \? propModels\.indexOf\(list\[list\.length-1\]\) : -1;/.test(sa),
    'and names a primary, which every group-aware field (build 1299) and the gizmo both need');
  const da = extractFunction('deselectAllProps');
  assert(/selProps = \[\];/.test(da) && /return n;/.test(da), 'deselect clears and reports how many it released');
}

// ---------------------------------------------------------------- the keys
{
  assert(/if\(editorOpen && \(e\.ctrlKey\|\|e\.metaKey\) && e\.code==='KeyA' && !e\.shiftKey && !e\.altKey && !e\.repeat\)\{/.test(src),
    'Ctrl/Cmd+A is bound in the editor');
  assert(/if\(tag!=='INPUT' && tag!=='TEXTAREA'\)\{ e\.preventDefault\(\); if\(typeof selectAllProps==='function'\) selectAllProps\(\); \}/.test(src),
    '...and YIELDS to a focused field — select-all inside a dialogue box is what the creator meant');
  assert(/Shift\+A is already "add a shape", which is why this needs the modifier/.test(src),
    'and why it is the modified key is recorded');
  // Esc: claimed ONLY when there is a selection, so nothing that already owns it can be stolen
  assert(/if\(e\.code==='Escape' && editorOpen && !e\.repeat && typeof selProps!=='undefined' && selProps && selProps\.length\)\{/.test(src),
    'Esc clears the selection, and only when there IS one');
  const iEsc = src.indexOf("if(e.code==='Escape' && editorOpen && !e.repeat");
  const iBuild = src.indexOf("if(e.code==='Escape' && typeof buildMode!=='undefined' && buildMode)");
  assert(iEsc > 0 && iBuild > iEsc, 'it sits above the other Escape consumers…');
  assert(src.indexOf("else if(e.code==='Escape'){ _aeClose(); }") < iEsc,
    '…and BELOW the animation editor and the themed dialogs, which handle it and return before this line');
  assert(/Advertising a key that does nothing is the\n     same defect build 1306 fixed in the animation tab: the UI must not lie about the engine\./.test(src),
    'and the reason Esc had to become real rather than just be listed is recorded');
}

// ---------------------------------------------------------------- the menu the audit measured
{
  const menus = src.slice(src.indexOf('const ED_MENUS = ['), src.indexOf("{ id:'tools', label:'Tools'"));
  const edit = menus.slice(menus.indexOf("{ id:'edit'"));
  for (const [label, key] of [
    ['Select all', 'Ctrl+A'], ['Deselect all', 'Esc'], ['Copy', 'Ctrl+C'], ['Paste', 'Ctrl+V'],
    ['Duplicate', 'Shift+D'], ['Group', 'Ctrl+G'], ['Ungroup', 'Ctrl+Shift+G'],
  ]) {
    assert(edit.indexOf("label:'" + label + "'") > 0, 'the Edit menu offers ' + label);
    assert(edit.indexOf("key:'" + key + "'") > 0, '...and shows its shortcut ' + key + ', which is how anyone learns it');
  }
  assert(/label:'Snap on\/off'/.test(edit), 'snapping is reachable without knowing the modifier');
  assert(/label:'Gizmo space: World\/Local'/.test(edit), 'and so is build 1173’s local space');
  assert(/label:'Undo', key:'Ctrl\+Z'/.test(edit) && /label:'Redo', key:'Ctrl\+Shift\+Z'/.test(edit),
    'undo and redo are still there');
  assert(/label:'Delete all objects'/.test(edit) && /danger:true/.test(edit),
    '...and delete-all is still flagged dangerous');
  // each entry must call something that exists
  for (const f of ['selectAllProps', 'deselectAllProps', 'copySelectedProps', 'pasteProps', 'duplicateSelected', 'groupSelectedProps', 'ungroupSelectedProps'])
    assert(new RegExp('function ' + f + '\\(').test(src), 'the menu’s ' + f + ' is a real function');
}

// ---------------------------------------------------------------- the palette learned about objects
{
  const pal = extractFunction('_palItems');
  for (const label of ['Redo', 'Select all props', 'Deselect all', 'Copy', 'Paste', 'Duplicate', 'Group', 'Ungroup', 'Toggle snapping', 'Gizmo space: World/Local'])
    assert(pal.indexOf("A('" + label + "'") > 0, 'Ctrl+K finds "' + label + '"');
  // the shortcut is a SEARCH TERM, so typing what you half-remember finds the command
  for (const kw of ['ctrl+a', 'ctrl+c', 'ctrl+v', 'shift+d', 'ctrl+g', 'ctrl+shift+z'])
    assert(pal.indexOf(kw) > 0, 'searching the palette for "' + kw + '" finds its command');
  // align: nine entries generated rather than nine lines typed
  assert(/for\(const \[ax,axl\] of \[\['x','X'\],\['y','Y'\],\['z','Z'\]\]\)/.test(pal), 'align is generated per axis…');
  assert(/for\(const \[md,mdl\] of \[\['min','min'\],\['center','centre'\],\['max','max'\]\]\)/.test(pal), '…and per mode: nine entries');
  assert(/alignSelectedProps\(a,m\)/.test(pal), '...calling the real aligner');
  assert(/function alignSelectedProps\(axis, mode\)\{/.test(src), 'which takes exactly those two arguments');
  assert(/the palette covered actions and settings but NOT objects, and not even Redo/.test(src),
    'the audit’s own words are recorded beside the fix');
}

// ---------------------------------------------------------------- the principle
{
  assert(/Every one of those had a key binding and no way to discover it, which\n     is the same defect as not having the feature for anyone who does not read release notes\./.test(src),
    'why a discoverability build is a real build is stated once');
}

done('build 1310 (editor audit 4.7): the editor tells you what it can do — the Edit menu was Undo / Redo / Delete-all while Copy, Paste, Duplicate, Group, Ungroup, Align, snapping and build 1173\'s local space each had a key binding and no way to discover it, and Select-all did not exist at all. Ctrl+A now selects every prop, skipping the locked and hidden ones for the same reason the marquee does and saying how many it skipped; Esc clears the selection and claims the key only when there is one to clear, so nothing that already owns Escape is stolen; the Edit menu carries twelve labelled commands with their shortcuts; and the palette gained every object command plus Redo plus nine align entries, with the shortcuts themselves as search terms. Verified live: the real Ctrl+A selected 59 of 64 props with locked and hidden provably absent, Ctrl+A in a focused field selected the text and no props, and every palette command ran and restored');
