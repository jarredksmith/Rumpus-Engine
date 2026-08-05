// build 1227: persistent inventory + checkpoint — 1215's recorded other half. Variables persisted;
// the inventory (keys, quest items, consumables — what an adventure game IS) and the last checkpoint
// (where a returning player resumes) did not. Both are creator opt-ins riding the SAME namespaced blob
// under reserved keys __inv/__cp: the variable loader accepts only numeric values, so an old engine
// reading a new blob skips them silently, and a new engine reading an old blob finds nothing — two-way
// compatible by construction. Solo only; a play-from-here test pose (1224) outranks the checkpoint.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// a scope that runs the REAL store/load/resume trio against a fake localStorage
const drive = (setup, run) => {
  const body =
    'const _mem = {};\n' +
    'const localStorage = { getItem: k => (k in _mem ? _mem[k] : null), setItem: (k, v) => { _mem[k] = v; }, removeItem: k => { delete _mem[k]; } };\n' +
    "const PERSIST_KEY = 'breach_persist_v1';\n" +
    "function _persistNS(){ return ''; }\n" +
    "function _persistKey(ns){ ns = (ns!=null) ? ns : _persistNS(); return ns ? (PERSIST_KEY+':'+ns) : PERSIST_KEY; }\n" +
    'let campaignVars = {};\n' +
    'let persistVars = [];\n' +
    'let persistSave = true, persistInv = true, persistCp = true;\n' +
    'let _persistInvVal = null, _persistCpVal = null;\n' +
    'let inventory = [];\n' +
    'const invCatalog = {};\n' +
    'function defineItem(d){ invCatalog[d.id] = d; return d; }\n' +
    'let _checkpoint = null;\n' +
    'const player = { pos: { x: 0, y: 0, z: 0, set(x, y, z){ this.x = x; this.y = y; this.z = z; } }, yaw: 0, vel: { set(){} } };\n' +
    'const NET = { mode: "off" };\n' +
    'let logicVars = {};\n' +
    setup + '\n' +
    extractFunction('_persistStore') + '\n' + extractFunction('_persistLoad') + '\n' +
    extractFunction('_persistResume') + '\n' + extractFunction('_persistCommit') + '\n' +
    extractFunction('clearPersistent') + '\n' + run;
  return new Function(body)();
};

