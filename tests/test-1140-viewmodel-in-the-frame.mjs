// build 1140: the weapon joins the frame, and the default level gets the engine's look back.
//
// A critic on the gameplay frames: "not one specular pixel and not one AO crease" anywhere on the object
// that occupies 11% of every frame. Probing the running game found two causes, and the second one was
// much larger than the weapon:
//
//  1. renderViewmodel() drew to the CANVAS after renderScene() had finished — i.e. after bloom, the
//     colour grade, the vignette, the grain and the motion blur. The one object on screen at all times
//     was the only object outside the frame's look. It was also absent from the SSAO G-buffer, so the AO
//     term at its pixels was computed from the world behind it and then multiplied into it: the weapon
//     wore the shading of whatever it happened to be standing in front of and had no occlusion of its
//     own. It is now drawn into _postRT before bloom, and into _aoGeoRT during the prepass.
//
//  2. `if(!(savedLevel && savedLevel.world)) _postOffWorld(worldCfg)` — build 796 — zeroed the ENTIRE
//     post chain for a first-time scene. Probed: bloom 0, vignette 0, grain 0, grade neutral, ssao 0.
//     That was right when the first-time scene was 22 boxes at Math.random() positions; build 1133 made
//     it a designed level. Every visual system builds 1126, 1128, 1135 and 1136 added was switched off
//     in the first frame anybody ever sees — which is also why none of them could be measured there.
//
// Measured on the stock level, same camera, fixed seed:
//   weapon body     2,473 -> 5,837 unique colours (grain + grade + bloom now reach it)
//   weapon grip     mean 72,81,71 -> 56,65,56
//   frame corner    mean 70,74,62 -> 57,59,50   (the vignette, previously absent)
//   crate foot      mean 109,143,139 -> 97,133,128   (world AO, previously absent)
// and, A/B on the G-buffer pass alone, with the rest of the build in place:
//   weapon grip     mean 69,80,67 (weapon absent from the G-buffer) -> 56,65,56 (present)
//   crate foot      mean 97,133,128 -> 97,133,128   (identical: the world's AO is undisturbed)
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the three-way split
{
  // _vmWanted answers the question; _drawViewmodel draws into whatever target is bound; renderViewmodel
  // is the frame loop's straight-to-canvas call. The middle one is the new capability.
  const w = extractFunction('_vmWanted');
  assert(/return true;\s*\}$/.test(w.trim()), 'the predicate returns a boolean');
  for (const guard of ['activeCam\\(\\) !== camera', '!gun\\.visible', 'editorOpen', '_scopedNow'])
    assert(new RegExp(guard).test(w), 'it still carries the ' + guard.replace(/\\/g, '') + ' early-out');
  assert(!/renderer\./.test(w), '...and draws nothing itself — it is asked before a target is bound');

  const d = extractFunction('_drawViewmodel');
  assert(!/setRenderTarget/.test(d),
    'the drawing half does NOT bind a target: the caller owns it, which is the whole point of the split');
  assert(/renderer\.clearDepth\(\);/.test(d), 'it clears depth, so the weapon can never intersect a nearby wall');
  assert(/const ac = renderer\.autoClear; renderer\.autoClear = false;/.test(d) && /renderer\.autoClear = ac;/.test(d),
    '...while keeping the colour already in the target, and restoring autoClear');
  assert(/_vmDone = true;/.test(d), 'and it records that this frame is served');

  const r = extractFunction('renderViewmodel');
  assert(/if\(_vmDone \|\| !_vmWanted\(\)\) return;/.test(r),
    'the frame loop call stands down when the post chain already drew it — or the weapon would be drawn twice, once graded and once not');
  assert(/_drawViewmodel\(\);/.test(r), '...and otherwise draws it, exactly as before this build');
}
{
  // the flag has to be cleared per SCENE RENDER, not per frame loop: renderScene is what the level
  // loader, the pause screen and the campaign card each call on their own, followed by renderViewmodel
  const rs = extractFunction('renderScene');
  assert(/_vmDone = false;   \/\/ a new frame's worth of scene/.test(rs), 'renderScene clears the flag');
  assert(rs.indexOf('_vmDone = false') < rs.indexOf('_renderPostFX'), '...before the post chain can set it');
  // and it is declared ABOVE its first reader. This file has taken the whole sky out twice by declaring
  // a `let` below the function that reads it, and `typeof` does not guard a temporal dead zone.
  assert(src.indexOf('let _vmDone = false;') >= 0, 'the flag is declared');
  assert(src.indexOf('let _vmDone = false;') < src.indexOf('function renderScene('), '...above renderScene');
  assert(src.indexOf('let _vmDone = false;') < src.indexOf('function _renderPostFX('), '...and above the post chain');
  assert(!/typeof _vmDone/.test(src), 'so no `typeof` pseudo-guard is needed, and none is there to mislead');
  // and if the post chain THROWS after drawing the weapon, the buffer it drew into is discarded — so the
  // flag has to be released or that frame ships without a weapon
  assert(/catch\(e\)\{ _postFail=true; _vmDone=false;/.test(rs),
    'a post-FX failure releases the flag, so the plain fallback path still draws the weapon that frame');
}

// ---------------------------------------------------------------- inside the post chain
{
  const fn = extractFunction('_renderPostFX');
  const at = (needle) => fn.indexOf(needle);
  assert(/const _vmHere = _vmWanted\(\);/.test(fn), 'the post chain asks once per frame and reuses the answer');
  assert(/if\(_vmHere\)\{ renderer\.setRenderTarget\(_postRT\); _drawViewmodel\(\); \}/.test(fn),
    'and draws the weapon into its own colour buffer');
  // ORDER is the whole feature: after the scene (and after DoF, which must not blur a first-person
  // weapon), before bloom reads _postRT.
  assert(at('renderer.render(scn, cam);') < at('_drawViewmodel();'), 'the world is drawn first');
  assert(at('_runDofTo(scn, cam, _postRT)') < at('_drawViewmodel();'),
    'DoF runs before it and therefore does not reach it — a first-person weapon stays sharp');
  assert(at('_drawViewmodel();') < at('_matBloomDown'), '...and bloom sees it');
  assert(at('_drawViewmodel();') < at('_matComp'), '...as do the grade, the vignette and the grain');
}
{
  // the AO G-buffer. Without this the AO at the weapon's pixels comes from the world behind it.
  const fn = extractFunction('_renderPostFX');
  const i = fn.indexOf('vmScene.overrideMaterial=_matAOGeo;');
  assert(i > 0, 'the weapon is rendered into the AO G-buffer as well');
  assert(fn.indexOf('renderer.setRenderTarget(_aoGeoRT); renderer.render(scn, cam);') < i,
    '...after the world\'s prepass, into the same target');
  assert(/const _vpv=vmScene\.overrideMaterial; vmScene\.overrideMaterial=_matAOGeo;/.test(fn)
      && /vmScene\.overrideMaterial=_vpv;/.test(fn),
    'and vmScene\'s own overrideMaterial is saved and restored, exactly as the world\'s is');
  assert(/renderer\.clearDepth\(\);          \/\/ same rule as the colour pass/.test(fn),
    'depth is cleared for it here too, so the weapon is in front in the G-buffer as well');
  // it must sit INSIDE the AO gate, so it costs nothing when AO is off or the quality ladder dropped it
  const gate = fn.indexOf('if(_geoWant){'), bloom = fn.indexOf('_matBloomDown');   // build 1218: the viewmodel G-buffer pass lives in the PREPASS block now
  assert(gate >= 0 && i > gate && i < bloom, 'the extra pass is inside the G-buffer prepass block, so it disappears when the prepass is shed');
  // build 1218: the gate SPLIT — the prepass (which the viewmodel + soft particles need) runs on the top 3
  // rungs; the AO SAMPLE stays on rung 0. Build 1135's "AO below MSAA" intent is preserved in _aoWant.
  assert(/const _geoWant = _ssaoAmt > 0\.001 && _prStepI <= _AO_GEO_MAXSTEP && _aoGeoRT && cam && cam\.isPerspectiveCamera;/.test(fn) &&
    /const _aoWant = _geoWant && _prStepI === 0;/.test(fn),
    'the AO SAMPLE still gates on rung 0 (below MSAA), while its G-buffer is wider');
}
{
  // The G-buffer packs a VIEW DISTANCE, and the AO shader rebuilds view rays from a tan-of-fov scale
  // taken from the MAIN camera. That is only valid for the weapon because vmCam tracks the main
  // camera's fov and aspect — if that ever stops being true, the weapon's AO silently goes wrong.
  assert(/vmCam\.fov = camera\.fov; vmCam\.aspect = camera\.aspect; vmCam\.updateProjectionMatrix\(\);/
    .test(extractFunction('_drawViewmodel')), 'vmCam matches the main camera\'s fov and aspect every frame');
  assert(/vAoZ = -mvPosition\.z;/.test(src), 'the G-buffer stores a raw view distance, which is camera-agnostic');
  assert(/const _t=Math\.tan\(cam\.fov\*Math\.PI\/360\); au\.uProjScale\.value\.set\(_t\*cam\.aspect, _t\);/.test(src),
    '...and the AO shader\'s ray scale comes from that same fov');
}

// ---------------------------------------------------------------- the default level has a look again
{
  assert(!/if\(!\(savedLevel && savedLevel\.world\)\) _postOffWorld\(worldCfg\);/.test(src),
    'the first-time scene is no longer stripped of every post effect');
  // but an EMPTY scene still is — that is build 796's real intent, and it is a different case
  const ws = extractFunction('_wipeSceneCore');
  assert(/_postOffWorld\(worldCfg\); if\(typeof applyWorldCfg==='function'\) applyWorldCfg\(\);/.test(ws),
    'Delete all objects still gives a clean slate with the effects off');
  // the values the default level now renders with are DEFAULT_WORLD's authored ones
  const dw = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
  for (const [k, min] of [['postBloom', 0.1], ['postVig', 0.1], ['ssao', 0.1], ['postGrain', 0.01]]) {
    const m = dw.match(new RegExp(k + ':\\s*([\\d.]+)'));
    assert(m, 'DEFAULT_WORLD sets ' + k);
    assert(+m[1] >= min, k + ' is a real value (' + m[1] + '), so the default level actually shows the system it drives');
  }
  // executable: the helper still zeroes what it always zeroed, for the cleared-scene path
  const po = new Function(extractFunction('_postOffWorld') + '; return _postOffWorld;')();
  const w = po({ postBloom: 0.65, postMotion: 0.62, postVig: 0.42, postGrain: 0.05, postSat: 1.08, postCon: 1.05, ssao: 0.9 });
  for (const k of ['postBloom', 'postMotion', 'postVig', 'postGrain', 'ssao']) eq(w[k], 0, k + ' zeroed for an empty scene');
  eq(w.postSat, 1, 'saturation neutral'); eq(w.postCon, 1, 'contrast neutral');
  eq(po(null), null, 'null-safe');
}

done('build 1140: the weapon is drawn inside the post chain and the AO G-buffer, and the designed default level ships with the engine\'s look');
