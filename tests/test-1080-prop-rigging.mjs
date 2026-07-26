// (build 1080) RIGGING AN IMPORTED MODEL — reported: "I need the option to rig models that are imported
// (especially for NPC characters) so that I can create animations for them."
// The auto-rigger has grown a skeleton on a static model since build 1025, but only for a PLAYER or an
// ENEMY type. Everything else a creator imports — the shopkeeper, the guard on the wall, the statue that
// comes alive — is a PROP, and a prop had no way to be rigged at all: the animation editor could only move
// it as one solid piece. No arms.
// A rig belongs to the MODEL, not to one copy of it. Props share one cached GLTF per URL, so rigging "this
// crate" and "that crate" differently would be a lie the engine could not keep. Keying by URL means every
// copy of the shopkeeper stands up the same way, and the level stores ONE marker set however many you placed.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the store
const MK = { hips: [0, 1, 0], head: [0, 1.7, 0] };   // shape is _sanitizeAutoRig's business; this test only cares that it survives
const S = new Function(`
  let _sanOK=true;
  function _sanitizeAutoRig(v){ return (_sanOK && v && typeof v==='object' && !Array.isArray(v)) ? v : null; }
  let modelRigs={};
  ` + extractFunction('_sanitizeModelRigs', src) + '\n' + extractFunction('_rigForUrl', src) + '\n'
  + extractFunction('_propRigCfg', src)
  + `\nreturn { san:_sanitizeModelRigs, forUrl:(u)=>{ return _rigForUrl(u); },
      cfg:_propRigCfg, set:(o)=>{ modelRigs=o; }, all:()=>modelRigs,
      bad:(b)=>{ _sanOK=!b; } };`)();
{
  const r = S.san({ 'http://x/npc.glb': MK, 'http://x/rock.glb': MK });
  eq(Object.keys(r).length, 2, 'two rigged models survive');
  eq(r['http://x/npc.glb'], MK, '...keyed by the model URL, not by a prop');
  eq(Object.keys(S.san({ '  ': MK, '': MK })).length, 0, 'a blank URL is not a model');
  eq(Object.keys(S.san({ ['u'.repeat(500)]: MK })).length, 0, '...nor is a 500-character one');
  eq(Object.keys(S.san(null)).length, 0, 'junk in gives an empty map, never a crash');
  eq(Object.keys(S.san([MK])).length, 0, '...including an array');
  eq(Object.keys(S.san('nope')).length, 0, '...or a bare string');
  const many = {}; for (let i = 0; i < 100; i++) many['u' + i] = MK;
  eq(Object.keys(S.san(many)).length, 32, 'the map is bounded');
  S.bad(true);
  eq(Object.keys(S.san({ 'u': { junk: 1 } })).length, 0, 'a marker set the rigger itself rejects is dropped, not stored');
  S.bad(false);
}
{
  S.set({ 'http://x/npc.glb': MK });
  eq(S.forUrl('http://x/npc.glb'), MK, 'a rigged URL resolves');
  eq(S.forUrl('  http://x/npc.glb  '), MK, '...however it is spaced, since it comes off a text field');
  eq(S.forUrl('http://x/other.glb'), null, 'an unrigged one resolves to nothing');
  eq(S.forUrl(''), null, '...as does a blank');
  eq(S.forUrl(null), null, '...and nothing at all');
}

// ---------------------------------------------------------------- the cfg the modal writes through
{
  S.set({});
  const c = S.cfg('http://x/npc.glb');
  eq(c.url, 'http://x/npc.glb', 'the cfg names the model');
  eq(c.propMode, true, '...and marks itself a prop, so the editor points its clips at the prop picker');
  assert(!!c.animLib, '...and pre-declares an animation library, so the rig modal does not go picking one for a prop');
  eq(c.autoRig, null, 'it reads through to the live map');
  c.autoRig = MK;                                  // exactly what _arFinish does
  eq(S.all()['http://x/npc.glb'], MK, '...and writing it lands in the level with nothing to copy back');
  eq(c.autoRig, MK, '...and reads back');
  c.autoRig = null;
  eq(S.all()['http://x/npc.glb'], undefined, 'clearing it removes the entry rather than leaving a null behind');
  eq('http://x/npc.glb' in S.all(), false, '...properly deleted, so the level does not serialise an empty rig');
}
{ // two props, one model: they cannot disagree
  S.set({});
  S.cfg('http://x/npc.glb').autoRig = MK;
  eq(S.cfg('http://x/npc.glb').autoRig, MK, 'a second prop on the same model sees the same rig');
  eq(Object.keys(S.all()).length, 1, '...and the level still stores exactly one marker set');
}

