// (build 1075) PERSISTENT VARIABLES — values that outlive a level.
// Every variable in the engine died at match start, which quietly ruled out an entire genre: no running coin
// total across a campaign, no "you already talked to her", no shortcut that stays unlocked. Anything with
// progress had to be one enormous level.
// The rule is deliberately forgiving. A persistent value is SEEDED into the match at the start and COMMITTED
// back only when the level is CLEARED. Dying and retrying rewinds it to what it was when you walked in, so a
// player can never lose progress by failing — and can never farm a level by replaying the first half of it.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the name list
const san = new Function(extractFunction('_sanitizePersist', src) + '\nreturn _sanitizePersist;')();
eq(san(['coins', 'questStage']).join(','), 'coins,questStage', 'plain names pass');
eq(san(['  coins  ']).join(','), 'coins', 'and trim');
eq(san(['coins', 'coins']).join(','), 'coins', 'a name is listed once, however many nodes write it');
eq(san(['a b', 'x-y', '', '  ', '3lives', '#i']).length, 0,
  'anything that is not a variable name is dropped — spaces, punctuation, numbers, and the loop index');
eq(san(['#hits']).join(','), '#hits', "...but the engine's own #-prefixed names are real names");
eq(san(null).length, 0, 'junk in gives an empty list, never a crash');
eq(san('coins').length, 0, '...including a bare string');
eq(san(Array.from({ length: 200 }, (_, i) => 'v' + i)).length, 40, 'the list is bounded');

// ---------------------------------------------------------------- seed / commit, and what a retry does
const ENV = `
  let logicVars={}, campaignVars={}, persistVars=[], persistSave=false, store=null, homepageCfg;
  let persistInv=false, persistCp=false, _persistInvVal=null, _persistCpVal=null, inventory=[];   // build 1227: the store carries these too; this test is about the VARS, so both stay opted out
  const localStorage={ getItem:()=>store, setItem:(k,v)=>{ store=v; }, removeItem:()=>{ store=null; } };
  const PERSIST_KEY='k';
`;
const E = new Function(ENV
  + extractFunction('_persistSlugify', src) + '\n' + extractFunction('_persistNSFrom', src) + '\n'   // build 1215
  + extractFunction('_persistNS', src) + '\n' + extractFunction('_persistKey', src) + '\n'
  + extractFunction('_persistSeed', src) + '\n' + extractFunction('_persistCommit', src) + '\n'
  + extractFunction('_persistStore', src) + '\n' + extractFunction('_persistLoad', src) + '\n'
  + extractFunction('clearPersistent', src)
  + `\nreturn {
      names:(a)=>{ persistVars=a; }, save:(b)=>{ persistSave=b; },
      startMatch:()=>{ logicVars={}; _persistSeed(); },        // exactly what logicStart does
      clear:()=>{ clearPersistent(); },
      win:()=>_persistCommit(), load:()=>_persistLoad(),
      set:(k,v)=>{ logicVars[k]=v; }, live:()=>logicVars, carried:()=>campaignVars,
      raw:()=>store, poison:(v)=>{ store=v; }, wipeMem:()=>{ campaignVars={}; } };`)();

{ // the whole point, end to end
  E.names(['coins']);
  E.startMatch();
  eq(E.live().coins, undefined, 'a fresh campaign starts with nothing carried');
  E.set('coins', 30); E.win();
  eq(E.carried().coins, 30, 'clearing the level carries the value forward');
  E.startMatch();
  eq(E.live().coins, 30, '...and the NEXT level starts holding it');
  E.set('coins', 55);
  E.startMatch();
  eq(E.live().coins, 30, 'but dying and retrying rewinds to what you walked in with — you cannot lose progress by failing');
  E.set('coins', 5); E.startMatch(); E.startMatch();
  eq(E.live().coins, 30, '...however many times you retry');
  E.set('coins', 90); E.win(); E.startMatch();
  eq(E.live().coins, 90, 'and clearing it for real moves the number on');
}
{ // a variable NOT on the list behaves exactly as it always did
  E.wipeMem(); E.names(['coins']);
  E.startMatch(); E.set('coins', 10); E.set('ammoUsed', 99); E.win();
  E.startMatch();
  eq(E.live().coins, 10, 'a listed variable comes back');
  eq(E.live().ammoUsed, undefined, '...and an unlisted one is still per-level scratch');
  eq(E.carried().ammoUsed, undefined, '...and is never even stored');
}
{ // an empty list costs nothing
  E.wipeMem(); E.names([]);
  E.startMatch(); E.set('x', 1); E.win();
  eq(Object.keys(E.carried()).length, 0, 'a level that lists nothing carries nothing');
}
{ // a variable declared persistent but never written still commits a number, not undefined
  E.wipeMem(); E.names(['unlockedGate']);
  E.startMatch(); E.win();
  eq(E.carried().unlockedGate, 0, 'an untouched persistent variable settles at 0, so a Branch on it is never NaN');
}

