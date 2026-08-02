import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 354: a signal can play the level's cutscene — for everyone, mid-game.

// --- executable: the cutscene branch fires once, with guards ---
const fn = new Function('propModels','xaToggle','broadcastXAnim','broadcastAnim','broadcastUnlock','playPropAnimationOnce','NET','gameWon',
  'cutsceneByName','_ccHasData','cineShotsOf','_cineActive','editorOpen','startCinematic','broadcastCine',
  extractFunction('_applySignalAction') + '\n' + extractFunction('fireSignals') + '\nreturn fireSignals;');
const mk = (over) => {
  const calls = { started:0, bc:0 };
  const o = Object.assign({ has:true, active:false, editor:false }, over||{});
  const cc = o.has ? { path:[[0,0,0],[1,1,1]], audio:'x.mp3', shots2:[] } : null;
  const f = fn([], ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{}, { mode:'off' }, ()=>{},
    (n)=>{ calls.askedFor=n; return cc; }, c=>!!(c&&c.path&&c.path.length), c=>[c], o.active, o.editor, ()=>{ calls.started++; }, (n)=>{ calls.bc++; calls.bcName=n; });
  return { f, calls };
};
const sig = { userData:{ signals:[{ when:'interacted', do:'cutscene' }] } };
{ const { f, calls } = mk();                  f(sig,'interacted'); assert(calls.started===1 && calls.bc===1, 'plays and broadcasts, no target needed');
  f({ userData:{ signals:[{ when:'interacted', do:'cutscene', cs:'Boss' }] } }, 'interacted');
  assert(calls.askedFor==='Boss', 'resolves the cutscene by its authored name (build 356)'); }
{ const { f, calls } = mk({ active:true });   f(sig,'interacted'); assert(calls.started===0, 'never stacks over a running cinematic'); }
{ const { f, calls } = mk({ editor:true });   f(sig,'interacted'); assert(calls.started===0, 'never fires in the editor'); }
{ const { f, calls } = mk({ has:false });     f(sig,'interacted'); assert(calls.started===0, 'no cinematic authored -> no-op'); }

// --- net: both handlers play it with the same guards, host relays ---
assert((src.match(/msg\.t==='cine'\)\{ const cc=cutsceneByName\(msg\.n\); if\(cc && !editorOpen && !_cineActive && _ccHasData\(cc\)\) startCinematic\(\{ shots: cineShotsOf\(cc\), audio: cc\.audio \}, false\);/g)||[]).length === 2, 'host + client handlers resolve by name, guarded identically (build 356)');
assert(/NET\.conns\[cid\]\.send\(\{t:'cine', n:msg\.n\}\)/.test(src), 'host relays the beat WITH its name');

// --- editor + level check ---
assert(/\['cutscene','Play cutscene'\]/.test(src), 'action in the dropdown');
const li = new Function('propModels','pickupSpots','POWERUP_KINDS','keyDisplayName','pickupsOn','audioZones','cineCfg',
  // build 1300: levelIssues records WHERE each issue is, beside the message. This rig runs it in an
  // empty scope, so it supplies an inert recorder — the locators are build 1300's own test's business.
  'const _issueFind = new Map(); const _issueAt = (m)=>m;\n' +
  extractFunction('levelIssues') + '\nreturn levelIssues();');
const props = [{ userData:{ signals:[{ when:'interacted', do:'cutscene' }] } }];
assert(li(props, [], {}, c=>c, true, [], { on:false, path:[] }).some(m=>/play nothing/.test(m)), 'cutscene signal without a usable shot is flagged');
assert(li(props, [], {}, c=>c, true, [], { on:false, path:[[0,0,0],[1,1,1]] }).filter(m=>/play nothing|no target tag/.test(m)).length === 0, 'valid shot -> clean, and no targetless complaint');
done();
