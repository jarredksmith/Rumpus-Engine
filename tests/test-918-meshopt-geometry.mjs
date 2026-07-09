// (build 918) The same optimized GLBs that use KTX2 textures (build 917) often also use meshopt
// geometry compression (EXT_meshopt_compression) — a separate codec. After KTX2 was fixed, such a model
// then threw "THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files" and
// still fell back to a capsule. The MeshoptDecoder is now wired the same lazy way as KTX2: attached in
// _mkGLTFLoader, fetched on the first "setMeshoptDecoder" error via _ensureMeshopt, then retried. The
// decoder module is self-contained (no `three` import) so it loads straight from jsdelivr/unpkg.
// Verified live (headless): _ensureMeshopt exists, the factory attaches setMeshoptDecoder, a normal GLB
// still loads, and a synthetic meshopt error routes through _ensureMeshopt and retries.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// factory attaches BOTH decoders
const mk = extractFunction('_mkGLTFLoader', src);
assert(/setKTX2Loader\(_ktx2Loader\)/.test(mk), 'factory still registers the KTX2 loader');
assert(/setMeshoptDecoder\(_meshoptDecoder\)/.test(mk), 'factory registers the meshopt decoder');

// lazy meshopt fetch: self-contained module from jsdelivr/unpkg, awaits .ready, cached once
const ens = extractFunction('_ensureMeshopt', src);
assert(/meshopt_decoder\.module\.js/.test(ens), 'meshopt decoder module fetched');
assert(/jsdelivr/.test(ens) && /unpkg/.test(ens), 'two CDN sources for resilience');
assert(/MeshoptDecoder/.test(ens), 'the MeshoptDecoder export is picked up');
assert(/if\(_meshoptPromise\) return _meshoptPromise/.test(ens), 'the decoder is fetched at most once');
assert(/D\.ready/.test(ens), 'the decoder is awaited ready before use');

// loadGLTFCached error handler: a meshopt error pulls the decoder in and retries, guarded separately from KTX2
const lg = extractFunction('loadGLTFCached', src);
assert(/setMeshoptDecoder/.test(lg) && /_meshoptRetried/.test(lg) && /_ensureMeshopt\(\)\.then\(/.test(lg),
  'the meshopt error pulls the decoder in and retries (its own one-shot guard)');
assert(/_ktx2Retried/.test(lg) && /_ensureKTX2\(\)\.then\(/.test(lg),
  'the KTX2 branch is still present — a model can need both codecs and gets two sequential retries');

done('build 918: meshopt-compressed models load instead of falling back to a capsule');
