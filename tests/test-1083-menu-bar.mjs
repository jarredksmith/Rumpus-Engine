import { gameSource, html, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1083: a desktop-app menu bar across the top of the editor (File / Edit / Tools / Help),
// and a File > New level that genuinely starts from nothing.

// ---------------------------------------------------------------- the menu definition
const menus = src.match(/const ED_MENUS = \[[\s\S]*?\n\];/);
assert(menus, 'ED_MENUS declares the whole bar in one place');
const M = menus[0];
for (const id of ['file', 'edit', 'tools', 'help'])
  assert(new RegExp("id:'" + id + "'").test(M), 'there is a ' + id.toUpperCase() + ' menu');

// the actions the user asked for by name — Save, New, settings, node editor, help
assert(/New level/.test(M), 'File offers New level');
assert(/'Save',\s*key:'', run:\(\)=>_edClick\('edSave'\)/.test(M), 'File > Save clicks the panel\'s own Save button');
assert(/Logic graph[\s\S]{0,60}_lgOpen/.test(M), 'Tools opens the node/logic graph');
assert(/Settings[\s\S]{0,80}setEditorMode\('settings'\)/.test(M), 'Tools jumps to Settings');
assert(/Field manual[\s\S]{0,60}_edClick\('edHelp'\)/.test(M), 'Help opens the field manual');
assert(/Animation editor[\s\S]{0,60}_aeOpen/.test(M) && /Outliner[\s\S]{0,80}_outToggle/.test(M) &&
       /Command palette[\s\S]{0,90}_edClick\('edPalBtn'\)/.test(M), 'Tools also gathers the animation editor, outliner and palette');
assert(/Import[\s\S]{0,60}edImport/.test(M) && /Export[\s\S]{0,60}edExport/.test(M) &&
       /Copy share link[\s\S]{0,60}edShare/.test(M), 'File keeps import / export / share together');
assert(/danger:true/.test(M), 'the destructive items are marked so they can be coloured as such');

// The whole point of routing through _edClick is that there is ONE implementation per action: the panel
// button. If a menu item ever grew its own copy of an action, the two could drift apart.
const ids = [...M.matchAll(/_edClick\('(\w+)'\)/g)].map(m => m[1]);
assert(ids.length >= 6, 'most items delegate to a panel button (' + ids.length + ')');
for (const id of ids)
  assert(new RegExp('id="' + id + '"').test(html), '#' + id + ' is a real element in the panel');

// ---------------------------------------------------------------- run in a fake DOM
const el = () => {
  const n = { children: [], classList: new Set(), style: {}, dataset: {}, tagName: 'DIV' };
  n.className = '';
  n.appendChild = (c) => { n.children.push(c); return c; };
  n.querySelector = (s) => n.querySelectorAll(s)[0] || null;
  n.querySelectorAll = (s) => {
    const cls = s.replace(/^\./, '').replace(/\[.*\]$/, '');
    const want = s.match(/data-menu="(\w+)"/);
    return n.children.filter(c => (c.className || '').split(' ').includes(cls) &&
      (!want || c.dataset.menu === want[1]));
  };
  n.getBoundingClientRect = () => ({ left: 40, bottom: 30 });
  Object.defineProperty(n, 'textContent', {
    get: () => n._t || '', set: (v) => { n._t = v; }, configurable: true });
  n.classList = { _s: new Set(),
    add: (c) => n.classList._s.add(c), remove: (c) => n.classList._s.delete(c),
    contains: (c) => n.classList._s.has(c),
    toggle: (c, on) => on ? n.classList._s.add(c) : n.classList._s.delete(c) };
  Object.defineProperty(n, 'innerHTML', { get: () => '', set: () => { n.children.length = 0; }, configurable: true });
  return n;
};
const byId = {};
const body = el();
const doc = {
  body,
  getElementById: (i) => byId[i] || null,
  createElement: () => el(),
  createTextNode: (t) => ({ text: t }),
  addEventListener: () => {},
};
const runSrc = [
  M,   // extractConst can't hold a multi-line array literal; the slice above is the real declaration
  extractFunction('_edClick'),
  'let _mbOpen="";',
  extractFunction('_edMenuBuild'),
  extractFunction('_edMenuClose'),
  extractFunction('_edMenuToggle'),
  extractFunction('_edMenuSync'),
].join('\n');
const mk = (edOpen, w) => {
  for (const k in byId) delete byId[k];
  body.children.length = 0; body.classList._s.clear();
  const win = { innerWidth: w, addEventListener: () => {} };
  const clicked = [];
  const api = new Function('document', 'window', 'editorOpen', 'clicked',
    runSrc + `
    // getElementById must find what _edMenuBuild appended
    return { sync:_edMenuSync, toggle:_edMenuToggle, close:_edMenuClose, open:()=>_mbOpen, MENUS:ED_MENUS };`
  )(doc, win, edOpen, clicked);
  // the fake document indexes appended nodes by their id
  const idx = () => { for (const c of body.children) if (c.id) byId[c.id] = c; };
  return { api, idx, clicked, win };
};

// the bar only exists while editing — a player never sees it
let t = mk(false, 1400); t.api.sync(); t.idx();
assert(!body.classList.contains('edMenuBar'), 'no menu bar outside the editor');

t = mk(true, 1400); t.api.sync(); t.idx();
assert(body.classList.contains('edMenuBar'), 'editing on a desktop puts the bar up');
const bar = byId.edMenuBar;
assert(bar, 'the bar element is built');
const labels = bar.children.filter(c => c.className === 'mbBtn').map(c => c.textContent);
eq(labels.join('|'), 'File|Edit|Tools|Help', 'and it reads File | Edit | Tools | Help');

// ...and not on a phone, where 30px of chrome costs more than it gives
t = mk(true, 600); t.api.sync(); t.idx();
assert(!body.classList.contains('edMenuBar'), 'a narrow screen keeps the panel-only layout');

// opening / switching / closing
t = mk(true, 1400); t.api.sync(); t.idx();
t.api.toggle('file');
eq(t.api.open(), 'file', 'clicking File opens File');
const pop = byId.edMenuPop;
assert(pop.classList.contains('on'), 'the dropdown shows');
eq(pop.children.filter(c => (c.className || '').startsWith('mbItem')).length, 7, 'with File\'s seven items in it');
eq(pop.children.filter(c => c.className === 'mbSep').length, 3, '...grouped by three rules');
assert(pop.style.top === '30px', 'positioned under the bar (' + pop.style.top + ')');
t.api.toggle('file');
eq(t.api.open(), '', 'clicking it again closes it');
assert(!pop.classList.contains('on'), '...and the dropdown goes away');
t.api.toggle('tools'); t.api.toggle('help', true);
eq(t.api.open(), 'help', 'hovering across the bar switches menus while one is open');
eq(byId.edMenuBar.querySelectorAll('.mbBtn').filter(b => b.classList.contains('on')).length, 1,
   'exactly one title is ever highlighted');

// ---------------------------------------------------------------- File > New level
const nl = extractFunction('_edNewLevel');
assert(/uiConfirm\(/.test(nl) && /'Start new'/.test(nl), 'New level asks first — it is not undoable');
assert(/clears EVERYTHING/.test(nl), '...and says plainly that everything goes');
assert(/clearSave==='function'\) clearSave\(\)/.test(nl), 'it drops the browser save');
assert(/stopAutoSave==='function'\) stopAutoSave\(\)/.test(nl), '...stops the autosave timer first');
assert(/_newLevelPending=true/.test(nl), '...and latches a flag so nothing writes the old level back');
// Reload, not reset-by-hand: every default in the file is written "savedLevel ? ... : DEFAULT", so a
// save-less load IS the blank project. And it must be replace(origin+pathname) — a reload that kept
// #lvl= or ?game= on the URL would import the very level we just deleted.
assert(/location\.replace\(location\.origin \+ location\.pathname\)/.test(nl),
  'it reloads to a bare URL, so a share link on the address bar cannot re-import the old level');
