import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 356: named cutscenes — #1 (cineCfg, default 'Intro') plays on deploy; extras in cineCfg.others play by name from signals.

// --- executable: name resolution + per-cutscene data check ---
const reg = new Function('cineCfg',
  extractFunction('allCutscenes') + extractFunction('cutsceneByName') + extractFunction('cineShotsOf') + extractFunction('_ccHasData') +
  '\nreturn { byName: cutsceneByName, has: _ccHasData, all: allCutscenes };');
const cfg = { name:'Intro', path:[[0,0,0],[1,1,1]], shots2:[], audio:'a.mp3',
  others:[ { name:'Boss', path:[[5,5,5],[6,6,6]], shots2:[], audio:'b.mp3' }, { name:'Empty', path:[], shots2:[] } ] };
const r = reg(cfg);
assert(r.byName() === cfg && r.byName('') === cfg, 'blank name -> cutscene #1');
assert(r.byName('Intro') === cfg, "#1 answers to its name");
assert(r.byName('Boss') === cfg.others[0] && r.byName('Boss').audio==='b.mp3', 'extras resolve by name with their own audio');
assert(r.byName('Nope') === null, 'unknown name -> null (signal no-ops)');
assert(r.has(cfg.others[0]) && !r.has(cfg.others[1]), 'has-data is per cutscene');

// --- persistence round-trip including others ---
const ap = new Function('cineCfg','lc', extractFunction('_resShot') + '\n' + extractFunction('_applyCine').replace('function _applyCine(lc){','').replace(/\}\s*$/,'') );
const out = {}; ap(out, { on:true, path:[[1,2,3]], name:'Opening', others:[ { name:'Boss', audio:'b.mp3', path:[[9,9,9],[8,8,8]], dur:7, shots2:[ { path:[[1,1,1],[2,2,2]], dur:3 } ] } ] });
assert(out.name==='Opening' && out.others.length===1, 'name + others restore');
assert(out.others[0].name==='Boss' && out.others[0].audio==='b.mp3' && out.others[0].dur===7 && out.others[0].shots2.length===1, 'extra cutscene restores shots and audio');
assert(/name: cineCfg\.name\|\|'Intro', others: \(cineCfg\.others\|\|\[\]\)\.map/.test(src), 'both serialize with the level');

// --- editor + runtime wiring ---
assert(/const CC = _curCutscene\(\);/.test(src), 'panel binds to the selected cutscene');
assert(/if\(_cineCSel===0\) b\.appendChild\(r\);/.test(src), 'the deploy toggle only exists on cutscene #1');
assert(/cineCfg\.others\.push\(_newCutscene\(\)\)/.test(src) && /cineCfg\.others\.splice\(_cineCSel-1,1\)/.test(src), 'add/delete extras (and #1 is undeletable)');
assert(/placeholder='cutscene name \(blank = #1\)'/.test(src), 'signal rows name their cutscene');
assert(/_cineAudioUrl = \(typeof data\.audio==='string'\) \? data\.audio : cineCfg\.audio;/.test(src), 'the running cutscene carries its own track');

// --- level check, executed ---
const li = new Function('propModels','pickupSpots','POWERUP_KINDS','keyDisplayName','pickupsOn','audioZones','cineCfg',
  // build 1300: levelIssues records WHERE each issue is, beside the message. This rig runs it in an
  // empty scope, so it supplies an inert recorder — the locators are build 1300's own test's business.
  'const _issueFind = new Map(); const _issueAt = (m)=>m;\n' +
  extractFunction('levelIssues') + '\nreturn levelIssues();');
const propsFor = (cs) => [{ userData:{ signals:[{ when:'interacted', do:'cutscene', cs }] } }];
const base = { on:false, path:[[0,0,0],[1,1,1]], shots2:[], others:[ { name:'Boss', path:[[1,1,1],[2,2,2]], shots2:[] } ] };
assert(li(propsFor('Ghost'), [], {}, c=>c, true, [], base).some(m=>/no cutscene has that name/.test(m)), 'unknown cutscene name flagged');
assert(li(propsFor('Boss'), [], {}, c=>c, true, [], base).filter(m=>/cutscene/i.test(m)).length === 0, 'valid named reference -> clean');
assert(li([], [], {}, c=>c, true, [], { on:false, path:[], others:[ { name:'Boss', path:[], shots2:[] } ] }).some(m=>/has no camera path yet/.test(m)), 'a pathless extra cutscene is flagged');
done();
