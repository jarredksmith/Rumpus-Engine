// (build 880) THE 60↔20 FPS PING-PONG — user report: "FPS jumping from 60 down to low 20s back and
// forth rapidly... even on a totally clear level", "can't even smoothly scroll the editor window."
// Three legs, all fixed: (1) the adaptive scaler climbed back after 3 good seconds into the exact
// state that had just failed — a failed climb now DOUBLES the required good streak (3s→6s→12s→24s),
// forgiven after 45s of stability; (2) build 872's 4x MSAA is precisely the load a struggling GPU
// needs shed — samples now ride the full-res step only; (3) every step change rebuilt the post
// pipeline INCLUDING five shader recompiles — materials/scene now survive, targets alone rebuild.
// Plus: the brush-ring raycast throttles to ~33Hz (it ran per mousemove — hundreds/s on gaming mice).
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the scaler, executed: simulate windows of frame times against a fake clock ----
const code = `
let _adaptOn=true, _adaptAcc=0, _adaptN=0, _adaptNext=0, _adaptCool=0, _adaptGood=0;
let _adaptUpNeed=6, _adaptUpAt=0, _adaptShiftAt=0;
let _prStepI=0, _prScale=1;
const _PR_STEPS=[1,0.85,0.72,0.66];
function _applyPixelRatio(){}
${extractFunction('_adaptResTick', src)}
function harness(){ return { tick:_adaptResTick, get:()=>({ step:_prStepI, upNeed:_adaptUpNeed, good:_adaptGood }) }; }`;
const { tick, get } = evalDecl(code, 'harness', { Math })();
let t = 10000;   // mid-session: past any boot grace
const win = (avg) => { for (let i = 0; i < 9; i++) tick(avg, t); t += 501; tick(avg, t); };   // one evaluated 500ms window
const settle = () => { t += 1000; };   // clear the 900ms post-shift cooldown

// slow at full res -> downshift (a first downshift is NOT a failed climb)
win(25); eq(get().step, 1, 'over-budget frames downshift immediately');
eq(get().upNeed, 6, "a session's first downshift keeps the default climb requirement");
// six good windows -> climb back
settle(); for (let i = 0; i < 6; i++) win(15);
eq(get().step, 0, 'six good windows climb one step (the original 3s rule)');
// the climb fails fast -> backoff doubles
settle(); win(25);
eq(get().step, 1, 'failed climb drops again');
eq(get().upNeed, 12, 'and doubles the required good streak');
// six good windows are no longer enough...
settle(); for (let i = 0; i < 6; i++) win(15);
eq(get().step, 1, 'six good windows no longer re-climb after a failed attempt');
for (let i = 0; i < 6; i++) win(15);
eq(get().step, 0, '...twelve are');
// fail again -> 24
settle(); win(25); eq(get().upNeed, 24, 'each failed climb doubles again (capped at 48)');
// 45s of dead-band stability forgives the backoff
settle(); for (let i = 0; i < 95; i++) win(18);   // ~47s of "fine at this step" windows
eq(get().upNeed, 6, '45s of stability resets the climb requirement (scene changes stay responsive)');
eq(get().step, 1, 'without ever leaving the stable step');

// ---- MSAA rides the top step only ----
assert(/function _desiredPostSamples\(\)\{[\s\S]{0,220}return \(typeof _prStepI==='undefined' \|\| _prStepI===0\) \? 4 : 0;/.test(src),
  '4x MSAA at full resolution only — a downshift sheds it (the relief the scaler is looking for)');
assert(/\|\| \(_postRT\.samples\|\|0\)!==_desiredPostSamples\(\)\)\{ disposePost\(\); ensurePost\(\); \}/.test(src),
  'the per-frame size check also rebuilds when the desired sample count changes');

// ---- step changes stop recompiling shaders ----
assert(/function ensurePost\(\)\{\s*\n\s*if\(_postRT\) return true;/.test(src), 'ensurePost keys on the targets, not the scene');
assert(/if\(_postScene\) return true;   \/\/ build 880: materials \+ scene survive disposePost/.test(src), 'materials are created once and reused across rebuilds');
assert(/_postRT=_bloomRT=_compRT=_afterA=_afterB=null;   \/\/ build 880: keep _postScene/.test(src), 'disposePost drops targets only');
assert(/function resizePost\(\)\{ if\(_postRT\) disposePost\(\); \}/.test(src), 'window resize path updated to the same rule');

// ---- brush-ring raycast throttle ----
assert(/const _nowT=performance\.now\(\); if\(_nowT-_brushRingT<30\) return; _brushRingT=_nowT;/.test(extractFunction('_updateBrushRing', src)),
  'the editor brush cursor raycasts at ~33Hz, not once per pointer report');

done('build 880: the scaler backs off after a failed climb, MSAA sheds with it, and step changes stop hitching');
