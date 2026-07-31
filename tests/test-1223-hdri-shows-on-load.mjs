// build 1223: a loaded HDRI shows IMMEDIATELY — reported from play as "nothing visually shows until I
// make an adjustment on the HDRI settings, then the sky shows up just fine."
//
// applySky() is the ONLY place that hides the procedural dome when an HDRI is active (`on = skyMode==='sky'
// && !hdri; _skyMesh.visible = on`), and the HDRI load-completion path (_applyOrientedSky) set
// scene.background + PMREM without ever calling it — so the dome, a mesh a metre from the camera, kept
// covering the freshly-set background until ANY settings change happened to run applyWorldCfg -> applySky.
// The completion path (and its rotation-failed fallback, and the inverse clear-the-URL branch) now calls
// applySky(), the function whose stated job is "everything the sky drives, applied together so they can
// never disagree".
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the mechanism, executed
{
  // drive _applyOrientedSky with stubs: a visible dome + an applySky that mirrors the real one's gate.
  // Success = the dome is HIDDEN by the time the status callback fires.
  const run = (orientThrows) => {
    const world = { skyMesh: { visible: true }, background: null, applied: 0 };
    const body =
      'let _skyOrigTex = { ok: 1 }, _skyOrigKind = "ldr", _skyRotTex = null, _skyHdriUrl = "https://x/sky.jpg";\n' +
      'const worldCfg = { skyMode: "sky", skyRot: 0 };\n' +
      'const THREE = { EquirectangularReflectionMapping: 1 };\n' +
      'const scene = { set background(v){ world.background = v; }, get background(){ return world.background; } };\n' +
      'function _orientEquirect(t){ ' + (orientThrows ? 'throw new Error("no 2d ctx");' : 'return t;') + ' }\n' +
      'function _buildSkyPMREM(){}\n' +
      'function applySky(){ world.applied++; const on = worldCfg.skyMode === "sky" && !_skyHdriUrl; world.skyMesh.visible = on; return on; }\n' +
      extractFunction('_applyOrientedSky') +
      '\nlet statusMsg = null; _applyOrientedSky((m)=>{ statusMsg = m; });\nreturn { world, statusMsg };';
    return new Function('world', body)(world);
  };
  { const r = run(false);
    assert(r.world.applied >= 1, 'the load-completion path calls applySky()');
    eq(r.world.skyMesh.visible, false, '...which HIDES the procedural dome — the HDRI is visible the moment it loads, no settings-poke needed');
    assert(r.world.background, '...with the background set');
    assert(/loaded/.test(r.statusMsg), '...and the status still reports success'); }
  { const r = run(true);   // the rotation path failing must not bring the dome back
    assert(r.world.applied >= 1, 'the rotation-failed fallback ALSO calls applySky()');
    eq(r.world.skyMesh.visible, false, '...so a rotation error still shows the (unrotated) HDRI, never the dome over it'); }
}

// ---------------------------------------------------------------- the inverse: clearing the URL re-shows the dome now
{
  assert(/_skyOrigTex = null; _skyOrigKind = null; _skyRotTex = null;\n    if\(typeof applySky==='function'\) try\{ applySky\(\); \}catch\(_\)\{ \}/.test(src),
    'clearing the HDRI URL calls applySky() too — the procedural dome comes back immediately, not on the next unrelated settings change (the latent inverse bug)');
}

// ---------------------------------------------------------------- the invariant this build restores
{
  // applySky is the single owner of dome visibility vs HDRI state; both transitions now route through it
  const as = extractFunction('applySky');
  assert(/const on = \(typeof worldCfg!=='undefined'\) && worldCfg\.skyMode === 'sky' && !hdri;/.test(as) &&
    /if\(_skyMesh\) _skyMesh\.visible = on;/.test(as),
    'applySky remains the one owner of the dome-vs-HDRI decision');
  eq((extractFunction('_applyOrientedSky').match(/typeof applySky==='function'/g) || []).length, 2,
    'both completion paths (success + rotation-failed) route through it');
}

done('build 1223: a loaded HDRI shows immediately — _applyOrientedSky executed with a dome-and-gate stub proving the dome is hidden by the time the success status fires (and on the rotation-failed fallback too), the clear-URL branch re-shows the dome now instead of on the next unrelated settings change, and applySky stays the single owner of the dome-vs-HDRI decision');
