// (build 945) CANCELLABLE + ONE-AT-A-TIME editor downloads. The loading pill gains a "✕ Cancel"
// button that truly ABORTS the stream: .glb main files now download via fetch + AbortController
// (GLTFLoader.load's XHR can't abort) and parse through the same loader/manager so codecs and the
// proxy URL-modifier still apply; Sketchfab archives get the signal threaded through both fetches.
// A cancel is final (never retried), waiters get errcb('cancelled'), and nothing lands in the cache.
// While the editor is open the download pump runs strictly ONE at a time — a second pick queues.
// Verified live: a normal .glb still loads through the new path; cancelling a throttled download
// dropped pending to 0 with errcb 'cancelled', hid the bar and cached nothing; with two slow
// downloads requested, _glbActive stayed 1 while both were pending.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// cancel machinery
assert(/function cancelGLBDownload\(u\)\{ _glbCancel\[u\]=true; const ac=_glbAborters\[u\]; if\(ac\)\{ try\{ ac\.abort\(\); \}catch\(e\)\{\} \} \}/.test(src),
  'cancelGLBDownload marks the url and aborts the controller');
const lg = extractFunction('loadGLTFCached', src);
assert(/if\(_glbCancel\[url\] \|\| \(e && e\.name==='AbortError'\) \|\| \/cancelled\/i\.test\(_m\)\)\{ _cxl\(\); return; \}/.test(lg),
  'a cancel is final — the retry ladder never resurrects it');
assert(/const _cxl=\(\)=>\{ delete _glbCancel\[url\]; _done\(\); _release\(\); for\(const w of waiters\)\{ try\{ w\.errcb && w\.errcb\(new Error\('cancelled'\)\); \}catch\(_\)\{\} \} \};/.test(lg),
  'every waiter hears the cancel');
assert(/if\(_glbCancel\[url\]\)\{ _cxl\(\); return; \}   \/\/ build 945: cancelled while still queued/.test(lg),
  'cancelling a QUEUED download works too');

// true abort: .glb downloads via fetch + AbortController, parsed with the same loader/manager
assert(/const fetchUrl = mgr \? mgr\.resolveURL\(url\) : proxied\(url\);/.test(lg), 'proxy semantics preserved (manager URL-modifier / proxied fallback)');
assert(/const ac=new AbortController\(\); _glbAborters\[url\]=ac;/.test(lg) && /fetch\(fetchUrl, \{ signal: ac\.signal \}\)/.test(lg),
  '.glb main files stream through an abortable fetch');
assert(/_mkGLTFLoader\(mgr\|\|undefined\)\.parse\(buf, base,/.test(lg), 'the buffer parses through the codec-equipped loader');
assert(/loadSketchfabModel\(url\.slice\(10\), \(gltf\)=>\{ gltfCache\[url\]=gltf; _cb\(gltf\); \}, _ec, _ac\.signal\)/.test(lg),
  'sketchfab downloads carry the abort signal');
assert(/function loadSketchfabModel\(uid, cb, errcb, signal\)\{/.test(src) && /function _sfFetchArchive\(z, progKey, signal\)\{/.test(src),
  'the signal threads through the sketchfab api call and the archive stream');

// serial in the editor + the button
assert(/const cap=\(typeof editorOpen!=='undefined' && editorOpen\) \? 1 : GLB_MAX_CONCURRENT;/.test(src),
  'editor downloads run one at a time (level loads keep their concurrency)');
assert(/btn\.textContent='\\u2715 Cancel';/.test(src) && /for\(const u in _glbWaiters\)\{ cancelGLBDownload\(u\); n\+\+; \}/.test(src),
  'the loading pill has the Cancel button and it cancels everything in flight');

done('build 945: downloads cancel for real (streamed .glb + sketchfab aborts) and run one at a time in the editor');
