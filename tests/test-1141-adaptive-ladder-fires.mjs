// build 1141: the adaptive quality ladder actually fires — including on the machines it exists for.
//
// Found while checking that build 1140 (which turned the post chain on for the default level) was safe
// on weak hardware. It was not, because the safety net did not work:
//
//   _adaptAcc += frameMs; _adaptN++;
//   if(now < _adaptNext) return;
//   _adaptNext = now + 500;
//   if(_adaptN < 8){ _adaptAcc=0; _adaptN=0; return; }   // "need a real sample"
//
// Eight frames inside a 500 ms window is 16 fps. On anything slower the sample gate was never satisfied,
// so the function threw its evidence away and returned EVERY window, forever. Driving _adaptResTick with
// steady synthetic frame times for 60 s of simulated play, before the fix:
//
//   22 / 25 / 30 / 40 / 50 / 60 / 65 / 70 ms per frame  ->  reached the bottom rung
//   100 / 150 / 200 / 400 ms per frame                  ->  prStep 0, hiFx on: NO RELIEF AT ALL
//
// The worse the device, the more certainly the relief never arrived — the exact inverse of what the
// system is for. A phone at 8 fps got nothing.
//
// Fixing it exposed a second flaw that had always been there at normal frame rates: the window's MEAN is
// dominated by one pathological frame, so a single 3-second hitch (a level load, a GC pause, a shader
// compile) cost the player a rung of quality for a load that was never sustained. So a frame's
// contribution is now capped, and the downshift asks a MAJORITY question (`slowFrac >= 0.5`) beside the
// mean rather than the mean alone.
//
// Every claim below is executed against the real function, not pinned.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const PR = JSON.parse(src.match(/const _PR_STEPS = IS_COARSE \? \[[^\]]*\] : (\[[^\]]*\]);/)[1]);
const CAP = +src.match(/const ADAPT_FRAME_CAP = (\d+);/)[1];
const MIN = +src.match(/const ADAPT_MIN_SAMPLE_MS = (\d+);/)[1];
const NAMES = ['_adaptOn','_adaptAcc','_adaptN','_adaptNext','_adaptCool','_adaptGood','_adaptUpAt',
               '_adaptUpNeed','_adaptShiftAt','_prStepI','_prScale','_hiFxOn','_hiFxFails','_adaptSlow'];

// a fresh scaler plus a clock, so each scenario starts from a session's opening state
function rig(opts) {
  const st = Object.assign({ _adaptOn:true, _adaptAcc:0, _adaptN:0, _adaptNext:0, _adaptCool:0,
    _adaptGood:0, _adaptUpAt:0, _adaptUpNeed:6, _adaptShiftAt:0, _prStepI:0, _prScale:1,
    _hiFxOn:true, _hiFxFails:0, _adaptSlow:0 }, opts || {});
  const body = NAMES.map(n => 'let ' + n + '=S.' + n + ';').join('\n') + '\n'
    + extractFunction('_adaptResTick') + '\n'
    + 'return { tick:_adaptResTick, applied:()=>A.n, get:()=>({' + NAMES.map(n => n + ':' + n).join(',') + '}) };';
  const A = { n: 0 };
  const api = new Function('S', 'A', '_PR_STEPS', '_applyPixelRatio', 'Math', 'ADAPT_FRAME_CAP', 'ADAPT_MIN_SAMPLE_MS', body)
    (st, A, PR, () => { A.n++; }, Math, CAP, MIN);
  let now = 0;
  return {
    get: api.get, applied: api.applied,
    feed(ms, seconds) { const n = Math.max(1, Math.round(seconds * 1000 / ms)); for (let i = 0; i < n; i++) { now += ms; api.tick(ms, now); } },
    one(ms) { now += ms; api.tick(ms, now); },
    relieved() { const g = api.get(); return g._prStepI > 0 || !g._hiFxOn; },
    bottom() { const g = api.get(); return g._prStepI === PR.length - 1 && !g._hiFxOn; },
  };
}

// ---------------------------------------------------------------- the constants are sane
assert(CAP >= 100 && CAP <= 1000, 'the per-frame cap is well past any frame time worth reacting to (' + CAP + ' ms)');
assert(MIN >= 100 && MIN <= 1000, 'the minimum sample is a fraction of a second (' + MIN + ' ms)');

// ---------------------------------------------------------------- 1. every sustained load gets relief
{
  // this is the whole bug: the four slowest of these got nothing before the fix
  for (const ms of [22, 25, 40, 60, 70, 100, 150, 200, 400, 900]) {
    const r = rig(); r.feed(ms, 60);
    assert(r.bottom(), 'a sustained ' + ms + ' ms frame time (' + (1000 / ms).toFixed(1) + ' fps) reaches the bottom rung within a minute');
  }
  // and the cheap rung goes FIRST, at every speed — build 883's ordering, which the slow cases never reached
  for (const ms of [30, 200]) {
    const r = rig(); r.feed(ms, 1.2);
    const g = r.get();
    eq(g._hiFxOn, false, 'at ' + ms + ' ms the first relief is the FX rung');
    eq(g._prStepI, 0, '...with full resolution still intact');
  }
}
// the sample gate itself, stated as behaviour: two long frames are conclusive, one is not
{
  // a 2.5 fps machine: the first frame opens the window, the second lands inside it, the third crosses it
  // and carries 750 ms of evidence in three frames. Under two seconds, where before it was never.
  const r = rig();
  r.one(400); assert(!r.relieved(), 'the first frame only opens the window');
  r.one(400); r.one(400);
  assert(r.relieved(), 'three 400 ms frames — 1.2 s of real evidence — are acted on');
}
{
  const r = rig();
  r.one(400);                                    // a single frame must never be acted on
  assert(!r.relieved(), 'ONE long frame is a hitch, not a load, and costs nothing');
}
{
  // and a deficient window must KEEP its samples rather than discard them, or a machine rendering
  // slower than one frame per window never accumulates two
  const r = rig();
  r.one(900); assert(!r.relieved(), 'one 900 ms frame: still nothing');
  r.one(900); assert(r.relieved(), '...and the second one, a window later, is acted on — the evidence was not thrown away');
  assert(/if\(_adaptN < 8 && !\(_adaptN >= 2 && _adaptAcc >= ADAPT_MIN_SAMPLE_MS\)\) return;/.test(extractFunction('_adaptResTick')),
    'the deficient branch returns without clearing _adaptAcc / _adaptN');
}

