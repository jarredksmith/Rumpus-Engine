// build 1419: a locally imported model gets the codecs too.
//
// Reported from play: "I get this error on some model imports — THREE.GLTFLoader: No DRACOLoader instance
// provided." The word SOME is the tell. `_loadLocalModel` — build 1177's drag-and-drop import and 1348's
// picker — constructed a BARE `new THREE.GLTFLoader`, bypassing `_mkGLTFLoader`, which is the one function
// that attaches the three optional codecs: KTX2 (917), meshopt (918) and Draco (1256).
//
// So a locally imported model carrying any of the three failed, with no retry, surfacing three's own raw
// message. Sketchfab and most "optimize my glTF" pipelines emit Draco by default, which is exactly why it
// hits some imports and not others.
//
// TWO halves are needed and only one is the helper: the decoders are LAZY, so on the FIRST model that
// needs one there is nothing to attach yet. The hosted path solves that in `_ec` — read the codec named in
// the error, pull it in, retry — and this now does the same.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the retry, executed
//
// Driven with a fake loader whose parse fails a chosen number of times with a chosen message, so every
// branch is exercised without a network or a real .glb.
function rig(opts) {
  const log = [];
  let fails = opts.failTimes || 0;
  const mkLoader = () => ({
    parse(buf, path, ok, err) {
      log.push('parse');
      if (fails > 0) { fails--; err(new Error(opts.message)); return; }
      if (opts.alwaysFail) { err(new Error(opts.message)); return; }
      ok({ scene: { name: 'model' }, __buf: buf });
    }
  });
  const env = {
    _mkGLTFLoader: () => { log.push('mkGLTFLoader'); return mkLoader(); },
    gltfManager: () => ({}),
    _localModelGet: (k) => Promise.resolve(opts.missing ? null : { arrayBuffer: () => Promise.resolve('BYTES:' + k) }),
    _ensureDraco: () => { log.push('ensureDraco'); return opts.ensureThrows ? Promise.reject(new Error('offline')) : Promise.resolve(null); },
    _ensureKTX2: () => { log.push('ensureKTX2'); return Promise.resolve(null); },
    _ensureMeshopt: () => { log.push('ensureMeshopt'); return Promise.resolve(null); },
    Error,
  };
  const fn = new Function(...Object.keys(env), extractFunction('_loadLocalModel') + '; return _loadLocalModel;')(...Object.values(env));
  return new Promise((res) => {
    let done2 = false;
    const finish = (kind, v) => { if (done2) return; done2 = true; setTimeout(() => res({ kind, v, log }), 10); };
    fn('local:abc123/gun.glb', (g) => finish('ok', g), (e) => finish('err', (e && e.message) || String(e)));
  });
}

{
  const r = await rig({});
  eq(r.kind, 'ok', 'an ordinary local model loads');
  eq(r.v.__buf, 'BYTES:abc123/gun.glb', '...from its own IndexedDB blob, keyed past the local: prefix');
  assert(r.log.includes('mkGLTFLoader'),
    'and it is built through _mkGLTFLoader — the one function that attaches KTX2, meshopt and Draco. ' +
    'This is the whole defect: the site used a bare new THREE.GLTFLoader');
  eq(r.log.filter(x => x === 'parse').length, 1, '...parsed once, with no retry it did not need');
}

{
  // THE REPORTED CASE: the first Draco model. The decoder is lazy, so attaching what exists is not enough.
  const r = await rig({ failTimes: 1, message: 'THREE.GLTFLoader: No DRACOLoader instance provided.' });
  eq(r.kind, 'ok', 'a Draco-compressed local model loads after the decoder is pulled in');
  assert(r.log.includes('ensureDraco'), '...having read the codec out of three\'s own error message');
  eq(r.log.filter(x => x === 'parse').length, 2, '...and parsed exactly twice: the failure, then the retry');
  assert(r.log.indexOf('ensureDraco') < r.log.lastIndexOf('parse'),
    '...in that order — the decoder arrives before the retry, or the retry fails identically');
}

