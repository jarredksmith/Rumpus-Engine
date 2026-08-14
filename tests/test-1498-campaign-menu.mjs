// build 1498 — the campaign gets a menu
//
// Reported from play: "Right now it's buried under the save tab and is hard to find." True twice over —
// the collapsed fold in the least-visited tab was the ONLY surface in the product that mentioned campaigns.
//
// The menu is a DOOR, not a second implementation: every item routes to the panel's own actions (the bar's
// hint has said "EVERY ACTION IS ALSO IN THE PANEL" since build 1083), and the items are a FUNCTION so the
// menu always shows the live campaign. The dynamic list is executed here against the real ED_MENUS entry.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ================================================================= the renderer learns function items */
{
  const tog = extractFunction('_edMenuToggle', src);
  assert(/const _items = \(typeof def\.items==='function'\) \? \(def\.items\(\)\|\|\[\]\) : def\.items;/.test(tog),
    'a menu\'s items may be a function, evaluated at open');
  assert(/for\(const it of _items\)\{/.test(tog), '...and the loop walks the evaluated list');
}

/* ================================================================= the menu itself, executed */
const items = (function(){
  /* the real items() function, lifted out of the real ED_MENUS literal */
  const i = src.indexOf("{ id:'campaign', label:'Campaign', items:()=>{");
  assert(i > 0, 'the Campaign menu is in ED_MENUS');
  const j = src.indexOf("\n  { id:'help'", i);
  assert(j > i, '...before Help');
  const lit = src.slice(i, j).replace(/,\s*$/, '');
  return (scope) => {
    const names = Object.keys(scope);
    const def = new Function(...names, 'return (' + lit + ');')(...names.map(k => scope[k]));
    eq(def.id, 'campaign', 'the entry parses');
    return def.items();
  };
})();

const mkScope = (levels, cur) => {
  const st = { toasts: [], tracked: null, mode: null, revealed: null, played: 0, clicked: [], undo: 0, restored: null, fields: 0 };
  return { st, scope: {
    campaign: { levels }, campaignEditIdx: cur,
    _campTrack: (i) => { st.tracked = i; },
    serializeLevel: () => ({ props: [] }),
    saveCampaign: () => {},
    startCampaign: () => { st.played++; },
    flashToast: (m) => { st.toasts.push(m); },
    setEditorMode: (m) => { st.mode = m; },
    _edRevealHost: (id) => { st.revealed = id; },
    _edClick: (id) => { st.clicked.push(id); },
    pushUndoSnapshot: () => { st.undo++; },
    restoreLevel: (lv) => { st.restored = lv; },
    renderEditorFields: () => { st.fields++; },
  } };
};

{
  /* EMPTY campaign: Add, Play, Manage — and no phantom level rows (the control) */
  const { scope } = mkScope([], -1);
  const out = items(scope);
  const labels = out.filter(x => !x.sep).map(x => x.label);
  assert(labels.some(l => /Add current level/.test(l)), 'Add is offered');
  assert(labels.some(l => /Play campaign/.test(l)), 'Play is offered');
  assert(labels.some(l => /Manage campaign/.test(l)), 'and the door to the panel');
  assert(!labels.some(l => /^\d+\./.test(l) || /1\./.test(l)), 'no phantom level rows on an empty campaign');
  assert(!labels.some(l => /Editing/.test(l)), 'and no editing header when nothing is attached');
}
{
  /* ATTACHED: the state leads, the attached row is marked, Done detaches through the tracker */
  const { st, scope } = mkScope([{ name: 'Intro' }, { name: 'Vault' }], 0);
  const out = items(scope);
  const labels = out.filter(x => !x.sep).map(x => x.label);
  assert(/Editing “Intro”/.test(labels[0]), 'the first row says which level Save is feeding');
  assert(out.find(x => x.label === labels[0]).key === 'Ctrl+S', '...with the key beside it');
  assert(labels.some(l => l === '✎ 1. Intro'), 'the attached level row is marked');
  assert(labels.some(l => l === '2. Vault'), '...and the other is not');
  out.find(x => /^Done/.test(x.label)).run();
  eq(st.tracked, -1, 'Done detaches through the ONE writer');
}
{
  /* ADD attaches — the same semantics as the panel button, not a second opinion about them */
  const { st, scope } = mkScope([], -1);
  const out = items(scope);
  out.find(x => /Add current level/.test(x.label)).run();
  eq(scope.campaign.levels.length, 1, 'the level was added');
  eq(st.tracked, 0, '...and attached (build 1497)');
  assert(/you are editing it: Save keeps it current/.test(st.toasts[0]), '...and the toast explains the model');
}
{
  /* a LEVEL row is the panel's Edit button: snapshot, load, attach, repaint */
  const { st, scope } = mkScope([{ name: 'Intro' }, { name: 'Vault' }], -1);
  const out = items(scope);
  out.find(x => x.label === '2. Vault').run();
  eq(st.undo, 1, 'one undo snapshot, so Ctrl+Z recovers the level it replaced');
  eq(st.restored, scope.campaign.levels[1], 'the level loads');
  eq(st.tracked, 1, '...attached');
  eq(st.fields, 1, '...and the panel repaints');
}
{
  /* Manage lands on the REAL Save tab — the mode key is `files` (MODE_LABEL maps it to "Save"), and the
     first draft invented 'save', which setEditorMode silently ignored: the same invented-key trap as
     'gameplay' vs 'rules', caught by the live probe reading mode:"build" afterwards */
  const { st, scope } = mkScope([], -1);
  items(scope).find(x => /Manage campaign/.test(x.label)).run();
  eq(st.mode, 'files', 'the Save tab\'s internal key');
  eq(st.revealed, 'edCampaign', '...and the fold is revealed, not just the tab switched (build 1348)');
  const modes = src.match(/const EDITOR_MODES = \[([^\]]*)\]/)[1];
  assert(modes.includes("'files'") && !modes.includes("'save'"), 'asserted against the real mode list');
}
{
  /* a big campaign caps the list and the overflow goes to the panel, which scrolls */
  const levels = []; for(let i = 0; i < 20; i++) levels.push({ name: 'L' + i });
  const { scope } = mkScope(levels, -1);
  const labels = items(scope).filter(x => !x.sep).map(x => x.label);
  eq(labels.filter(l => /^\d+\.|^✎ \d+\./.test(l)).length, 12, 'twelve level rows is a menu');
  assert(labels.some(l => /8 more in the panel/.test(l)), '...and the tail says where the rest live');
}

/* ================================================================= the always-visible state */
{
  const panel = extractFunction('renderCampaignPanel', src);
  assert(/getElementById\('mbCampHint'\)/.test(panel), 'the bar hint mirrors the attachment');
  assert(/CAMPAIGN: EDITING/.test(panel), '...naming the level Save is feeding');
  assert(/EVERY ACTION IS ALSO IN THE PANEL/.test(panel), '...and restores the stock hint when detached');
  const i = panel.indexOf('mbCampHint'), j = panel.indexOf('#edCampaign');
  assert(i > 0 && i < j, 'BEFORE the host early-return — the state changes mostly while the Save tab is not built');
  const sync = extractFunction('_edMenuSync', src);
  assert(/renderCampaignPanel/.test(sync),
    'and the bar picks the state up when it (re)appears — a poke at the one writer, not a second one');
}

done('build 1498 — the campaign is in the top menu bar: the live level list by name, the attached level ' +
     'marked and named in the always-visible hint, and every item a door to the panel\'s own actions');
