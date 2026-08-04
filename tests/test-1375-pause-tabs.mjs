import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
// build 1375 (UI review #2): the pause menu had become the whole settings surface — 36 controls in one
// scrolling column, 55% visible at 900px, Exit to main menu below the fold, and two literal
// backslash-u2014 escape sequences rendering as garbage text in the markup (in JS strings the escape is
// deliberate house style; in HTML it is just six characters). Now: a tab strip of real <button>s + four panels wrap the EXISTING
// rows (moved verbatim, ids untouched — bindPauseMenu and the a11y loader read them), the footer
// (Resume / Help / Exit) never scrolls away, the tab body scrolls inside a sub-90vh card, and the
// active tab is remembered per session.
const src = gameSource();

// ---------------------------------------------------------------- the pause block, sliced once
const pmA = html.indexOf('<div id="pauseMenu"');
const pmB = html.indexOf('<div id="padDebug"></div>');
assert(pmA > 0 && pmB > pmA, 'pause menu block found');
const pm = html.slice(pmA, pmB);

// ---------------------------------------------------------------- 1. strip + panels + footer exist
{
  eq((pm.match(/<button class="pTab" data-ptab="/g) || []).length, 4,
    'four tab buttons, and they are real <button>s (1347 focus rules apply free)');
  for (const t of ['game', 'controls', 'audio', 'comfort']) {
    assert(pm.includes('data-ptab="' + t + '"'), 'tab exists: ' + t);
    assert(pm.includes('<div class="pPanel" data-ppanel="' + t + '">'), 'panel exists: ' + t);
  }
  assert(pm.indexOf('id="pauseTabs"') < pm.indexOf('data-ptab="game"'), 'the strip lives in #pauseTabs');
  assert(pm.indexOf('id="pauseBody"') < pm.indexOf('data-ppanel="game"'), 'the panels live in #pauseBody');
  assert(pm.includes('id="pauseFooter"'), 'the footer exists');
}

// ---------------------------------------------------------------- 2. each panel holds its rows; the footer holds Resume / Help / Exit
{
  const iG = pm.indexOf('data-ppanel="game"'), iC = pm.indexOf('data-ppanel="controls"'),
        iA = pm.indexOf('data-ppanel="audio"'), iM = pm.indexOf('data-ppanel="comfort"'),
        iF = pm.indexOf('id="pauseFooter"');
  assert(iG < iC && iC < iA && iA < iM && iM < iF, 'order: game < controls < audio < comfort < footer');
  const game = pm.slice(iG, iC), ctl = pm.slice(iC, iA), aud = pm.slice(iA, iM),
        com = pm.slice(iM, iF), foot = pm.slice(iF);
  for (const id of ['id="pauseCamMode"', 'id="pauseSprintMode"', 'id="pauseCrouchMode"', 'id="pauseLoadout"',
                    'id="pauseCredits"', 'id="pauseCredits2"', 'id="postFxCb"', 'id="adaptResCb"'])
    assert(game.includes(id), 'GAME holds ' + id);
  for (const id of ['id="pauseEditHud"', 'id="pauseKeys"', 'id="pauseCtl"', 'id="padSensRng"',
                    'id="padAimRng"', 'id="msSensRng"', 'id="msAimMatchCb"'])
    assert(ctl.includes(id), 'CONTROLS holds ' + id);
  for (const id of ['id="muteCb"', 'id="volMaster"', 'id="volMusic"', 'id="volSfx"'])
    assert(aud.includes(id), 'AUDIO holds ' + id);
  for (const id of ['id="pauseA11y"', 'id="a11yShake"', 'id="a11yUiScale"', 'id="a11yCbMode"', 'id="a11yPhotoWarn"'])
    assert(com.includes(id), 'COMFORT holds ' + id);
  for (const id of ['id="pauseResume"', 'id="pauseHelp"', 'id="pauseExit"'])
    assert(foot.includes(id), 'the always-visible footer holds ' + id);
}

// ---------------------------------------------------------------- 3. moved controls kept their ids, exactly once each
{
  for (const id of ['pauseCamMode', 'pauseSprintMode', 'pauseCrouchMode', 'pauseLoadout', 'pauseCredits2',
                    'pauseEditHud', 'pauseKeys', 'pauseCtl', 'padSensRng', 'padAimRng', 'msSensRng',
                    'msAimMatchCb', 'muteCb', 'postFxCb', 'adaptResCb', 'volMaster', 'volMusic', 'volSfx',
                    'pauseA11y', 'a11yShake', 'a11yUiScale', 'a11yCbMode', 'a11yPhotoWarn',
                    'pauseResume', 'pauseHelp', 'pauseExit'])
    eq((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, 'exactly one id="' + id + '" in the document');
  // pauseCredits would double-count against the 1277 JS comment that QUOTES the id, so pin the tag form
  eq((html.match(/<button id="pauseCredits"/g) || []).length, 1, 'exactly one pauseCredits BUTTON (the 1277 rule holds)');
}

// ---------------------------------------------------------------- 4. zero literal backslash-u2014 in MARKUP; the hints keep a REAL dash
{
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
  eq((markup.match(/\\u2014/g) || []).length, 0,
    'zero literal backslash-u2014 sequences outside script blocks (in markup the escape rendered as garbage)');
  assert(/<b>Stick and touch only<\/b> — a mouse is never assisted/.test(pm),
    'the aim-assist hint keeps its dash as a REAL character');
  assert(/These are yours, not the level's — they follow you/.test(pm),
    'the a11y hint keeps its dash as a REAL character');
}

// ---------------------------------------------------------------- 5. the card clips under ~90vh, the body scrolls, the footer sits outside the body
{
  const pc = html.match(/#pauseMenu \.pauseCard \{([\s\S]*?)\n  \}/);
  assert(pc, 'the card rule parses');
  assert(/overflow:hidden;/.test(pc[1]) && !/overflow-y:auto/.test(pc[1]), 'the CARD no longer scrolls');
  assert(/max-height:calc\(88vh \/ var\(--uiS,1\)\); max-height:calc\(\(100dvh - 24px\) \/ var\(--uiS,1\)\);/.test(pc[1]),
    'card under ~90vh, divided by --uiS because the zoom rule multiplies it back (build 1333)');
  const pb = html.match(/#pauseBody \{([^}]*)\}/);
  assert(pb && /overflow-y:auto/.test(pb[1]) && /flex:1 1 auto/.test(pb[1]) && /min-height:0/.test(pb[1]),
    'the tab body scrolls INSIDE the card');
  assert(/\.pPanel \{ display:none;/.test(html) && /\.pPanel\.on \{ display:flex; \}/.test(html),
    'panels toggle by class');
  const bodyOpen = pm.indexOf('<div id="pauseBody">');
  const footOpen = pm.indexOf('<div id="pauseFooter">');
  assert(bodyOpen >= 0 && footOpen > bodyOpen, 'the footer is a SIBLING after the scrolling body');
  assert(pm.slice(footOpen).includes('id="pauseExit"'), 'Exit to main menu lives in the footer, never below a fold');
}

// ---------------------------------------------------------------- 6. the tab-switch function, executed
{
  const fn = extractFunction('_pauseTabShow', src);
  const mkEl = (data) => { const cls = new Set();
    return { dataset: data, classList: { toggle: (c, f) => { if (f) cls.add(c); else cls.delete(c); } },
             _on: () => cls.has('on') }; };
  const tabs = ['game', 'controls', 'audio', 'comfort'].map(t => mkEl({ ptab: t }));
  const panels = ['game', 'controls', 'audio', 'comfort'].map(t => mkEl({ ppanel: t }));
  const body = { scrollTop: 99 };
  const doc = {
    querySelectorAll: (sel) => sel.indexOf('.pPanel') >= 0 ? panels : tabs,
    getElementById: (id) => id === 'pauseBody' ? body : null
  };
  const run = new Function('document', 'tabs', 'panels', 'body',
    "var _pauseTab='game';\n" + fn + "\n" +
    "_pauseTabShow('comfort');\n" +
    "const r1={tab:_pauseTab, on:panels.map(p=>p._on()), ton:tabs.map(t=>t._on()), st:body.scrollTop};\n" +
    "body.scrollTop=44;\n" +
    "_pauseTabShow('bogus');\n" +
    "const r2={tab:_pauseTab, on:panels.map(p=>p._on()), ton:tabs.map(t=>t._on()), st:body.scrollTop};\n" +
    "return {r1, r2};");
  const { r1, r2 } = run(doc, tabs, panels, body);
  eq(r1.tab, 'comfort', 'switching lands on the asked-for tab (and remembers it)');
  eq(JSON.stringify(r1.on),  '[false,false,false,true]', 'exactly the comfort PANEL is on');
  eq(JSON.stringify(r1.ton), '[false,false,false,true]', 'exactly the comfort TAB is marked');
  eq(r1.st, 0, 'the body scrolls back to the top on a switch');
  eq(r2.tab, 'game', 'an unknown name falls back to game — never a blank card');
  eq(JSON.stringify(r2.on),  '[true,false,false,false]', 'the game panel is on after the fallback');
  eq(JSON.stringify(r2.ton), '[true,false,false,false]', 'the game tab is marked after the fallback');
  eq(r2.st, 0, 'scroll reset happens on the fallback too');
}

// ---------------------------------------------------------------- 7. wiring: bound on every open, session-remembered, resume path untouched
{
  const bp = extractFunction('bindPauseMenu', src);
  assert(bp.includes("document.querySelectorAll('#pauseTabs .pTab').forEach(b=>{ b.onclick=()=>_pauseTabShow(b.dataset.ptab); });"),
    'the tab strip is wired inside bindPauseMenu (which openPause calls on every open)');
  assert(bp.includes('_pauseTabShow(_pauseTab);'), 'the remembered tab is re-applied on every open');
  const decl = src.indexOf("var _pauseTab = 'game';");
  assert(decl >= 0, 'the session memory is a var (module-level boot call below — the TDZ rule)');
  assert(decl < src.indexOf('\nbindPauseMenu();'), 'declared above the module-level bindPauseMenu() boot call');
  assert(/const pm=document\.getElementById\('pauseMenu'\); if\(pm\) pm\.classList\.add\('hidden'\);/.test(extractFunction('resumeGame', src)),
    'resumeGame still hides the whole menu (the Escape/pointer-lock resume path is untouched)');
}

done('build 1375: the pause menu is TABBED — four panels (game / controls / audio / comfort) in one card, every control row moved verbatim with its id intact, the footer (Resume / Help / Exit) always visible while the tab body scrolls inside a sub-90vh card, real <button> tabs remembered per session, and the two literal backslash-u2014 sequences that rendered as garbage in the markup are real em-dashes now');