// ---------------------------------------------------------------- 2. a healthy machine is left alone
{
  for (const ms of [8, 12, 16, 20]) {
    const r = rig(); r.feed(ms, 60);
    assert(!r.relieved(), (1000 / ms).toFixed(0) + ' fps is left at full quality (' + ms + ' ms/frame)');
  }
  eq(rig().applied(), 0, 'and an untouched scaler never re-applies the pixel ratio');
}

// ---------------------------------------------------------------- 3. one hitch costs nothing
{
  for (const hitch of [300, 1000, 3000, 12000]) {
    const r = rig();
    r.feed(16, 5); r.one(hitch); r.feed(16, 20);
    assert(!r.relieved(), 'a single ' + hitch + ' ms hitch in an otherwise healthy session costs no quality');
  }
  // ...because of two mechanisms, both of which are load-bearing
  const fn = extractFunction('_adaptResTick');
  assert(/_adaptAcc \+= Math\.min\(frameMs, ADAPT_FRAME_CAP\); _adaptN\+\+; if\(frameMs > 20\) _adaptSlow\+\+;/.test(fn),
    'a frame contributes at most ADAPT_FRAME_CAP to the mean, and slow frames are counted separately');
  assert(/const avg = _adaptAcc\/_adaptN, slowFrac = _adaptSlow\/_adaptN;/.test(fn), 'both statistics come out of the window');
  eq((fn.match(/slowFrac >= 0\.5/g) || []).length, 2, 'and BOTH downshift rungs require a majority-slow window, not just a slow mean');
  assert(!/slowFrac/.test(fn.slice(fn.indexOf('avg < 17'))), 'the CLIMB is not gated on it — recovering means the mean came down, which is the right question');
  // executable proof that the cap is what saves the hitch: with a huge cap the same session downshifts
  {
    const body = NAMES.map(n => 'let ' + n + '=S.' + n + ';').join('\n') + '\n' + extractFunction('_adaptResTick')
      + '\nreturn { tick:_adaptResTick, get:()=>({_prStepI, _hiFxOn}) };';
    const st = { _adaptOn:true, _adaptAcc:0, _adaptN:0, _adaptNext:0, _adaptCool:0, _adaptGood:0, _adaptUpAt:0,
      _adaptUpNeed:6, _adaptShiftAt:0, _prStepI:0, _prScale:1, _hiFxOn:true, _hiFxFails:0, _adaptSlow:0 };
    // NOTE: slowFrac still protects it, so remove that too — this reproduces the ORIGINAL statistic
    const orig = new Function('S','_PR_STEPS','_applyPixelRatio','Math','ADAPT_FRAME_CAP','ADAPT_MIN_SAMPLE_MS',
      body.replace(/slowFrac >= 0\.5 && /g, ''))(st, PR, () => {}, Math, 1e9, MIN);
    let now = 0; const tick = (ms) => { now += ms; orig.tick(ms, now); };
    for (let i = 0; i < 300; i++) tick(16);
    tick(3000);
    for (let i = 0; i < 60; i++) tick(16);
    const g = orig.get();
    assert(g._prStepI > 0 || !g._hiFxOn, 'without the cap AND the majority test, that same 3 s hitch costs a rung — which is what shipped before this build');
  }
}

// ---------------------------------------------------------------- 4. recovery still climbs all the way
{
  const r = rig();
  r.feed(200, 30);
  assert(r.bottom(), 'a slow stretch takes it to the bottom');
  r.feed(10, 90);
  const g = r.get();
  eq(g._prStepI, 0, 'sustained headroom climbs the resolution all the way back');
  eq(g._hiFxOn, true, '...and re-arms the FX rung last, as build 883 intended');
}
{
  // build 880's anti-thrash is untouched: a climb that fails quickly doubles the required good streak
  const fn = extractFunction('_adaptResTick');
  assert(/_adaptUpNeed = Math\.min\(48, _adaptUpNeed\*2\)/.test(fn), 'a failed climb still doubles the requirement');
  assert(/_hiFxFails < 3/.test(fn), '...and three failed FX re-arms still lock it off for the session');
  assert(/if\(_adaptUpNeed>6 && now-_adaptShiftAt>45000\)\{ _adaptUpNeed=6;/.test(fn), '...forgiven after 45 s of stability');
}

// ---------------------------------------------------------------- 5. the opt-out is still first
{
  const fn = extractFunction('_adaptResTick');
  assert(/^function _adaptResTick\(frameMs, now\)\{\s*\n\s*if\(!_adaptOn\) return;/.test(fn),
    'the preference is checked before any state is touched');
  const r = rig({ _adaptOn:false });
  r.feed(400, 60);
  assert(!r.relieved(), 'a player who turned it off keeps full quality however slow it gets');
  eq(r.applied(), 0, '...and the pixel ratio is never touched');
}

done('build 1141: the adaptive ladder fires at every frame rate, and one hitch no longer costs a rung');
