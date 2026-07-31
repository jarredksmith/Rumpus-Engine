// build 1199: the HDRI sky leaves the AO G-buffer — the AE+AO flashing.
//
// Reported from play, refining the 1198 report: auto-exposure behaves until ambient occlusion is turned
// up, then the (HDRI) sky flickers badly. The mechanism is the 1152 rule arriving by a FIFTH door:
// `scene.background` is not a scene object — `overrideMaterial` never replaces it and the visibility
// sweep (`_aoHideNoDepth`) cannot see it — so an HDRI sky (a background TEXTURE; the procedural dome
// nulls the background) rendered its tone-mapped colours straight into the half-res G-buffer. Those
// colours pass the geometric "is there geometry here" test (packed-normal channel sum >= 0.63) and carry
// an alpha SSAO reads as a surface about a unit from the camera, so the entire sky was shaded as a wall —
// and because the background pass tone-maps with toneMappingExposure (pinned below), every easing step of
// auto-exposure REWROTE that garbage. AE modulated the garbage; AO made it visible. The prepass now nulls
// scn.background for the G-buffer renders and restores it after, exactly as it already hides the dome.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

// ---------------------------------------------------------------- the premise, against the real three build
{
  assert(/tonemapping_fragment/.test(THREE.ShaderLib.backgroundCube.fragmentShader),
    'the background pass tone-maps in this three build — so its G-buffer garbage CHANGES whenever auto-exposure eases, which is why the artifact pulsed with AE instead of sitting still');
  assert(!('background' in new THREE.Scene().children),
    'scene.background is a property, not a child — no visibility sweep over children can ever reach it, which is why the fix must be a save/null/restore rather than another _aoHideNoDepth case');
}

// ---------------------------------------------------------------- the ordering, in the real prepass
{
  const fn = extractFunction('_renderPostFX');
  const saveI = fn.indexOf('const _bgV=scn.background; scn.background=null;');
  const geoI = fn.indexOf('renderer.setRenderTarget(_aoGeoRT); renderer.render(scn, cam);');
  const vmI = fn.indexOf('renderer.render(vmScene, vmCam);');
  const restI = fn.indexOf('scn.background=_bgV;');
  const aoFeedI = fn.indexOf('au.tGeo.value=_aoGeoRT.texture;');
  assert(saveI >= 0 && geoI >= 0 && restI >= 0 && vmI >= 0 && aoFeedI >= 0, 'all five landmarks exist in _renderPostFX');
  assert(saveI < geoI, 'the background is saved and NULLED before the G-buffer scene render — nothing but real geometry reaches the buffer');
  assert(restI > vmI, '...and restored only after BOTH G-buffer renders (the viewmodel pass draws into the same buffer)');
  assert(restI < aoFeedI, '...but before the AO resolve passes, so the restore cannot be skipped by an early return further down');
  const skyHideI = fn.indexOf('_skyMesh.visible=false');
  assert(skyHideI >= 0 && Math.abs(saveI - skyHideI) < 1600,
    'the background null lives beside the dome hide — the two halves of "no sky of either kind in a depth-derived buffer" stay in one place');
}

// ---------------------------------------------------------------- the restore is unconditional within the gate
{
  const fn = extractFunction('_renderPostFX');
  const block = fn.slice(fn.indexOf('const _bgV=scn.background'), fn.indexOf('scn.background=_bgV;'));
  assert(!/return/.test(block), 'no return path exists between the null and the restore — an HDRI level cannot be left with a permanently black sky');
}

done('build 1199: the HDRI background is nulled for the AO G-buffer prepass and restored after both renders — the sky no longer enters a depth-derived buffer as fake geometry, so auto-exposure easing has no garbage to modulate and the reported AE+AO sky flashing is structurally gone; the tone-mapping premise that made it pulse is pinned against the real three build');
