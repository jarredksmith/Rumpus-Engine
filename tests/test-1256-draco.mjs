import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1256: Draco-compressed models load. The inlined GLTFLoader has supported
// KHR_draco_mesh_compression all along but was never given a DRACOLoader, so a Draco .glb became a
// capsule — and Sketchfab plus most "optimize my glTF" pipelines emit Draco by default. Wired as the
// THIRD instance of builds 917/918's pattern: the failed load names the missing decoder, the engine
// pulls it in on demand and retries.

// --- the load-bearing check: the real library's error must match the retry's regex ------------------
// If GLTFLoader's wording ever changes, the retry silently never fires and Draco models go back to
// being capsules — with nothing failing. So assert against the LIBRARY TEXT, not an assumption.
{
  const m = html.match(/throw new Error\( 'THREE\.GLTFLoader: No ([A-Za-z0-9]+) instance provided\.' \);/);
  assert(m, 'the inlined GLTFLoader still throws its named-loader error for a Draco primitive');
  eq(m[1], 'DRACOLoader', 'and it still names DRACOLoader');
  assert(/DRACOLoader/.test(m[0]), 'so the engine’s /DRACOLoader/ retry test matches the real message');
  assert(/KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression'/.test(html),
    'the extension the decoder serves is the one glTF exporters emit');
  assert(/setDRACOLoader\( dracoLoader \)/.test(html), 'and the setter the engine calls exists on the real loader');
}

// --- executable: the error router picks the right recovery, once ------------------------------------
// The three decoder retries and the transient-failure backoff share one function; drive the real
// branch structure with each message and prove they do not collide.
function routeRig() {
  const calls = { ktx2: 0, meshopt: 0, draco: 0, requeue: 0, released: 0, failed: 0, cancelled: 0 };
  const body = extractFunction('loadGLTFCached');
  const ecSrc = body.slice(body.indexOf('let _tries=0'), body.indexOf('const start = ()=>{'));
  const mk = new Function('_glbCancel', '_ensureKTX2', '_ensureMeshopt', '_ensureDraco', '_release',
    '_glbQueue', '_glbPump', '_done', 'waiters', 'setTimeout', 'url', 'calls', 'start', '_cxl', `
    ${ecSrc}
    return { ec:_ec, tries:()=>_tries };`);
  const P = () => ({ then: (f) => { f(); return { then: () => {} }; } });
  return {
    ...mk({}, () => { calls.ktx2++; return P(); }, () => { calls.meshopt++; return P(); }, () => { calls.draco++; return P(); },
      () => calls.released++, { push: () => calls.requeue++ }, () => {}, () => {},
      [{ errcb: () => calls.failed++ }], () => {}, 'x.glb', calls, function start(){}, ()=>calls.cancelled++),
    calls };
}
{ // a Draco model recovers: pull the decoder, re-queue the load, do NOT count it as a failure
  const r = routeRig();
  r.ec(new Error('THREE.GLTFLoader: No DRACOLoader instance provided.'));
  eq(r.calls.draco, 1, 'the Draco decoder is fetched on demand');
  eq(r.calls.requeue, 1, 'and the load is re-queued behind it');
  eq(r.calls.failed, 0, 'the creator never sees a failure for a recoverable model');
  eq(r.calls.ktx2 + r.calls.meshopt, 0, 'the other two decoders are not disturbed');
}
{ // one shot only — a decoder that cannot fix it must not loop forever
  const r = routeRig();
  const e = new Error('THREE.GLTFLoader: No DRACOLoader instance provided.');
  r.ec(e); r.ec(e); r.ec(e);
  eq(r.calls.draco, 1, 'the decoder is fetched exactly once');
  assert(r.tries() >= 1, 'further failures fall through to the ordinary backoff, not another fetch');
}
{ // the sibling paths still route to their own decoders — and note the three messages differ in
  // SHAPE (KTX2/meshopt name their SETTER, Draco names the LOADER), which is why each test differs.
  // Take all three from the library text so an upgrade that rewords any of them fails loudly here.
  const ktx2Msg = (html.match(/'THREE\.GLTFLoader: (setKTX2Loader must[^']*)'/) || [])[1];
  const meshMsg = (html.match(/'THREE\.GLTFLoader: (setMeshoptDecoder must[^']*)'/) || [])[1];
  assert(ktx2Msg && meshMsg, 'the library still carries its KTX2 and meshopt messages');
  const k = routeRig(); k.ec(new Error('THREE.GLTFLoader: ' + ktx2Msg));
  eq(k.calls.ktx2, 1, 'a real KTX2 error still fetches KTX2 (build 917)');
  eq(k.calls.draco, 0, '...and not Draco');
  const m = routeRig(); m.ec(new Error('THREE.GLTFLoader: ' + meshMsg));
  eq(m.calls.meshopt, 1, 'a real meshopt error still fetches meshopt (build 918)');
  eq(m.calls.draco, 0, '...and not Draco');
}
{ // a cancel is still final, and an ordinary failure still backs off then reports
  const c = routeRig(); c.ec(new Error('cancelled'));
  eq(c.calls.draco, 0, 'a cancelled load never fetches a decoder');
  const t = routeRig();
  t.ec(new Error('404')); t.ec(new Error('404')); t.ec(new Error('404'));
  eq(t.calls.failed, 1, 'an unrecoverable load still reports once, after its retries');
}

// --- wiring pins --------------------------------------------------------------------------------------
assert(/try\{ if\(_dracoLoader\) l\.setDRACOLoader\(_dracoLoader\); \}catch\(e\)\{\}/.test(src),
  'every GLTF loader the engine builds gets the decoder once it exists');
{
  const fn = extractFunction('_ensureDraco');
  assert(/if\(_dracoPromise\) return _dracoPromise;/.test(fn), 'the fetch is memoised — one download per session, shared by every model');
  assert(/esm\.sh\/three@0\.149\.0\/examples\/jsm\/loaders\/DRACOLoader\.js/.test(fn),
    'DRACOLoader imports `three`, so it comes from the CDN that rewrites bare specifiers (the KTX2 constraint)');
  assert(/setDecoderPath\('https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.149\.0\/examples\/jsm\/libs\/draco\/'\)/.test(fn),
    'the decoder binaries are a plain fetch');
  assert(/l\.preload\(\)/.test(fn), 'the worker is warmed so the first Draco model does not pay the round trip mid-load');
  assert(/window\.__DRACO_UNAVAILABLE = true/.test(fn), 'an unreachable decoder is recorded rather than retried forever');
  assert(!/dispose\(\)/.test(fn), 'the decoder is never disposed — it is shared by every later model');
}
{
  const nf = extractFunction('_noteAssetFailure');
  assert(/window\.__DRACO_UNAVAILABLE/.test(nf) && /Draco-compressed/.test(nf),
    'when the decoder truly cannot be had, the failure report says WHY and what to do (re-export without Draco)');
}

done('build 1256: Draco models load — the retry verified against the real GLTFLoader’s own error text, the router executed for all three decoders plus cancel and backoff, and an unreachable decoder explained instead of silently capsuled');
