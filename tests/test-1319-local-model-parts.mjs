import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1319 — editor audit 4.8, MED:
//
//   "renderModelParts: `if(!/^https?:/i.test(url) || !/\.glb(\?|#|$)/i.test(url))` -> a `local:` src (build
//    1177's drag-import) fails the test and gets 'Part editing works on direct .glb models', which is both
//    true and useless. And the whole feature requires _uploadAsset -> the founder's cPanel upload.php:
//    offline or host-down, a creator cannot recolor a part of their OWN model. Two features shipped 20
//    builds apart that do not know about each other."
//
// Both halves are one misunderstanding: the part editor READS BYTES, EDITS BYTES and WRITES BYTES, and had
// hardcoded one source (http) and one destination (the host). Neither is essential to what it does.
//
// Measured live (tools/probe/local-model-parts.mjs): a blob put in IndexedDB came back through the bake's
// own reader as 12 bytes with the magic "glTF"; a missing one threw "local model not on this device"; the
// panel BUILT for `local:` and for an http .glb and still refused sketchfab and .obj; and `_bakeModelEdits`
// on a `local:` url reached "Reading model…" and then the gltf-transform CDN — which is as far as a
// sandbox without that library can go, and is exactly the point: the URL check no longer turns it away.

// ---------------------------------------------------------------- the source is wherever the bytes are
{
  const fn = extractFunction('_bakeSourceBytes');
  assert(/if\(url && url\.indexOf\('local:'\)===0\)\{/.test(fn), 'a local: url is read from IndexedDB…');
  assert(/const blob = await _localModelGet\(url\.slice\(6\)\);/.test(fn),
    '...through build 1177’s own store, by the same key scheme');
  assert(/if\(!blob\) throw new Error\('local model not on this device — re-import it'\);/.test(fn),
    'and a model that is not on THIS device says so — the one failure that is specific to a local import');
  assert(/const r = await fetch\(url\); if\(!r\.ok\) throw new Error\('HTTP '\+r\.status\);/.test(fn),
    'while an http url is fetched exactly as before');
}
{ // executed, both branches
  /* extractFunction brace-matches from `function NAME(`, so it DROPS a leading `async` — put it back, or
     the awaits inside are a syntax error the moment new Function compiles them. */
  const rig = new Function('_localModelGet', 'fetch',
    'async ' + extractFunction('_bakeSourceBytes') + '; return _bakeSourceBytes;')(
    (k) => Promise.resolve(k === 'k/one.glb' ? { arrayBuffer: () => Promise.resolve('LOCAL-BYTES') } : null),
    (u) => Promise.resolve({ ok: /good/.test(u), status: 404, arrayBuffer: () => Promise.resolve('HTTP-BYTES') }));
  const results = [];
  await rig('local:k/one.glb').then(v => results.push(['local', v]), e => results.push(['local', 'ERR:' + e.message]));
  await rig('https://x/good.glb').then(v => results.push(['http', v]), e => results.push(['http', 'ERR:' + e.message]));
  await rig('local:missing').then(v => results.push(['gone', v]), e => results.push(['gone', 'ERR:' + e.message]));
  await rig('https://x/bad.glb').then(v => results.push(['404', v]), e => results.push(['404', 'ERR:' + e.message]));
  eq(results[0][1], 'LOCAL-BYTES', 'a local: url yields the stored bytes');
  eq(results[1][1], 'HTTP-BYTES', 'an http url yields the fetched bytes');
  assert(/^ERR:local model not on this device/.test(results[2][1]), 'a missing local model is a named failure');
  assert(/^ERR:HTTP 404/.test(results[3][1]), 'and an http failure still reports its status');
}

// ---------------------------------------------------------------- the destination follows the source
{
  const bake = extractFunction('_bakeModelEdits');
  assert(/const _isLocal = !!\(url && url\.indexOf\('local:'\)===0\);/.test(bake), 'the bake knows where the model came from');
  assert(/if\(!url \|\| !\(_isLocal \|\| \/\^https\?:\/i\.test\(url\)\)\)\{ say\('This model has no fetchable URL to edit\.'\);/.test(bake),
    '...and only refuses what it genuinely cannot read');
  assert(/if\(_isLocal\)\{\n      say\('Saving edited model…'\);/.test(bake), 'A LOCAL MODEL STAYS LOCAL…');
  assert(/const key = 'e'\+Date\.now\(\)\.toString\(36\)\+'\/'\+base\+'-edit\.glb';/.test(bake),
    '...under a FRESH key, so the original survives exactly as it does on the hosted path');
  assert(/await _localModelPut\(key, new Blob\(\[bytes\]\)\);/.test(bake), '...written back through build 1177’s store');
  assert(/if\(done\) done\('local:'\+key, base\+'-edit\.glb'\);/.test(bake), '...and handed back as a local: src');
  assert(bake.indexOf('if(_isLocal){') < bake.indexOf('_uploadAsset(file'),
    'and the upload is the OTHER branch — a local model never touches the server');
  assert(/Uploading it would be a different decision than the creator made when they\n       dragged the file in/.test(src),
    'with the reason: build 1177’s whole point is that an import can live on this device');
  assert(/it\n       would also fail on exactly the offline\/host-down case the audit named/.test(src),
    '...and it is also the case the audit named');
  // storage can be full, and that has to be an answer rather than a silent nothing
  assert(/catch\(e\)\{ say\('✕ couldn’t save locally \('\+\(\(e&&e\.message\)\|\|'storage full\?'\)\+'\)'\); if\(done\) done\(null\); return; \}/.test(bake),
    'a failed local save reports why and stops, rather than swapping in a url that does not exist');
  assert(/this device only/.test(bake), 'and the toast says the edit is device-only, which the original import also said');
}

// ---------------------------------------------------------------- the gate asks the right question
{
  const rp = extractFunction('renderModelParts');
  assert(/const _isLocal = url\.indexOf\('local:'\)===0;/.test(rp), 'the panel recognises a local import…');
  assert(/if\(!\(_isLocal \|\| \(\/\^https\?:\/i\.test\(url\) && \/\\\.glb\(\\\?\|#\|\$\)\/i\.test\(url\)\)\)\)\{/.test(rp),
    '...and lets it through');
  assert(/The old test asked WHERE the model lives; the\n     right question is whether we can read its glb/.test(src),
    'with the reframing recorded — that is the whole build in one sentence');
  // what must STILL be refused, and still say why
  assert(/Sketchfab imports can\\u2019t be re-edited here/.test(rp),
    'a sketchfab import is still refused, with its own reason (a one-time archive)');
  assert(/Part editing works on direct \.glb models and on models you dragged in from this device\./.test(rp),
    'and the general refusal now names BOTH kinds that do work, so it is a direction rather than a dead end');
}

// ---------------------------------------------------------------- the two features now know about each other
{
  // build 1177's publish warning must still fire — an EDITED local model is still a local model
  assert(/local:/.test(extractFunction('levelIssues')),
    'the Level Check still warns that a local model cannot travel, which an edited one equally cannot');
  assert(/local:/.test(extractFunction('isModelSrc')),
    'and the scheme is still recognised everywhere a model src is (cache accounting, part editor, release)');
}

done('build 1319 (editor audit 4.8): the part editor works on models you dragged in — a `local:` src fell through a hardcoded http test and got "Part editing works on direct .glb models", and the bake could only ever write to the founder\'s host, so offline or host-down a creator could not recolor a part of their own model. Both halves were one misunderstanding: the editor reads bytes, edits bytes and writes bytes, and had pinned one source and one destination. A local model\'s bytes now come back from IndexedDB and the edited result goes BACK there under a fresh key — uploading it would reverse the decision the creator made when they dragged the file in, and would fail on exactly the offline case the audit named. Verified live: the bake\'s reader returned the stored bytes with the glTF magic intact, a missing model threw a named error, the panel built for local: and http .glb while still refusing sketchfab and .obj, and a local: bake reached the gltf-transform library instead of being turned away at the url');
