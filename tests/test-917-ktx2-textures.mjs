// (build 917) GLBs whose textures are KTX2/Basis-compressed (KHR_texture_basisu — common on Sketchfab
// downloads and optimized avatars) threw "THREE.GLTFLoader: setKTX2Loader must be called" and the model
// fell back to a capsule, because no KTX2Loader was ever registered. Now a central _mkGLTFLoader()
// factory attaches a lazily-fetched KTX2Loader to every loader, loadGLTFCached routes the KTX2 error to
// _ensureKTX2 + a retry, and if the transcoder CDN is unreachable the inlined loader skips the texture
// (untextured geometry) instead of throwing all the way to a capsule.
// Verified live (headless): _mkGLTFLoader/_ensureKTX2 exist, _mkGLTFLoader() yields a working loader, a
// normal GLB still loads (1 mesh, no regression), and a synthetic KTX2 error routes through _ensureKTX2
// and retries across every load site.
import { gameSource, html, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the factory: builds a GLTFLoader and attaches the KTX2 loader when we have one
const mk = extractFunction('_mkGLTFLoader', src);
assert(/new THREE\.GLTFLoader\(mgr\)/.test(mk) && /new THREE\.GLTFLoader\(\)/.test(mk), 'factory constructs with/without a manager');
assert(/setKTX2Loader\(_ktx2Loader\)/.test(mk), 'factory registers the KTX2 loader');

// the lazy transcoder pull: esm.sh module + jsdelivr basis transcoder + detectSupport against the renderer
const ens = extractFunction('_ensureKTX2', src);
assert(/esm\.sh\/three@0\.149\.0\/examples\/jsm\/loaders\/KTX2Loader\.js/.test(ens), 'KTX2Loader imported from esm.sh (resolves its bare `three` import)');
assert(/setTranscoderPath\(/.test(ens) && /libs\/basis\//.test(ens), 'Basis transcoder path set');
assert(/detectSupport\(renderer\)/.test(ens), 'transcode target detected against the live renderer');
assert(/window\.__KTX2_UNAVAILABLE\s*=\s*true/.test(ens), 'unreachable CDN flags KTX2 as unavailable (graceful untextured fallback)');
assert(/_ktx2Promise\s*=/.test(ens) && /if\(_ktx2Promise\) return _ktx2Promise/.test(ens), 'the transcoder is fetched at most once (cached promise)');

// loadGLTFCached error handler: a KTX2 error triggers the fetch + retry exactly once
const lg = extractFunction('loadGLTFCached', src);
assert(/setKTX2Loader/.test(lg) && /_ktx2Retried/.test(lg) && /_ensureKTX2\(\)\.then\(/.test(lg),
  'the KTX2 error pulls the transcoder in and retries (guarded to one retry)');

// every construction site goes through the factory — no bare `new THREE.GLTFLoader` left in the load paths
assert(/_mkGLTFLoader\(mgr\)\.load\(url,/.test(lg) && /_mkGLTFLoader\(\)\.load\(proxied\(url\)/.test(lg),
  'both main load sites use the factory');
const sf = extractFunction('loadSketchfabModel', src);
assert(/_mkGLTFLoader\(mgr\)\.load\(blobs\[main\]/.test(sf), 'the Sketchfab archive path uses the factory too');

// the inlined GLTFLoader (a separate <script>, so check the full HTML): the required-extension throw is
// bypassed once KTX2 is flagged unavailable, so geometry still loads untextured
assert(/indexOf\( this\.name \) >= 0 && ! \( typeof window !== 'undefined' && window\.__KTX2_UNAVAILABLE \)/.test(html),
  'inlined loader skips the required KTX2 texture (untextured) instead of throwing when no transcoder is available');

done('build 917: KTX2/Basis-textured models load instead of falling back to a capsule');
