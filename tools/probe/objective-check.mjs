// build 1423 — does Level Check say when the objective cannot be completed?
//
// Three of the eight modes are silently unwinnable when under-authored, and none announces itself in play:
// a Destroy mission with no usable target (`_destroyTotal>0` is the win test), a Puzzle with no win action
// (`objectiveTick` has no puzzle branch at all), and a Race with no Start-line piece (`_raceStartO` null).
//
// Measured through `levelIssues()` itself, and then through the RENDERED panel — because the check that
// raises a row and the panel that shows it are two different things, and this build's first draft wrote
// `<b>` tags into messages the renderer sets with `textContent`. The control at every step is a correctly
// authored level of the same mode, which must stay quiet.
import { withGame } from './driver.mjs';

const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });

await withGame(async (P) => {
  // strip whatever the stock level has so the rows below are provably ours
  const setup = (code) => P(`(function(){
    for(const o of propModels){ if(o && o.userData){ delete o.userData.objective; } }
    logicGraph.nodes = []; logicGraph.wires = [];
    ${code}
    return levelIssues().filter(m => /objective is|Objective target/.test(m));
  })()`);

  const mk = (role, ud) => `{ const o = propModels.filter(p=>p&&p.userData&&!p.userData.runtime)[${role}];
    o.userData.objective = true; ${ud} }`;

  // ---- Destroy -------------------------------------------------------------------------------
  let r = await setup(`gameCfg.objective = 'destroy';`);
  console.log('\ndestroy, nothing marked   ', JSON.stringify(r));
  P_(r.length === 1 && /no way to end/.test(r[0]), 'a Destroy mission with no target at all is reported', r.length);
  P_(/NO TARGETS SET/.test(r[0] || ''), '...naming the HUD line the player would see', true);

  r = await setup(`gameCfg.objective = 'destroy';
    ${mk(0, `o.userData.shootable = true; o.userData.breakable = true;`)}`);
  console.log('destroy, one real target  ', JSON.stringify(r));
  P_(r.length === 0, 'CONTROL: one usable static target and the check is silent', r.length);

  r = await setup(`gameCfg.objective = 'destroy';
    ${mk(0, `o.userData.shootable = true; o.userData.breakable = false;`)}`);
  console.log('destroy, unbreakable only ', JSON.stringify(r));
  P_(r.length === 1 && /cannot be destroyed/.test(r[0]),
    'a target marked but UNBREAKABLE is reported as unusable, not counted', r.length);

  r = await setup(`gameCfg.objective = 'destroy';
    ${mk(0, `o.userData.shootable = true; o.userData.breakable = true;`)}
    ${mk(1, `o.userData.breakable = false;`)}`);
  console.log('destroy, one good one bad ', JSON.stringify(r));
  P_(r.length === 1 && /1 prop is marked/.test(r[0]),
    'a mixed level reports only the unusable one — the mission is winnable, so it is a note, not an alarm',
    r[0]);

  // ---- Puzzle --------------------------------------------------------------------------------
  r = await setup(`gameCfg.objective = 'puzzle';`);
  console.log('\npuzzle, no win path       ', JSON.stringify(r));
  P_(r.length === 1 && /nothing in this level ends it/.test(r[0]), 'a Puzzle with no way to win is reported', r.length);

  r = await setup(`gameCfg.objective = 'puzzle';
    logicGraph.nodes = [{ id:'w1', type:'win', x:0, y:0, p:{} }];`);
  P_(r.length === 0, 'CONTROL: a Win level node silences it', r.length);

  r = await setup(`gameCfg.objective = 'puzzle';
    logicGraph.nodes = [{ id:'g1', type:'goto', x:0, y:0, p:{ n:2 } }];`);
  P_(r.length === 0,
    'and so does a Go to level node — a campaign room ends by loading the next one, and calling that ' +
    '"no win path" would fire on every room of a multi-room game', r.length);

  r = await setup(`gameCfg.objective = 'puzzle';
    propModels.filter(p=>p&&p.userData&&!p.userData.runtime)[0].userData.signals = [{ when:'interacted', do:'win' }];`);
  P_(r.length === 0, 'and so does a prop signal that wins', r.length);

  // ---- Race ----------------------------------------------------------------------------------
  r = await setup(`gameCfg.objective = 'race';`);
  console.log('\nrace, no start line       ', JSON.stringify(r));
  P_(r.length === 1 && /Start line/.test(r[0]), 'a Race with no Start-line piece is reported', r.length);

  // ---- the modes that are auto-provisioned must stay quiet -----------------------------------
  const quiet = [];
  for (const m of ['eliminate', 'survival', 'extraction', 'defend', 'escort']) {
    const q = await setup(`gameCfg.objective = '${m}';`);
    if (q.length) quiet.push(m + ':' + q.length);
  }
  P_(quiet.length === 0, 'the five auto-provisioned modes report nothing on a bare level', quiet.join(',') || 'silent');

  // ---- and the PANEL, because a row that renders as markup is a row nobody can read ----------
  const panel = await P(`(function(){
    gameCfg.objective = 'destroy';
    for(const o of propModels){ if(o && o.userData) delete o.userData.objective; }
    /* the panel lives in the SAVE tab, and build 1293 does not build a section that is not on screen —
       so the editor has to be opened and switched there before the row can exist at all. */
    if(!editorOpen) toggleEditor();
    setEditorMode('save');
    if(typeof renderLevelIssues==='function') renderLevelIssues();
    const host = document.querySelector('#edIssues');
    if(!host) return { host:false };
    const rows = Array.from(host.children).map(c=>c.textContent).filter(t=>/objective is/.test(t));
    return { host:true, rows: rows.length, text: rows[0]||'', hasTags: /<[a-z]/i.test(host.innerHTML.replace(/<div|<span|<\\/div|<\\/span|<b>. Level check/gi,'')) };
  })()`);
  console.log('\nrendered panel            ', JSON.stringify(panel).slice(0, 260));
  if (panel.host) {
    P_(panel.rows === 1, 'the row reaches the rendered panel', panel.rows);
    P_(panel.text.indexOf('<b>') < 0 && panel.text.indexOf('</b>') < 0,
      '...as readable prose, not literal markup — the renderer sets textContent, and it must stay that way ' +
      'because other rows interpolate level-authored strings', panel.text.slice(0, 60));
  }
}, { settleMs: 4000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
