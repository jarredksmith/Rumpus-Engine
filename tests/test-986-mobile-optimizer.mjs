// (build 986) BAKE-ONCE MOBILE MODEL OPTIMIZER. The runtime simplifier (build 917) decimates a heavy
// CHARACTER on every load but never shrinks the downloaded file or its textures — the two things that
// cost the most on a phone. This bakes a model once with gltf-transform (loaded on demand): decimate
// geometry to a triangle budget + shrink oversized textures, then re-host a slim .glb every player
// downloads. Exposed as a per-model "Optimize for mobile" button on the upload widget.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- the optimizer library loads on demand from a bare-import-rewriting CDN (like the KTX2 loader) ----
assert(/function _ensureGltfTransform\(\)\{/.test(src), '_ensureGltfTransform exists (lazy loader)');
assert(/const V='4\.4\.1';/.test(src), 'gltf-transform pinned to one version so esm dedupes core across the 3 packages');
assert(/'https:\/\/esm\.sh\/@gltf-transform', 'https:\/\/esm\.run\/@gltf-transform'/.test(src),
  'two bare-import-rewriting CDNs (esm.sh primary, esm.run fallback)');
assert(/import\(base\+'\/core@'\+V\), import\(base\+'\/functions@'\+V\), import\(base\+'\/extensions@'\+V\)/.test(src),
  'core + functions + extensions imported at the same version');

// ---- budgets mirror the mobile guidance ----
assert(/const MOBILE_TRI_BUDGET = 40000;/.test(src), 'per-model triangle budget = 40k');
assert(/const MOBILE_TEX_MAX {4}= 1024;/.test(src), 'texture edge cap = 1024 (the article guideline)');

// ---- the core bake: geometry passes + texture shrink + valid GLB round-trip ----
assert(/async function optimizeModelForMobile\(input, opts\)\{/.test(src), 'optimizeModelForMobile core exists');
assert(/new WebIO\(\)\.registerExtensions\(GT\.ext\.ALL_EXTENSIONS\)/.test(src),
  'reads arbitrary GLBs — all KHR extensions registered');
assert(/const passes=\[dedup\(\), weld\(\)\];/.test(src) && /passes\.push\(prune\(\)\)/.test(src),
  'geometry pipeline: dedup + weld … prune');
assert(/if\(S && before\.tris>triBudget\) passes\.push\(simplify\(\{ simplifier:S, ratio:Math\.max\(0\.01, triBudget\/before\.tris\), error:0\.05 \}\)\)/.test(src),
  'simplify only when over budget, ratio derived from the budget, using our meshopt simplifier (skin/UV-aware)');
assert(/const S=await _ensureSimplifier\(\);/.test(src), 'reuses the existing meshopt simplifier loader');
assert(/return \{ bytes:outBytes, before, after:\{ bytes:outBytes\.byteLength, tris:_docTriCount\(root\), tex:_texApproxBytes\(root\), texChanged \} \};/.test(src),
  'returns before/after stats alongside the slim bytes');

// ---- texture shrink: browser-canvas, image-only, alpha-preserving ----
assert(/if\(!\/\^image\\\/\(png\|jpeg\|webp\)\$\/\.test\(mime\|\|''\)\) return null;/.test(src),
  'only PNG/JPEG/WebP are canvas-shrinkable; KTX2/basis passes through untouched');
assert(/const hasAlpha=\(mime==='image\/png'\|\|mime==='image\/webp'\);/.test(src) && /const outMime=hasAlpha\?'image\/webp':'image\/jpeg';/.test(src),
  'alpha textures re-encode to WebP, opaque to JPEG (smallest)');
assert(/if\(m<=maxEdge\)\{ try\{ bmp\.close&&bmp\.close\(\); \}catch\(e\)\{\} return null; \}/.test(src), 'a texture already within the edge cap is left alone');

// ---- non-destructive re-host: fetch -> bake -> upload the slim copy as <name>-mobile.glb ----
assert(/async function _optimizeModelUpload\(url, name, say, done, quiet\)\{/.test(src), '_optimizeModelUpload glue exists (build 987: quiet flag for the scene sweep)');
assert(/const file=new File\(\[r\.bytes\], base\+'-mobile\.glb', \{ type:'model\/gltf-binary' \}\);/.test(src),
  'the slim copy uploads as <name>-mobile.glb (the original stays in My uploads)');
assert(/const d=await _uploadAsset\(file, 'model', say\);/.test(src), 'reuses the shared upload pipeline (server sniff + quota)');
assert(/if\(r\.after\.bytes >= r\.before\.bytes\*0\.97\)\{[^}]*Already lean/.test(src),
  'skips the re-upload when there is nothing to gain');

// ---- the per-model button, wired to whatever model is currently set ----
assert(/if\(type==='model'\)\{[\s\S]{0,400}Optimize for mobile/.test(src), 'the Optimize button is model-only');
assert(/_optimizeModelUpload\(curUrl\(\), _curName, say,/.test(src), 'the button optimizes the current model + swaps in the slim one');
assert(/getCurrentUrl:\(\)=>\{ const ni=editorEl && editorEl\.querySelector\('#edUrlInput'\); return \(ni&&ni\.value\)\|\|inp\.value\|\|''; \}/.test(src),
  'the model widget feeds its live URL to the Optimize button');

// ---- executable: the MB formatter the toast/status use ----
const fmt = extractFunction('_fmtMB', src);
const _fmtMB = new Function('return (' + fmt + ')')();
eq(_fmtMB(1048576), '1.0 MB', '1 MiB formats as 1.0 MB');
eq(_fmtMB(3.3*1048576), '3.3 MB', '3.3 MiB formats correctly');
eq(_fmtMB(0), '0.0 MB', 'zero bytes');

// ---- executable: the texture-shrink mime gate, isolated ----
const gate = (mime)=> /^image\/(png|jpeg|webp)$/.test(mime||'');
eq(gate('image/png'), true, 'png passes the gate');
eq(gate('image/jpeg'), true, 'jpeg passes');
eq(gate('image/webp'), true, 'webp passes');
eq(gate('image/ktx2'), false, 'ktx2 is skipped');
eq(gate(''), false, 'no mime is skipped');

done('build 986: bake-once mobile model optimizer');
