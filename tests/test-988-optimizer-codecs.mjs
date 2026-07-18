// (build 988) OPTIMIZER CODECS + 12 MB MODEL CAP. Two upgrades to the mobile bake:
// READ side — a draco/meshopt decoder registers into gltf-transform so models that arrive already
// compressed can be repacked (they used to fail with "a compression we can't repack yet").
// WRITE side — the output GLB packs with EXT_meshopt_compression (60-90% smaller geometry); the
// game's runtime loader has decoded that extension since build 918 (auto-retry pulls the decoder),
// so published levels load it on every machine. Both codecs are best-effort: if a CDN fails, the
// bake still runs uncompressed. Plus: the model upload cap rises 8 -> 12 MB, client and server.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// ---- the codec loader: lazy, dual-CDN, never fatal ----
assert(/function _ensureGlbCodecs\(\)\{/.test(src), '_ensureGlbCodecs exists');
assert(/out\.meshoptDecoder = await _ensureMeshopt\(\);/.test(src), 'reuses the build-918 meshopt decoder loader (one decoder for game + optimizer)');
assert(/meshopt_encoder\.module\.js/.test(src) && /'https:\/\/cdn\.jsdelivr\.net\/npm\/meshoptimizer@0\.20\.0\/meshopt_encoder\.module\.js',\s*\n\s*'https:\/\/unpkg\.com\/meshoptimizer@0\.20\.0\/meshopt_encoder\.module\.js'/.test(src),
  'the meshopt encoder loads from two CDNs at the same pinned version as the decoder');
assert(/import\('https:\/\/esm\.sh\/draco3dgltf@1\.5\.7'\)/.test(src), 'the draco decoder factory loads from esm.sh, pinned');
assert(/fetch\('https:\/\/cdn\.jsdelivr\.net\/npm\/draco3dgltf@1\.5\.7\/draco_decoder_gltf\.wasm'\)/.test(src) && /createDecoderModule\(\{ wasmBinary:wasm \}\)/.test(src),
  'the draco wasm is fetched explicitly and injected (relative wasm lookups fail cross-CDN)');
assert(/\}catch\(e\)\{ \/\* draco inputs will still report "can't repack" \*\/ \}/.test(src),
  'a failed draco load degrades to the old friendly error, never breaks the bake');

// ---- the bake registers what loaded and packs the output ----
assert(/const codecs=await _ensureGlbCodecs\(\);/.test(src), 'the bake pulls the codecs');
assert(/if\(codecs\.dracoDecoder\) deps\['draco3d\.decoder'\]=codecs\.dracoDecoder;/.test(src)
    && /if\(codecs\.meshoptDecoder\) deps\['meshopt\.decoder'\]=codecs\.meshoptDecoder;/.test(src)
    && /if\(codecs\.meshoptEncoder\) deps\['meshopt\.encoder'\]=codecs\.meshoptEncoder;/.test(src)
    && /io\.registerDependencies\(deps\);/.test(src),
  'only the codecs that actually loaded are registered (missing ones degrade, not throw)');
assert(/if\(codecs\.meshoptEncoder && GT\.funcs\.meshopt\) passes\.push\(GT\.funcs\.meshopt\(\{ encoder:codecs\.meshoptEncoder \}\)\);/.test(src),
  'meshopt packing is the LAST pass, only when the encoder is up');
assert(/passes\.push\(prune\(\)\);\s*\n\s*if\(codecs\.meshoptEncoder/.test(src), 'pack runs after prune (compress the final geometry, not the junk)');

// ---- the game can LOAD what the optimizer now writes (the build-918 retry path) ----
assert(/setMeshoptDecoder/.test(src) && /_meshoptRetried=true;[\s\S]{0,120}_ensureMeshopt\(\)\.then/.test(src),
  'a meshopt-compressed model triggers the runtime decoder fetch + retry (build 918) — players can load packed output');

// ---- caps: client 12 MB, server default matches ----
assert(/const UPLOAD_MAX = \{ model:12, texture:4, sound:4 \};/.test(src), 'client model cap is 12 MB');
{
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const php = readFileSync(path.resolve(dir, '..', 'server', 'api', 'upload.php'), 'utf8');
  assert(/getenv\('RUMPUS_MODEL_MAX'\) \?: 12582912/.test(php), 'server model cap default is 12 MB (12582912 bytes)');
  assert(12582912 === 12*1024*1024, 'the byte constant really is 12 MiB');
  const readme = readFileSync(path.resolve(dir, '..', 'server', 'README.md'), 'utf8');
  assert(/post_max_size/.test(readme) && /12 MB/.test(readme), 'README tells the operator to raise post_max_size to the new cap');
}

done('build 988: draco/meshopt codecs in the bake + 12 MB model uploads');
