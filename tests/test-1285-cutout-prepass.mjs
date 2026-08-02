import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1285: the rendering audit's third finding, and the SIXTH arrival of build 1152's rule.
//
// A glTF `alphaMode:MASK` material arrives from GLTFLoader as OPAQUE — transparent:false, depthWrite:true —
// with the cutout expressed as `alphaTest`. So both of _aoHideNoDepth's tests passed it. But the prepass
// runs under `scene.overrideMaterial`, which REPLACES the material and with it the alpha test, so every
// grass blade, leaf card, fence and grate stamped its full RECTANGLE into the AO, SSR and velocity buffers
// as solid geometry. The level generator emits exactly this for foliage (alphaMode 'MASK', cutoff 0.32),
// so a garden arena wrote a field of solid quads into the buffer that decides where the frame is dark.

const pred = new Function(extractFunction('_aoNoDepthMat') + '; return _aoNoDepthMat;')();

{ // the three classes that must stay out of a depth-derived buffer
  eq(pred({ depthWrite: false }), true, 'the sky dome / weather points (1126)');
  eq(pred({ transparent: true }), true, 'the flipbook sprites (1152) and the muzzle flash (1158)');
  eq(pred({ alphaTest: 0.32 }), true, 'THE NEW ONE: a cutout leaf card, opaque by both older tests');
  eq(pred({ alphaTest: 0.5, transparent: false, depthWrite: true }), true,
    '...even when it declares itself fully opaque, which is exactly what GLTFLoader produces for MASK');
}
{ // and ordinary geometry still goes in — the viewmodel's own occlusion is build 1140's whole point
  eq(pred({ depthWrite: true, transparent: false }), false, 'a normal opaque material belongs in the buffer');
  eq(pred({ alphaTest: 0 }), false, 'alphaTest 0 is not a cutout');
  eq(pred({}), false, 'a bare material is opaque');
  eq(pred({ alphaTest: undefined }), false, 'an unset alphaTest does not read as a cutout');
  eq(pred(null), false, 'a null slot never throws');
  eq(pred(undefined), false);
}
{ // one offending slot in a multi-material array is still enough — the object is drawn or it is not
  const fn = extractFunction('_aoHideNoDepth');
  assert(/for\(let i=0;i<m\.length;i\+\+\)\{ if\(_aoNoDepthMat\(m\[i\]\)\)\{ bad=true; break; \} \}/.test(fn),
    'the array path asks the same predicate and stops at the first offender');
  assert(/else bad = _aoNoDepthMat\(m\);/.test(fn), '...and so does the single-material path');
  assert(/if\(!o\.visible\) return;/.test(fn),
    'already-invisible objects are still not collected, or the restore would switch them ON (1152)');
}
{ // BUILD 1168'S OPTIMISATION IS NOT UNDONE. The first draft declared the predicate inside the traverse
  // callback, which allocates one closure per OBJECT across two scenes every frame — precisely the
  // transient 1168 measured and removed. It is one module-scope function now.
  const fn = extractFunction('_aoHideNoDepth');
  assert(!/=>/.test(fn.slice(fn.indexOf('root.traverse(o=>{') + 18)),
    'no closure is allocated inside the traverse');
  assert(/^function _aoNoDepthMat\(q\)\{/.test(extractFunction('_aoNoDepthMat').trim()),
    'the predicate is a module-scope function declaration, defined once for the process');
  assert(/build 1168/.test(fn), 'and 1168’s reasoning is still recorded where it applies');
}
{ // both G-buffer callers share it — 1158's lesson was that a rule applied in one caller is not a rule
  // FOUR call sites plus the definition: the AO G-buffer sweeps the world scene and the viewmodel scene,
  // and so does the velocity pass. That is more thorough than 1158 left it, and all four share this one
  // predicate — which is the property that matters, since 1158's lesson was that a rule applied in one
  // caller is not a rule.
  eq((src.match(/_aoHideNoDepth\(/g) || []).length, 5, 'defined once, called by all four prepass renders');
  const _fn = extractFunction('_aoHideNoDepth');
  eq((src.match(/_aoHideNoDepth\(scn,/g) || []).length, 2, '...the world scene, for both the AO and velocity buffers');
  eq((src.match(/_aoHideNoDepth\(vmScene,/g) || []).length, 2, '...and the viewmodel scene for both (build 1158)');
}
{ // the trade is stated rather than left for someone to discover
  assert(/a cutout surface now contributes no AO, SSR or velocity of its own/.test(src),
    'the cost of the fix is written down');
  assert(/A missing occluder is a far smaller error than a solid rectangle where a leaf is/.test(src),
    '...along with why it is the right trade');
  assert(/SIXTH arrival of build 1152's rule/.test(src),
    'and the recurrence is counted, because five namings did not stop the sixth');
}

done('build 1285: alpha-tested cutouts stay out of the depth-derived prepasses — a glTF MASK material is opaque by every older test, and the override material discards its alpha test, so every leaf card was writing its full rectangle into the AO, SSR and velocity buffers; the predicate now asks whether the override material can represent the object at all, and is a module-scope function so build 1168’s per-object closure does not come back');
