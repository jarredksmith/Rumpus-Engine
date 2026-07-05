// (build 872) DESKTOP ALIASING FIX — user report: "Is there some sort of aliasing happening on edges
// and shapes? It doesn't look as clean on desktop as it used to." → confirmed: "It was post processing."
// The canvas is created antialias:true, but with Visual effects ON the scene rasterizes into _postRT —
// a plain render target with ZERO antialiasing — so canvas MSAA never applied. Fix: 4x multisample on
// that one target (WebGL2). Companion fix: adaptive resolution (on-by-default since 810) gets a real
// settings checkbox instead of a localStorage-only escape hatch.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

// ---- the MSAA fix itself ----
assert(/function _desiredPostSamples\(\)\{\s*\n\s*if\(!\(renderer\.capabilities && renderer\.capabilities\.isWebGL2\)\) return 0;/.test(src) && /_postRT\.samples = _desiredPostSamples\(\);/.test(src),
  'the post-FX scene target is 4x multisampled on WebGL2 (build 880: only at the full-res step)');
// it must land inside ensurePost, AFTER the target exists and BEFORE the pass materials
assert(/_postRT=mkRT\(w,h\); _bloomRT=mkRT\(hw,hh\); _compRT=mkRT\(w,h\); _afterA=mkRT\(w,h\); _afterB=mkRT\(w,h\);[\s\S]{0,900}_postRT\.samples = _desiredPostSamples\(\);/.test(src),
  'samples set at target creation inside ensurePost');
// ONLY the scene pass is multisampled — the quad passes draw no geometry, and the DoF target carries a
// DepthTexture (can't be multisampled in r149). Exactly one `.samples =` assignment exists.
const sampleAssigns = src.match(/_postRT\.samples = _desiredPostSamples\(\)/g) || [];
assert(sampleAssigns.length === 1, `exactly one render target is multisampled (got ${sampleAssigns.length})`);
assert(!/_bloomRT\.samples|_compRT\.samples|_afterA\.samples|_afterB\.samples|_dofRT\.samples/.test(src),
  'quad-pass and depth-texture targets stay single-sample');
// the canvas itself still asks for MSAA (the effects-off path)
assert(/new THREE\.WebGLRenderer\(\{ antialias: true, powerPreference: 'high-performance' \}\)/.test(src),
  'canvas MSAA unchanged for the effects-off path');

// ---- adaptive resolution: a visible switch ----
assert(/<input type="checkbox" id="adaptResCb"> Adaptive resolution \(trades sharpness for fps\)/.test(html),
  'settings checkbox exists next to Visual effects');
assert(/const arc=document\.getElementById\('adaptResCb'\); if\(arc\)\{ arc\.checked=_adaptOn;/.test(src),
  'checkbox reflects the live state');
assert(/localStorage\.setItem\('breach_adaptres', _adaptOn\?'on':'off'\)/.test(src),
  'persists to the same key build 810 introduced (existing opt-outs keep working)');
assert(/if\(!_adaptOn\)\{ _prStepI=0; _prScale=1; _applyPixelRatio\(\); \/\* build 883[^*]*\*\/ _msaaOn=true; _msaaFails=0; \}/.test(src),
  'turning it OFF snaps back to full resolution immediately (build 883: and re-arms MSAA)');

done('build 872: post-FX keeps MSAA (4x scene target) + adaptive resolution is a real setting');
