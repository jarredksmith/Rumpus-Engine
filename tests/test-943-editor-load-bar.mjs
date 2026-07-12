// (build 943) EDITOR LOADING BAR — picking a Sketchfab / Poly Pizza model loaded in silence (tens
// of MB sometimes): the preview just popped in whenever. Now loadGLTFCached feeds a byte-progress
// tracker (_glbProg) from GLTFLoader's onProgress, the Sketchfab archive fetch STREAMS through a
// reader so zips report bytes too, and while the editor is open with any GLB in flight a themed
// pill (top-center) shows "Loading model — 42% (3.2 / 7.6 MB)" with a real fill bar — or a dim
// indeterminate fill when the server sends no size. Hides the moment everything lands.
// Verified live against a throttled 7.3 MB download: the pill appeared ("Downloading model…"
// before the first sized event), climbed 21% -> 62% -> 88% -> 99% with MB counts, and hid on done.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the tracker: fed by the loader, cleaned on completion
assert(/const _glbProg = Object\.create\(null\);/.test(src), 'byte-progress tracker exists');
assert(/delete _glbWaiters\[url\]; delete _glbProg\[url\]; \};/.test(src), 'progress entries are cleaned up when a load finishes');
assert(/const _prog=\(ev\)=>\{ if\(!ev\) return; _glbProg\[url\]=\{ l:ev\.loaded\|\|0, t:\(ev\.total && ev\.total>=\(ev\.loaded\|\|0\)\)\?ev\.total:0 \}; \};/.test(src),
  'GLTFLoader progress events feed it (total 0 = unknown size)');
assert(/\.load\(url, \(gltf\)=>\{ gltfCache\[url\]=gltf; _cb\(gltf\); \}, _prog, _ec\);/.test(src) &&
       /\.load\(proxied\(url\), \(gltf\)=>\{ gltfCache\[url\]=gltf; _cb\(gltf\); \}, _prog, _ec\);/.test(src),
  'both loader paths report progress (no more undefined)');

// sketchfab zips stream so they report bytes too
const sf = extractFunction('_sfFetchArchive', src);
assert(/r\.body\.getReader\(\)/.test(sf) && /content-length/.test(sf), 'the archive fetch streams with a reader and reads content-length');
assert(/_glbProg\[progKey\]=\{ l:got, t:\(total>=got\)\?total:0 \};/.test(sf), 'streamed bytes feed the tracker under the sketchfab: key');
assert(/_sfFetchArchive\(z, 'sketchfab:'\+uid\)/.test(src), 'loadSketchfabModel passes its cache key as the progress key');

// the pill: editor-only, percentage + MB when sized, indeterminate otherwise, self-hiding
assert(/el\.id='edLoadBar';/.test(src), 'the pill element exists');
assert(/\(typeof editorOpen!=='undefined' && editorOpen\) && _glbPending>0;/.test(src), 'shown only while the editor has loads in flight');
assert(/'Loading model'\+\(n>1\?'s \('\+n\+'\)':''\)\+' \\u2014 '\+pct\+'% \('\+mb\(l\)\+' \/ '\+mb\(t\)\+' MB\)'/.test(src),
  'sized downloads show percent + MB');
assert(/'Downloading model'\+\(n>1\?'s \('\+n\+'\)':''\)\+'\\u2026'/.test(src), 'unknown sizes show an indeterminate state');

done('build 943: editor model downloads show a live loading bar — percent + MB, streams Sketchfab zips, self-hiding');
