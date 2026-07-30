// build 1177: your own .glb no longer needs their server.
//
// The editor critic, verified: there was no local model path AT ALL — no drag-and-drop, no file input; the
// only way in was a POST to the community PHP host, so offline (or server down) a creator could not use
// their own asset, period. A dropped .glb/.gltf now lives in IndexedDB keyed by content hash, and a
// `local:` src scheme resolves it through the SAME GLTFLoader/manager path as every other model. The src
// string serialises like any other; on another device the load fails cleanly into build 1167's Level Check
// report, and the Level Check warns that local models are this-device-only before the creator shares.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the scheme is a first-class citizen
{
  const ims = extractFunction('isModelSrc');
  assert(/sketchfab:\|local:/.test(ims), 'isModelSrc recognises local: — cache accounting, part editing, model release all follow');
  assert(/if\(url && url\.indexOf\('local:'\)===0\)\{ _loadLocalModel\(url, \(gltf\)=>\{ gltfCache\[url\]=gltf; _cb\(gltf\); \}, _ec\); return; \}/.test(src),
    'loadGLTFCached branches to the local loader BESIDE the sketchfab: branch — same cache, same waiter/pump machinery');
  const llm = extractFunction('_loadLocalModel');
  assert(/new THREE\.GLTFLoader\(gltfManager\(\)\)/.test(llm),
    'the local parse uses the SAME manager — KTX2/meshopt codecs and URL modifiers still apply');
  assert(/local model not on this device/.test(llm),
    'a missing blob (level opened on another device) fails with a message 1167 can surface, not a hang');
}

// ---------------------------------------------------------------- the importer
{
  const im = extractFunction('_importLocalModel');
  assert(/LOCAL_MODEL_MAX_MB\*1024\*1024/.test(im), 'a size cap exists (' + src.match(/const LOCAL_MODEL_MAX_MB = (\d+)/)[1] + 'MB)');
  assert(/crypto\.subtle\.digest\('SHA-256', buf\)/.test(im),
    'the key is a CONTENT hash — importing the same file twice reuses one stored blob');
  assert(/hex='f'\+Date\.now\(\)\.toString\(36\)/.test(im),
    '...with a time-key fallback where subtle crypto is unavailable (http origins)');
  assert(/key=hex\+'\/'\+String\(file\.name\)\.slice\(0,60\)/.test(im),
    '...and the filename rides the key, so the asset browser shows a name instead of a hash');
  assert(/addSceneProp\(src, \{ name:file\.name/.test(im), 'import places the prop through the normal add path');
  assert(/this device only/.test(im), 'and the success toast says the sharing caveat out loud');
}

// ---------------------------------------------------------------- the drop target and the lint
{
  assert(/renderer\.domElement\.addEventListener\('dragover', \(e\)=>\{ if\(typeof editorOpen!=='undefined' && editorOpen\)\{ e\.preventDefault\(\); \} \}\);/.test(src),
    'dragover is claimed only while EDITING — play mode never hijacks a drag');
  const drop = src.match(/renderer\.domElement\.addEventListener\('drop',[\s\S]{0,500}?\}\);/)[0];
  assert(/\/\\\.\(glb\|gltf\)\$\/i\.test\(x\.name\)/.test(drop), 'only model files are taken from the drop');
  assert(/if\(!f\) return;/.test(drop), '...a folder or image drop falls through to the browser untouched');
  assert(/local to this device \(drag-and-drop import\)/.test(src),
    'the Level Check warns before a creator shares a level with device-local models');
}

// ---------------------------------------------------------------- the IDB wrapper
{
  assert(/indexedDB\.open\('rumpus_local_models',1\)/.test(src), 'blobs live in their own IDB database');
  const put = extractFunction('_localModelPut'), get = extractFunction('_localModelGet');
  assert(/put\(blob, key\)/.test(put) && /objectStore\('models'\)\.get\(key\)/.test(get), 'put/get are keyed blob operations');
  assert(/rq\.onsuccess=\(\)=>res\(rq\.result\|\|null\)/.test(get), 'a miss resolves null (handled upstream), never rejects the chain');
}

done('build 1177: drag a .glb onto the viewport while editing — content-hashed into IndexedDB, resolved by a local: scheme through the same loader/codec path as every model, size-capped, named in the key, cleanly failing on other devices, with the Level Check saying "upload before sharing"');