// ---------------------------------------------------------------- applying it
{
  const A = new Function(`
    const log=[];
    let modelRigs={ 'http://x/npc.glb':{ ok:1 } };
    function _sanitizeAutoRig(v){ return v||null; }
    function _autoRigApply(g, mk){ log.push(['rig', mk]); if(g.explode) throw new Error('bad model'); g.userData._autoRigged=true; return true; }
    ` + extractFunction('_rigForUrl', src) + '\n' + extractFunction('_applyModelRig', src)
    + `\nreturn { apply:_applyModelRig, log:()=>log, clear:()=>{ log.length=0; } };`)();
  const g = () => ({ scene: {}, userData: {} });
  let m = g();
  eq(A.apply(m, 'http://x/npc.glb'), true, 'a rigged model gets its skeleton');
  eq(A.log().length, 1, '...once');
  eq(A.apply(m, 'http://x/npc.glb'), true, 'asking again is a no-op...');
  eq(A.log().length, 1, '...because ONE model has ONE skeleton, however many props clone from it');
  A.clear();
  eq(A.apply(g(), 'http://x/plain.glb'), false, 'an unrigged model is left completely alone');
  eq(A.log().length, 0, '...the rigger is never even called');
  eq(A.apply(null, 'http://x/npc.glb'), false, 'a missing gltf is not a crash');
  eq(A.apply({ userData: {} }, 'http://x/npc.glb'), false, '...nor is one with no scene');
  const boom = { scene: {}, userData: {}, explode: 1 };
  eq(A.apply(boom, 'http://x/npc.glb'), false, 'a model the rigger chokes on fails soft — the prop still spawns, just unrigged');
}

// ---------------------------------------------------------------- wiring
{
  const fn = extractFunction('spawnProp', src);
  assert(/_applyModelRig\(gltf, src\);/.test(fn), 'the rig is grown when the model loads...');
  assert(fn.indexOf('_applyModelRig') < fn.indexOf('THREE.cloneSkinned'),
    '...BEFORE the first clone is taken, or the prop would clone the unrigged body and the bones would go nowhere');
}
assert(/modelRigs: \(Object\.keys\(modelRigs\)\.length \? Object\.assign\(\{\}, modelRigs\) : undefined\),/.test(src),
  'the rigs serialize with the level');
eq((src.match(/modelRigs = _sanitizeModelRigs\(level\.modelRigs\);/g) || []).length, 2, 'both load paths restore them');
{
  const i = src.indexOf('modelRigs = _sanitizeModelRigs(level.modelRigs);');
  const before = src.slice(0, i);
  assert(/must land BEFORE the props spawn/.test(src.slice(i, i + 220)),
    'and the ordering is called out — a rig restored after the props spawn would rig nothing');
}
assert(/let modelRigs = _sanitizeModelRigs\(savedLevel && savedLevel\.modelRigs\);/.test(src), 'they boot from the saved level');
assert(/modelRigs=\{\};                        \/\/ build 1080/.test(src), 'and a scene wipe clears them');

// ---------------------------------------------------------------- the editor
{
  const fn = extractFunction('renderEditorFields', src);
  assert(/_aeOpen\(_propRigCfg\(\(sel\.userData\.src\|\|''\)\.trim\(\)\)/.test(fn),
    'the animation editor gets the model\'s authored skeleton, so a rigged prop keyframes as a humanoid');
  assert(/arB\.textContent=_rigged \? '\\u2713 Rigged \\u2014 edit markers' : '\\ud83e\\uddb4 Auto-rig model \(T-pose\)';/.test(fn),
    'a Rig button sits beside it, and says which state it is in');
  assert(/_arOpen\(_src, _propRigCfg\(_src\), \(\)=>\{ if\(typeof renderEditorFields==='function'\) renderEditorFields\(\); \}\)/.test(fn),
    '...opening the SAME marker modal the player and enemy rigs use — one rigger, three places to reach it');
  assert(/Best on a model standing in a T-pose or A-pose/.test(fn), 'the tooltip says what kind of model this works on');
  assert(/cx\.onclick=\(\)=>\{ pushUndoSnapshot\(\); delete modelRigs\[_src\];/.test(fn), 'and a rig can be taken back off');
  assert(/the animation editor can only move this model <b>as one piece<\/b>\. Rig it to keyframe limbs/.test(fn),
    'an unrigged prop says exactly what it is missing and why you would want it');
  assert(/every copy of it in the level shares the same rig/.test(fn),
    '...and a rigged one says the rig is shared, which is the surprising half');
  assert(/Placed copies pick it up when the level reloads\./.test(fn),
    '...and that the copies already standing there re-fit on reload, rather than leaving the author to wonder');
}
assert(/\(cfg\.propMode \? 'Rigged \\u2014 open the animation editor to keyframe its limbs \(placed copies re-fit on reload\)'/.test(extractFunction('_arFinish', src)),
  'and finishing the rig on a prop tells you the next step, instead of the character-only message about the animation library');

done('build 1080: an imported NPC can be given a skeleton and keyframed like any character — one rig per model, shared by every copy');
