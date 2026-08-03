// (build 1343) THE PIPELINE ANSWERS FOR ITSELF.
// Two builds guessed at a play report of jagged edges. 1342 blamed the adaptive ladder shedding MSAA, and
// the reporter's next message killed it outright: "if I turn adaptive resolution off, there is no visual
// difference. Still jagged in both." That single observation eliminates EVERY explanation routed through
// the ladder. So this build stops guessing and does what build 1274 already established for the culling
// report — make the subsystem able to say what it did.
//
// `_aaState()` is the one derivation; `_aaReport()` (perf HUD) and `levelIssues()` (Level Check) both read
// it, so a HUD and a panel can never disagree about the frame. This test drives the real function through
// every state the pipeline can be in.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- executed: the state machine, in every configuration ----
const mk = (o) => {
  const scope = {
    renderer: { capabilities: { isWebGL2: o.webgl2 !== false }, getPixelRatio: () => (o.pr == null ? 1 : o.pr) },
    _postRT: o.noRT ? null : { samples: o.samples || 0 },
    _postOn: o.postOn !== false,
    _matFXAA: o.noFxaa ? null : {},
    dofEnabled: !!o.dof,
    _prStepI: o.rung || 0,
    _hiFxOn: o.hiFx !== false,
    _PR_STEPS: [1, 0.85, 0.72, 0.66],
    _postMotion: o.mb == null ? 0 : o.mb,
    _adaptOn: o.adapt !== false,
    _mbShed: !!o.mbShed,
    a11y: { blur: o.a11yBlur == null ? 1 : o.a11yBlur },
    devicePixelRatio: o.dpr == null ? 1 : o.dpr,
  };
  const names = Object.keys(scope);
  const f = new Function(...names, extractFunction('_aaState', src) + '\nreturn _aaState();');
  return f(...names.map(n => scope[n]));
};

// the top rung on a WebGL2 context is the only state that gets hardware antialiasing
eq(mk({ samples: 4 }).aa, 'MSAA x4', 'full quality: 4x MSAA');
eq(mk({ samples: 4 }).scale, 1, '...at native resolution');

// WebGL1: `_desiredPostSamples` returns 0 outright, so MSAA is unavailable at EVERY rung, forever, and no
// setting in the game can bring it back. That alone produces exactly the reported symptom.
eq(mk({ webgl2: false, samples: 0 }).webgl2, false, 'a WebGL1 context is reported as such');
eq(mk({ webgl2: false, samples: 0 }).aa, 'FXAA only', '...and the frame falls back to FXAA');

// build 1284: DoF rasterises into its own single-sampled target, so a declared sample count is not AA.
// The state must ask the same question `_renderPostFX` asks, not what the target says about itself.
eq(mk({ samples: 4, dof: true }).aa, 'FXAA only', 'DoF turns hardware AA off even at samples:4 (build 1284)');
eq(mk({ samples: 4, dof: true }).dof, true, '...and says why');

// a shed rung
eq(mk({ samples: 0, rung: 1, hiFx: false, pr: 0.85 }).aa, 'FXAA only', 'a shed FX rung leaves FXAA');
eq(mk({ samples: 0, rung: 1, hiFx: false, pr: 0.85 }).rung, 1, '...and names the rung');

// nothing at all — post on but the FXAA fallback never built
eq(mk({ samples: 0, noFxaa: true }).aa, 'NONE', 'post on with no FXAA material is NO antialiasing');
// post off is a different answer again: the canvas was created with antialias:true
eq(mk({ postOn: false }).aa, 'canvas AA (post off)', 'with post off the canvas antialiases itself');
assert(/new THREE\.WebGLRenderer\(\{ antialias: true/.test(src),
  '...which is only true because the context really does ask for it');

// ---- the render scale, which sits UNDERNEATH all of it ----
// `_prBase` caps at 1.5 on a desktop, so a devicePixelRatio-2 display draws the world at 75% of native and
// the browser upscales it. That is jagged edges no antialiasing setting can touch, at every rung, and it is
// completely invisible to the adaptive resolution toggle — which is the shape of the report.
{ const a = mk({ samples: 4, pr: 1.5, dpr: 2 });
  eq(+a.scale.toFixed(3), 0.75, 'a dpr-2 display against the 1.5 ceiling draws at 75% of native');
  eq(a.aa, 'MSAA x4', '...while still reporting MSAA — the two are independent, which is the point'); }
eq(mk({ samples: 4, pr: 2, dpr: 2 }).scale, 1, 'a dpr-2 display that gets 2.0 is native');
assert(/const _prBase\s*=\s*Math\.min\(devicePixelRatio, IS_COARSE \? 2\.0 : 1\.5\)/.test(src),
  'the ceiling this reports against is real');

// ---- motion blur is reported as a FACT about the frame, not as a cause ----
// Measured four ways in build 1342: blur does not harden an edge (a silhouette goes from 65.7% to 72.2%
// antialiased with it on). It is here because the report is about blur, and "turn it on and read the line
// again" needs something to read.
eq(mk({ samples: 4, mb: 0.62 }).mb, true, 'blur on is reported');
eq(mk({ samples: 4, mb: 0.62 }).aa, 'MSAA x4', '...and does not change the AA answer by itself');
eq(mk({ samples: 4, mb: 0.62, a11yBlur: 0 }).mb, false, 'build 1313: the comfort slider folds it out');
eq(mk({ samples: 0, mb: 0.62, mbShed: true, rung: 0, hiFx: true }).mb, false,
  "build 1342: the ladder's own blur rung is honoured");
eq(mk({ samples: 0, mb: 0.62, rung: 3, hiFx: false }).mb, false, 'and the bottom rung sheds it (build 1313)');

// ---- it must never throw out of a render loop or a panel ----
eq(mk({ noRT: true }).samples, 0, 'no post target yet is 0 samples, not a crash');
{ const st = mk({ dpr: 0 });
  assert(isFinite(st.scale), 'a zero devicePixelRatio cannot produce a NaN scale'); }

// ---- one derivation, two readouts ----
const rep = extractFunction('_aaReport', src);
assert(/const a = _aaState\(\);/.test(rep),
  'the HUD line READS the state rather than re-deriving it — a HUD and a panel that disagreed about the ' +
  'frame would be worse than either alone, which is this file’s most repeated defect');
assert(!/isWebGL2|_postRT|dofEnabled|getPixelRatio/.test(rep),
  '...so none of the terms appear twice');
assert(/_aaReport\(\)/.test(src.match(/enemies '\+enemies\.length[\s\S]{0,240}/)[0]),
  'and the perf HUD prints it');

// ---- the Level Check rows: only when something is actually degraded ----
const li = extractFunction('levelIssues', src);
assert(/_aaState/.test(li), 'Level Check asks the same function');
for (const [needle, why] of [
    [/WebGL 1 context/, 'a WebGL1 context is named, because no in-game setting can fix it'],
    [/Depth of field is on, which turns hardware antialiasing off/, 'the DoF trade is explained rather than suffered'],
    [/Nothing is antialiasing the frame/, 'the NONE case says so'],
    [/of your display resolution and upscaled/, 'and the render scale, which no AA setting can touch']])
  assert(needle.test(li), why);
assert(/a\.scale < 0\.995/.test(li),
  'a full-quality frame reports NOTHING — a panel that always complains is not read (build 1274)');
assert(/Adaptive resolution off in the pause menu/.test(li),
  'the scale row distinguishes the adaptive scaler from the engine’s own ceiling, because the reporter ' +
  'had already ruled the scaler out and a message blaming it would have wasted their time again');

done('build 1343: the frame can say what is antialiasing it, and where the pixels went');
