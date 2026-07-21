// (build 1026) AUTO-RIGGER UI — the Mixamo-style marker flow on the build-1025 core: a modal
// front view, click CHIN -> WRISTS -> ELBOWS -> KNEES -> GROIN (Use Symmetry mirrors pairs),
// colored rings, AUTO-RIG fits the skeleton and turns the animation library on. Entry point:
// "Auto-rig model (T-pose)" on the editor's Player tab. Verified live in the browser too
// (smoke: synthetic static humanoid -> clicks -> rig -> 40+ library clips retarget).
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: placement logic (symmetry, sides, step advancement) ----
const glue = 'const AUTORIG_MARKERS = ' + extractConst('AUTORIG_MARKERS', src) + ';\n'
  + 'const AR_STEPS = ' + extractConst('AR_STEPS', src) + ';\n'
  + 'let _arStep=0, _arSym=true, _arX0=0, _arMarkers={};\n'
  + 'const _arSyncRings=()=>{}, _arRenderList=()=>{};\n'
  + extractFunction('_arDoneStep', src) + '\n'
  + extractFunction('_arPlace', src) + '\n';
const mkEnv = () => new Function(glue + `
  return {
    place:(x,y,z)=>_arPlace({ x, y, z }),
    setSym:(v)=>{ _arSym=v; },
    setStep:(i)=>{ _arStep=i; },
    state:()=>({ step:_arStep, markers:JSON.parse(JSON.stringify(_arMarkers)) }),
  };`)();

{ // symmetry ON: one wrist click fills BOTH wrists, mirrored across the model's center
  const env = mkEnv();
  env.place(0, 1.62, 0.1);                       // chin
  eq(env.state().step, 1, 'chin placed -> advances to WRISTS');
  env.place(0.72, 1.33, 0.02);                   // left wrist (+x half)
  const m = env.state().markers;
  eq(m.wristL.join(','), '0.72,1.33,0.02', 'clicked side stored as LEFT (+x)');
  eq(m.wristR.join(','), '-0.72,1.33,0.02', 'the mirror fills the RIGHT wrist');
  eq(env.state().step, 2, 'both wrists set -> advances to ELBOWS');
}
{ // symmetry OFF: each side is its own click, and the step waits for both
  const env = mkEnv();
  env.setSym(false); env.setStep(1);
  env.place(0.7, 1.3, 0);
  eq(env.state().step, 1, 'one wrist placed -> still on WRISTS');
  assert(!env.state().markers.wristR, 'the other side is NOT auto-filled');
  env.place(-0.71, 1.31, 0);
  eq(env.state().step, 2, 'second wrist placed -> advances');
  eq(env.state().markers.wristR.join(','), '-0.71,1.31,0', 'clicked -x half lands as RIGHT');
}
{ // finishing the set never advances past the end; re-placing a done step stays put
  const env = mkEnv();
  env.place(0,1.6,0);                             // chin
  env.place(0.7,1.3,0); env.place(0.45,1.32,0);   // wrists, elbows (mirrored)
  env.place(0.15,0.5,0); env.place(0,0.86,0);     // knees, groin
  const st = env.state();
  eq(Object.keys(st.markers).length, 8, 'five clicks with symmetry = all eight markers');
  eq(st.step, 4, 'stays on the last step once everything is placed');
}

// ---- the modal + wiring ----
assert(/const AR_STEPS = \[/.test(src) && /\{ key:'chin',\s+label:'CHIN',\s+color:'#35e0d6' \}/.test(src),
  'the five Mixamo steps with their marker colors');
assert(/_arEl\.id='arModal'/.test(src) && /AUTO-RIGGER<\/div>/.test(src), 'the modal exists');
assert(/if\(!_ensureInspectR\(\)\)/.test(extractFunction('_arOpen', src)), "reuses the inspector's GL context (no extra WebGL context)");
const open_ = extractFunction('_arOpen', src);
assert(/if\(g\.userData && g\.userData\._autoRigged\) rigged=false;/.test(open_), 'our own rig can be re-edited...');
assert(/toast\('This model already has a skeleton \\u2014 turn on the animation library instead'\)/.test(open_),
  '...but an externally-rigged model is refused with advice');
assert(/if\(moved>6 \|\| !_arModel\) return;/.test(open_), 'a drag never places a marker (turn vs click)');
assert(/_arPlace\(_arModel\.worldToLocal\(hits\[0\]\.point\.clone\(\)\)\)/.test(open_),
  'placements land in MODEL space — stable under the turntable spin');
const fin = extractFunction('_arFinish', src);
assert(/playerModelCfg\.autoRig=mk;/.test(fin), 'markers land in the player cfg (serialized with the level)');
assert(/playerModelCfg\.animLib='ual1'; if\(typeof _animLibApplyPicks==='function'\) _animLibApplyPicks\(playerModelCfg, 'ual1'\);/.test(fin),
  'a fresh rig defaults the animation library ON (a skeleton without clips is still a statue)');
assert(/if\(g && !wasRigged\) _autoRigApply\(g, mk\);/.test(fin), 'the cached gltf rigs immediately — no reload needed the first time');
assert(/rebuildAvatars\(\)/.test(fin), 'avatars rebuild so the rig shows instantly');

// ---- Player tab entry ----
assert(/arB\.textContent=playerModelCfg\.autoRig \? '\\u2713 Auto-rigged \\u2014 edit markers' : 'Auto-rig model \(T-pose\)'/.test(src),
  'the Player tab button reflects rig state');
assert(/arB\.onclick=\(\)=>_arOpen\(\(playerModelCfg\.url\|\|''\)\.trim\(\)\);/.test(src), 'and opens the tool for the current model');
assert(/cx\.onclick=\(\)=>\{ playerModelCfg\.autoRig=null;/.test(src), 'markers can be cleared');
assert(/use Auto-rig on the Player tab \(for static models\) or re-rig it externally/.test(src),
  'the old dead-end "go use Mixamo" toast now points at the in-app tool');

done('build 1026: auto-rigger UI — marker flow with symmetry, modal, Player-tab entry');