// ---------------------------------------------------------------- the round trip, executed
{
  const r = drive('',
    'inventory.push({ id: "goldkey", n: 1 }, { id: "potion", n: 3 });\n' +
    '_persistCpVal = { x: 10, y: 2, z: -5, yaw: 1.5 };\n' +
    'campaignVars.coins = 40;\n' +
    '_persistStore();\n' +
    // a fresh session: everything zeroed, then load + resume
    'inventory = []; campaignVars = {}; _persistInvVal = null; _persistCpVal = null; _checkpoint = null;\n' +
    '_persistLoad("");\n' +
    '_persistResume(false);\n' +
    'return { inv: inventory, cp: _checkpoint, px: player.pos.x, pyaw: player.yaw, coins: campaignVars.coins };');
  eq(r.inv.length, 2, 'the inventory comes back');
  eq(r.inv[0].id, 'goldkey', '...the key');
  eq(r.inv[1].n, 3, '...with counts intact');
  near(r.px, 10, 1e-9, 'the player stands at the saved checkpoint');
  near(r.pyaw, 1.5, 1e-9, '...facing the saved way');
  assert(r.cp && r.cp.x === 10, '...and _checkpoint is armed, so dying respawns there too');
  eq(r.coins, 40, 'the variables still ride beside them (same blob)');
}
{ // a spent potion stays spent: takeItem writes through, and the reload honours it
  const r = drive('',
    'inventory.push({ id: "potion", n: 1 });\n_persistStore();\n' +
    'inventory = [];\n_persistStore();\n' +                       // consumed the last one -> blob rewritten empty
    '_persistInvVal = null;\n_persistLoad("");\n_persistResume(false);\n' +
    'return inventory.length;');
  eq(r, 0, 'an emptied inventory persists as EMPTY — using the last potion cannot resurrect it on reload');
}
{ // the test pose outranks the checkpoint, but the items still come back
  const r = drive('',
    'inventory.push({ id: "goldkey", n: 1 });\n_persistCpVal = { x: 10, y: 2, z: -5, yaw: 1.5 };\n_persistStore();\n' +
    'inventory = []; _persistInvVal = null; _persistCpVal = null;\n_persistLoad("");\n' +
    '_persistResume(true);\n' +                                    // skipPos: a 1224 play-from-here pose is active
    'return { inv: inventory.length, px: player.pos.x, cp: _checkpoint };');
  eq(r.inv, 1, 'play-from-here still restores the items');
  eq(r.px, 0, '...but the player stays at the TEST pose, not the checkpoint');
  eq(r.cp, null, '...and no checkpoint is armed under it');
}
{ // completing the game clears the checkpoint, keeps the items
  const r = drive('',
    'inventory.push({ id: "sword", n: 1 });\n_persistCpVal = { x: 9, y: 0, z: 9, yaw: 0 };\n_persistStore();\n' +
    '_persistCommit();\n' +                                        // gameWon()
    'const j = JSON.parse(localStorage.getItem(PERSIST_KEY));\n' +
    'return { cp: j.__cp || null, inv: (j.__inv || []).length };');
  eq(r.cp, null, 'a completed game clears the saved checkpoint — the next run starts at the start');
  eq(r.inv, 1, '...but the earned items stay');
}
{ // guards: multiplayer and opt-out restore nothing
  const r = drive('',
    '_persistInvVal = [["goldkey", 1]]; _persistCpVal = { x: 5, y: 0, z: 5, yaw: 0 };\n' +
    'NET.mode = "client";\n_persistResume(false);\n' +
    'return { inv: inventory.length, px: player.pos.x };');
  eq(r.inv, 0, 'a co-op client never restores a private inventory');
  eq(r.px, 0, '...or teleports to a private checkpoint (desync)');
  const r2 = drive('persistSave = false;',
    'inventory.push({ id: "x", n: 1 }); _persistStore();\nreturn localStorage.getItem(PERSIST_KEY);');
  eq(r2, null, 'without the sessions opt-in nothing is written at all');
}
{ // two-way blob compatibility: the var loader skips the reserved keys
  const r = drive('',
    'localStorage.setItem(PERSIST_KEY, JSON.stringify({ coins: 7, __inv: [["k",1]], __cp: { x: 1, z: 2 } }));\n' +
    'persistInv = false; persistCp = false;\n' +                   // an engine/level that doesn't know or want them
    '_persistLoad("");\n' +
    'return { coins: campaignVars.coins, inv: _persistInvVal, cp: _persistCpVal, varLeak: campaignVars.__inv };');
  eq(r.coins, 7, 'numeric vars load');
  eq(r.inv, null, 'a level that did not opt in ignores __inv');
  eq(r.cp, null, '...and __cp');
  eq(r.varLeak, undefined, '...and neither ever leaks into the variables (non-numeric values are skipped)');
}
{ // hostile blob: caps hold
  const r = drive('',
    'const big = []; for(let i = 0; i < 200; i++) big.push(["item" + i, 5000]);\n' +
    'localStorage.setItem(PERSIST_KEY, JSON.stringify({ __inv: big }));\n' +
    '_persistLoad("");\n_persistResume(false);\n_persistStore();\n' +
    'return { n: inventory.length, top: Math.max(...inventory.map(s => s.n)), stored: JSON.parse(localStorage.getItem(PERSIST_KEY)).__inv.length };');
  eq(r.top, 999, 'a hostile 5000-count clamps to 999');
  eq(r.stored, 40, 'the re-written blob caps at 40 stacks');
}

// ---------------------------------------------------------------- wiring pins
{
  assert(/persistInv: \(persistInv\|\|undefined\), persistCp: \(persistCp\|\|undefined\),/.test(src),
    'both flags serialize absent-when-off — old levels byte-identical');
  eq((src.match(/persistInv = !!level\.persistInv; persistCp = !!level\.persistCp; _persistInvVal=null; _persistCpVal=null; _persistLoad\(/g) || []).length, 2,
    'BOTH loaders set the flags before the load (so __inv/__cp are picked up) and clear stale carried state from a previous level');
  assert(/let persistInv = !!\(savedLevel && savedLevel\.persistInv\);/.test(src), 'the boot path reads them too');
  const sg = extractFunction('startGame');
  const iWipe = sg.indexOf('inventory.length=0'), iRes = sg.indexOf('_persistResume(');
  assert(iWipe > 0 && iRes > iWipe, 'startGame resumes AFTER the inventory wipe — logicStart runs before it, so seeding there would be erased');
  assert(/_persistResume\(!!\(\(_ts && _ts\.pos\) \|\| _arriveWanted\)\)/.test(sg), '...and hands the resume the play-from-here flag');
  const sc = extractFunction('setCheckpoint');
  assert(/persistCp && \(typeof NET==='undefined' \|\| NET\.mode==='off'\)/.test(sc) && /_persistStore\(\)/.test(sc),
    'reaching a checkpoint writes through (solo)');
  assert(/build 1227: write-through when the inventory persists/.test(src) && /using the potion must not resurrect it on reload/.test(src),
    'giveItem and takeItem both write through');
  assert(/Carry the inventory too/.test(src) && /Resume at the last checkpoint/.test(src),
    'the two opt-ins render under the sessions checkbox');
}

done('build 1227: persistent inventory + checkpoint — the real store/load/resume/commit executed through a fake localStorage: full round trip (items, counts, position, yaw, vars beside them), a spent consumable stays spent, the 1224 test pose outranks the checkpoint while items still return, completing the game clears the checkpoint but keeps the items, co-op clients and opted-out levels restore nothing, hostile blobs clamp (999/stack, 40 stacks), and the reserved __inv/__cp keys are invisible to the variable loader in both directions');