// ---------------------------------------------------------------- the opt-in session save
{
  E.wipeMem(); E.names(['coins']); E.save(false);
  E.startMatch(); E.set('coins', 7); E.win();
  eq(E.raw(), null, 'by default nothing is written to the browser at all');
  E.save(true);
  E.set('coins', 12); E.win();
  eq(JSON.parse(E.raw()).coins, 12, 'opting in writes the carried values out');
  E.wipeMem();                       // as if the tab had been closed and reopened
  E.load(); E.startMatch();
  eq(E.live().coins, 12, '...and they come back on the next visit');
  E.save(false); E.wipeMem(); E.load();
  eq(E.carried().coins, undefined, 'a level that did NOT opt in ignores whatever is in the browser');
}
{ // a hand-edited / corrupted store cannot poison the run
  E.wipeMem(); E.save(true); E.names(['coins']);
  E.poison('{"coins":"lots","evil":{"a":1},"good":4}');
  E.load();
  eq(E.carried().coins, undefined, 'a non-number in the store is ignored, not coerced');
  eq(E.carried().evil, undefined, '...and an object certainly is');
  eq(E.carried().good, 4, '...while the sound values still load');
  E.poison('not json at all'); E.wipeMem(); E.load();
  eq(Object.keys(E.carried()).length, 0, 'a corrupted store loads as nothing, never a crash');
}
{
  E.wipeMem(); E.save(true); E.names(['coins']);
  E.startMatch(); E.set('coins', 3); E.win();
  assert(E.raw() !== null, 'something is saved...');
  E.clear();
  eq(Object.keys(E.carried()).length, 0, 'Clear throws away what is carried');
  eq(E.raw(), null, '...and the saved copy with it, so the campaign really does start from zero');
}

// ---------------------------------------------------------------- wiring
assert(/if\(typeof _persistSeed==='function'\) _persistSeed\(\);/.test(extractFunction('logicStart', src)),
  'a match seeds the carried values BEFORE anything in the graph runs, so On start can already read them');
{
  const fn = extractFunction('gameWon', src);
  assert(/if\(typeof _persistCommit==='function'\) _persistCommit\(\);/.test(fn), 'clearing a level commits them');
  assert(fn.indexOf('_persistCommit') < fn.indexOf('campaignActive'),
    '...before the campaign advances, so the next level is loaded with the new numbers already carried');
}
assert(/campaignVars=\{\}; _campaignLoad\(0\);/.test(src), 'starting a campaign fresh drops whatever the last run carried');
assert(/persistVars: \(persistVars\.length \? persistVars\.slice\(\) : undefined\), persistSave: \(persistSave\|\|undefined\),/.test(src),
  'the author\'s list serializes with the level');
eq((src.match(/persistVars = _sanitizePersist\(level\.persistVars\); persistSave = !!level\.persistSave; persistInv = !!level\.persistInv; persistCp = !!level\.persistCp; _persistInvVal=null; _persistCpVal=null; _persistLoad\(_persistNSFrom\(level\.homepage\)\);/g) || []).length, 2,   // build 1227: the inv/cp flags set on the same line, before the load
  'both level-load paths restore it (from the level\'s per-game namespace since 1215) — and a level that opts in re-seeds from the browser as it loads');
assert(/let persistVars = _sanitizePersist\(savedLevel && savedLevel\.persistVars\);/.test(src), 'and it boots from the saved level');
assert(/persistVars=\[\]; persistSave=false;/.test(src), 'a scene wipe clears it');

// ---------------------------------------------------------------- the panel
{
  const fn = extractFunction('_renderPersistUI', src);
  assert(/textContent='Values that carry over'/.test(fn), 'the fold is named in plain language, not "persistence"');
  assert(/survives into the next level/.test(fn), '...and says what ticking one does');
  assert(/dying and retrying rewinds it to what it was when you walked in/.test(fn),
    '...including the forgiving half, which is the part an author would otherwise have to discover by losing progress');
  assert(/const names=\(typeof _lgVarOptions==='function'\) \? _lgVarOptions\(\) : \[\];/.test(fn),
    'it lists every variable name already in the level — no typing a name a second time');
  assert(/for\(const nm of persistVars\) if\(names\.indexOf\(nm\)<0\) names\.push\(nm\);/.test(fn),
    '...plus any ticked name whose node was since deleted, so it can still be un-ticked');
  assert(/No variables yet — add a Set variable node in the graph and its name appears here\./.test(fn),
    'an empty level says what to do instead of showing an empty box');
  assert(/textContent\('Also keep them between sessions'\)|createTextNode\('Also keep them between sessions'\)/.test(fn),
    'the session save is one clearly-labelled opt-in');
  assert(/'carrying now: '\+cur\.map\(k=>k\+'='\+campaignVars\[k\]\)\.join\(', '\)/.test(fn),
    'and the panel shows what is being carried RIGHT NOW — the thing you would otherwise have to guess at');
  assert(/cl\.onclick=\(\)=>\{ clearPersistent\(\); renderLogicPanel\(\);/.test(fn), '...with one button to throw it away');
}
assert(/_renderPersistUI\(host\);/.test(extractFunction('renderLogicPanel', src)), 'it lives with the graph that creates the variables');

done('build 1075: a number can finally outlive its level — carried on a clear, rewound on a retry, saved only if you ask');
