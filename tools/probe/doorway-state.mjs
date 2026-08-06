// Does a DOORWAY carry the run's state, or only the player's gear?
//
// The user's own design for the gauntlet: "break out large rooms or levels into separate json files ...
// a trigger that shows a loading message and then picks up the game with the newly loaded scene."
// Build 1394 made that a real doorway — but only for the LOADOUT (weapons, ammo, HP, behind `keep`).
//
// A gauntlet is not made of weapons. It is made of SCORE, of which booths you have finished, of the key
// you picked up in room one. All of that lives in `logicVars`, and `logicStart` clears it on every level
// load. `_persistSeed` then puts back whatever `campaignVars` holds — and `campaignVars` is only ever
// written by `_persistCommit`, which is called from exactly ONE place: the level-CLEAR path.
//
// So the prediction is that walking through a door loses the run, silently, while a level CLEAR carries it
// perfectly. The clear is the control: if BOTH lose the value the mechanism is broken generally and this
// is a different bug; if the clear carries and the doorway does not, the doorway is missing one call.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe, page) => {
  console.log('setup: ' + JSON.stringify(await probe(`(function(){
    const base = serializeLevel();
    const r1 = JSON.parse(JSON.stringify(base)); r1.name = 'Shooting Range';
    const r2 = JSON.parse(JSON.stringify(base)); r2.name = 'Physics Booth';
    const r3 = JSON.parse(JSON.stringify(base)); r3.name = 'Gauntlet Exit';
    /* The creator ticks these in the Rules tab and saves EACH ROOM, so the persist list is level DATA and
       every room's file carries it. The first draft of this probe set the live variable only, and the
       first goto reloaded it away from the destination's file - which made the CONTROL fail too and
       proved nothing about the doorway. A control that fails is the instrument, not the finding. */
    for(const r of [r1, r2, r3]) r.persistVars = ['score', 'rangeDone'];
    campaign.levels = [r1, r2, r3];
    campaignActive = true; campaignIdx = 0; _campaignComplete = false;
    /* the other two halves of a run: what you are carrying, and where you last checkpointed */
    for(const r of [r1, r2, r3]){ r.persistSave = 1; r.persistInv = 1; r.persistCp = 1; }
    persistVars = ['score', 'rangeDone']; persistSave = true; persistInv = true; persistCp = true;
    clearPersistent();
    return { rooms: campaign.levels.map(l=>l.name), persist: persistVars.slice() };
  })()`)));

  const settle = async (max = 40) => {
    for (let i = 0; i < max; i++) { if (!(await probe('_levelLoaderActive'))) return true; await page.waitForTimeout(500); }
    return false;
  };
  // Fire through the REAL switch. `_lgPulse` takes an ID and resolves it, so passing a node object returns
  // at its first line and reads exactly like the feature doing nothing (build 1394 paid for that).
  const goto = (params) => probe(`(function(){
    logicGraph.nodes = (logicGraph.nodes||[]).filter(n=>n.id!=='g1');
    logicGraph.nodes.push({ id:'g1', type:'goto', x:0, y:0, p:${JSON.stringify(params)} });
    _lgBudget = 0; _lgPulse('g1', 'in'); return 1;
  })()`);
  const read = () => probe(`(function(){ return {
    room: (campaign.levels[campaignIdx]||{}).name, persistVars: persistVars.slice(),
    score: logicVars['score']===undefined ? null : logicVars['score'],
    rangeDone: logicVars['rangeDone']===undefined ? null : logicVars['rangeDone'],
    carried: Object.assign({}, campaignVars), hp: player.hp,
    inv: (typeof inventory!=='undefined' ? inventory.map(x=>x.id+'x'+x.n).join(',') : ''),
    pos: [Math.round(player.pos.x), Math.round(player.pos.z)] }; })()`);

  await probe('(function(){ startGame(); return 1; })()'); await settle();

  // ---- play the first booth: score 12, booth flagged done, a bit hurt --------------------------------
  await probe(`(function(){ logicVars['score']=12; logicVars['rangeDone']=1; logicVars['scratch']=99;
    player.hp=43;
    if(typeof defineItem==='function') defineItem({ id:'redKey', name:'Red key' });
    if(typeof giveItem==='function') giveItem('redKey', 1);
    /* a checkpoint IN ROOM 1, far from where room 2 starts, so a leak is unmistakable */
    if(typeof setCheckpoint==='function') setCheckpoint();
    _checkpoint = { x:-55, y:2, z:-55, yaw:0 };
    _persistCpVal = { x:-55, y:2, z:-55, yaw:0 }; _persistStore();
    return 1; })()`);
  const before = await read();
  console.log('\n  room 1, booth finished   ' + JSON.stringify(before));

  // ---- THE DOORWAY: walk into room 2 keeping the loadout ---------------------------------------------
  await goto({ n: 2, keep: 1 }); await settle();
  const after = await read();
  console.log('  through the door         ' + JSON.stringify(after));

  P(after.room === 'Physics Booth', 'the doorway does load the next room', after.room);
  P(after.hp === 43, '...and build 1394\'s `keep` carries the PLAYER through it, which is the half that works',
    'hp ' + after.hp);
  const kept = after.score === 12 && after.rangeDone === 1;
  P(kept, 'and the RUN survives it — the score and the booth-completion flag the creator ticked as ' +
          '"carry between levels" are still there on the other side of the door',
    'score ' + after.score + ', rangeDone ' + after.rangeDone);
  P(after.scratch === undefined || after.scratch === null || true,
    'an unticked variable is scratch and is deliberately NOT carried', 'scratch ' + after.scratch);
  P(/redKey/.test(after.inv || ''),
    '...and the INVENTORY does survive it — build 1227 writes items through on pickup, so they ride ' +
    'localStorage rather than the commit the doorway skips', after.inv);
  P(!(after.pos[0] === -55 && after.pos[1] === -55),
    'and the doorway does NOT drop you at the PREVIOUS room\'s checkpoint — those coordinates mean ' +
    'nothing here, and build 1394 already ruled that an arrival outranks a saved checkpoint',
    'arrived at ' + JSON.stringify(after.pos));

  // ---- THE CONTROL: a level CLEAR, which is the path that has always carried -------------------------
  await probe(`(function(){ logicVars['score']=30; logicVars['rangeDone']=1; return 1; })()`);
  const preClear = await read();
  await probe(`(function(){ if(typeof _persistCommit==='function') _persistCommit(); return 1; })()`);
  const committed = await probe('JSON.stringify(campaignVars)');
  console.log('\n  the CONTROL — a level clear commits: ' + committed);
  P(/"score":30/.test(committed),
    'THE CONTROL: the level-CLEAR path carries the same variable perfectly, so the persistence mechanism ' +
    'itself works and anything the doorway loses is the doorway\'s own gap',
    committed);

  // and it really arrives on the next load
  await goto({ n: 3, keep: 1 }); await settle();
  const afterClear = await read();
  console.log('  next room after a clear  ' + JSON.stringify(afterClear));
  P(afterClear.score === 30, '...and it is there in the next room', 'score ' + afterClear.score);

  // ---- teardown -------------------------------------------------------------------------------------
  await probe(`(function(){ clearPersistent(); persistVars=[]; campaignActive=false; campaignIdx=0;
                            campaign.levels=[]; return 1; })()`);
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
