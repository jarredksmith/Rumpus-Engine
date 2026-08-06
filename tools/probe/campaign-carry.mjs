// Does a carried value survive a room that never heard of it?
//
// Build 1415 made a doorway commit the run. But the list of WHAT carries — `persistVars` — is per-LEVEL
// data, ticked in the Rules tab and saved into that level's own file. A gauntlet is one file per booth, so
// the creator has to tick the same names in every room. Miss one and the value dies at that door with
// nothing said anywhere.
//
// This is not hypothetical: build 1415's own probe hit it on its first run and reported a defect that did
// not exist, because the rooms had been serialized before the box was ticked.
//
// So: three rooms, and only the FIRST declares that it carries `score`. Walk 1 -> 2 -> 3. A creator who
// ticked the box once and built the other two rooms afterwards gets exactly this.
//
// The control is a fourth run where EVERY room declares it — that is build 1415, measured working, so if
// the control also loses the value the fault is somewhere else and this probe proves nothing.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe, page) => {
  const settle = async (max = 40) => {
    for (let i = 0; i < max; i++) { if (!(await probe('_levelLoaderActive'))) return true; await page.waitForTimeout(500); }
    return false;
  };
  const goto = (n) => probe(`(function(){
    logicGraph.nodes = (logicGraph.nodes||[]).filter(x=>x.id!=='g1');
    logicGraph.nodes.push({ id:'g1', type:'goto', x:0, y:0, p:{ n:${n}, keep:1 } });
    _lgBudget = 0; _lgPulse('g1', 'in'); return 1;
  })()`);
  const read = () => probe(`(function(){ return {
    room: (campaign.levels[campaignIdx]||{}).name,
    declares: persistVars.slice(),
    score: logicVars['score']===undefined ? null : logicVars['score'],
    carried: Object.assign({}, campaignVars) }; })()`);

  // `which` = the indices of the rooms that tick the box
  const build = (which) => probe(`(function(){
    const base = serializeLevel();
    const names = ['Range', 'Physics', 'Exit'];
    campaign.levels = names.map(function(nm, i){
      const r = JSON.parse(JSON.stringify(base)); r.name = nm;
      /* DELETE, not just skip: serializeLevel() reads the LIVE persist list, so a base captured after a
         previous run already carries it into every clone and the trap run is not one. The first draft of
         this probe reported all three rooms declaring it in both conditions, which is the instrument
         wearing the answer. */
      if(${JSON.stringify(which)}.indexOf(i) >= 0) r.persistVars = ['score']; else delete r.persistVars;
      r.persistSave = 1;
      return r;
    });
    campaignActive = true; campaignIdx = 0; _campaignComplete = false;
    persistVars = ['score']; persistSave = true;
    clearPersistent();
    return campaign.levels.map(function(l){ return l.name + (l.persistVars ? '*' : ''); }).join(' ');
  })()`);

  async function walk(which, label) {
    console.log('\n  ' + label + '   rooms declaring it: ' + (await build(which)));
    await probe('(function(){ startGame(); return 1; })()'); await settle();
    await probe(`(function(){ logicVars['score']=12; return 1; })()`);
    const rows = [await read()];
    for (const n of [2, 3]) { await goto(n); await settle(); rows.push(await read()); }
    for (const r of rows) console.log('      ' + r.room.padEnd(9) +
      ' declares ' + JSON.stringify(r.declares).padEnd(11) + ' score ' + r.score);
    return rows;
  }

  // ---- the control FIRST: every room declares it. This is build 1415, and it must carry. --------------
  const ctrl = await walk([0, 1, 2], 'CONTROL — every room ticks the box');
  P(ctrl[1].score === 12 && ctrl[2].score === 12,
    'THE CONTROL: when every room declares the carry, the value crosses both doors (build 1415)',
    ctrl.map(r => r.score).join(' -> '));

  // ---- and now the trap: only room one declares it ---------------------------------------------------
  const trap = await walk([0], 'only the FIRST room ticks the box');
  P(trap[1].score === 12,
    'a value carried INTO a room stays available there, even though that room never declared it — the ' +
    'carried set belongs to the campaign, not to whichever file you happened to tick',
    trap.map(r => r.score).join(' -> '));
  P(trap[2].score === 12, '...and through the next door too, so one missed tick cannot silently end a run',
    trap.map(r => r.score).join(' -> '));

  // ---- a name NOBODY declares is still not carried: this is not "carry everything" -------------------
  await build([0]);
  await probe('(function(){ startGame(); return 1; })()'); await settle();
  await probe(`(function(){ logicVars['score']=5; logicVars['scratch']=77; return 1; })()`);
  await goto(2); await settle();
  const scratch = await probe(`(function(){ return logicVars['scratch']===undefined ? null : logicVars['scratch']; })()`);
  P(scratch === null,
    'and a variable NO room ticked is still scratch — this widens what a carried value survives, it does ' +
    'not start carrying everything', 'scratch ' + scratch);

  await probe(`(function(){ clearPersistent(); persistVars=[]; persistSave=false; campaignActive=false;
                            campaignIdx=0; campaign.levels=[]; return 1; })()`);
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