assert(nl.indexOf('location.replace') < nl.indexOf('location.reload'), 'reload is only the fallback');

// both save paths honour the flag, or New would race the unload and restore what it just cleared
const asn = extractFunction('autoSaveNow');
assert(/if\(_newLevelPending\) return;/.test(asn), 'autoSaveNow refuses to run once New is confirmed');
assert(asn.indexOf('_newLevelPending') < asn.indexOf('_autoSaveOn'), '...before any other check');
assert(/beforeunload[\s\S]{0,80}!_newLevelPending && _autoSaveOn && _levelDirty/.test(src),
  'and the tab-close flush honours it too');
assert(/let _newLevelPending = false;/.test(src), '_newLevelPending is declared');

// Edit > Delete all objects is the OLD, narrower wipe — it must not pretend to be New
assert(/Delete every object in the scene\? Your world, gameplay and other settings are kept/.test(M),
  'Delete all objects says what it does NOT clear, so the two are never confused');

// ---------------------------------------------------------------- wiring + chrome
assert(/#edMenuBar \{[^}]*position:fixed[^}]*top:0/.test(html), 'the bar is pinned to the top of the page');
assert(/body\.edMenuBar #editor \{ top:30px;/.test(html), 'the panel drops below it instead of hiding under it');
assert(/body\.edMenuBar #edToolbar \{ top:calc\(40px/.test(html), '...and so does the viewport toolbar');
const zBar = +html.match(/#edMenuBar \{[\s\S]*?z-index:(\d+)/)[1];
const zPop = +html.match(/#edMenuPop \{[\s\S]*?z-index:(\d+)/)[1];
const zEd = +html.match(/#editor \{[\s\S]*?z-index:\s*(\d+)/)[1];
assert(zBar > zEd && zPop > zBar, 'the bar sits over the panel and the dropdown over the bar (' + [zEd, zBar, zPop] + ')');
eq((src.match(/if\(typeof _edMenuSync==='function'\) try\{ _edMenuSync\(\); \}catch\(e\)\{\}/g) || []).length, 3,
   'every path that closes the editor takes the bar with it: deploy, win, lose');
assert(/function toggleEditor\(\)\{\s*\n\s*try\{ setTimeout\(\(\)=>\{ try\{ _edMenuSync\(\)/.test(src),
  'toggleEditor re-syncs on the next tick, after editorOpen has flipped');
assert(/addEventListener\('resize', \(\)=>\{ try\{ _edMenuSync\(\)/.test(src),
  'and resizing across the phone/desktop line adds or removes it live');

done('build 1083: a File/Edit/Tools/Help menu bar over the editor, and a New level that really is new');