{
  // the other two codecs take the same road
  for (const [msg, call] of [['setKTX2Loader must be called before loading KTX2 textures', 'ensureKTX2'],
                             ['THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files', 'ensureMeshopt']]) {
    const r = await rig({ failTimes: 1, message: msg });
    eq(r.kind, 'ok', 'a local model needing ' + call + ' loads after the retry');
    assert(r.log.includes(call), '...through the right one');
  }
}

{
  // ONE SHOT per codec: a decoder that genuinely cannot help must report, not loop
  const r = await rig({ alwaysFail: true, message: 'THREE.GLTFLoader: No DRACOLoader instance provided.' });
  eq(r.kind, 'err', 'a model that still fails after the decoder arrives reports its failure');
  eq(r.log.filter(x => x === 'parse').length, 2, '...after exactly one retry, never a loop');
  eq(r.log.filter(x => x === 'ensureDraco').length, 1, '...and the decoder is fetched once');
}

{
  // a decoder fetch that rejects must not swallow the error
  const r = await rig({ failTimes: 1, ensureThrows: true, message: 'THREE.GLTFLoader: No DRACOLoader instance provided.' });
  eq(r.kind, 'err', 'if the decoder cannot be fetched at all, the original failure is reported');
  assert(/DRACOLoader/.test(r.v), '...naming what was missing, so build 1256\'s rewrite can act on it');
}

{
  // an unrelated parse failure is reported immediately — no codec fetch, no retry
  const r = await rig({ alwaysFail: true, message: 'Unexpected end of JSON input' });
  eq(r.kind, 'err', 'an ordinary corrupt file reports at once');
  eq(r.log.filter(x => x === 'parse').length, 1, '...with no retry');
  assert(!r.log.some(x => x.startsWith('ensure')), '...and no decoder is fetched for a file that needs none');
}

{
  // the model simply is not on this device (build 1177/1319's own case) — unchanged
  const r = await rig({ missing: true });
  eq(r.kind, 'err', 'a model that is not in this browser reports so');
  assert(/not on this device/.test(r.v), '...by name, which is the one failure specific to a local import');
  assert(!r.log.includes('parse'), '...without attempting a parse');
}

// ---------------------------------------------------------------- and no bare loader remains
{
  // The property is not "one call" — _mkGLTFLoader's own line is a ternary and contains two. It is that
  // EVERY construction site lives inside that function, which is the thing that was false.
  const mkBody = extractFunction('_mkGLTFLoader');
  const total = (src.match(/new THREE\.GLTFLoader\(/g) || []).length;
  const inside = (mkBody.match(/new THREE\.GLTFLoader\(/g) || []).length;
  eq(total, inside,
    'every `new THREE.GLTFLoader(` in the engine (' + total + ') is inside _mkGLTFLoader — a construction ' +
    'site outside it gets no codecs, which is exactly how this defect existed');
  const mk = extractFunction('_mkGLTFLoader');
  assert(/setKTX2Loader/.test(mk) && /setMeshoptDecoder/.test(mk) && /setDRACOLoader/.test(mk),
    '...and that one attaches all three codecs');
  // the retry needles must match what three actually throws, or the retry silently never fires
  assert(/No DRACOLoader instance provided\./.test(src),
    'three\'s own Draco message is present in the vendored loader, so the needle has something to match');
  const fn = extractFunction('_loadLocalModel');
  for (const needle of ['DRACOLoader', 'setKTX2Loader', 'setMeshoptDecoder']) {
    assert(fn.indexOf(needle) > 0, 'the local path watches for ' + needle);
  }
  assert(/_localModelGet\(url\.slice\(6\)\)/.test(fn), 'and the IndexedDB read is unchanged');
  assert(fn.indexOf('.then(parse)') > 0,
    '...with the buffer captured rather than re-read, so a retry does not need IndexedDB twice');
}

done('build 1419: a locally imported model gets Draco, KTX2 and meshopt like every other model');
