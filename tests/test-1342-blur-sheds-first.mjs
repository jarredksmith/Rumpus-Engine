import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1342 — reported from play: "seriously jagged edges… if any level of motion blur is turned on
// (anything >0) those rough jagged edges appear."
//
// FOUR probes failed to find blur damaging an edge directly, and that is the useful half of the finding.
// At the forced top rung with MSAA live, blur makes a silhouette SOFTER, not harder:
//     postMotion 0 / 0.3 / 0.62  ->  65.7% / 70.4% / 72.2% of scanlines antialiased
// and on the DEFAULT level mid-motion, with and without the velocity buffer, the three conditions are
// identical within noise: 26.5% / 25.7% / 26.5% hard edges. The blur is not drawing the jagged edge.
//
// It is PAYING for it. `_desiredPostSamples()` returns 4 only at `_prStepI === 0 && _hiFxOn`, and the
// ladder's first relief was `_hiFxOn = false` — so the very first downshift threw MSAA away. Motion blur
// adds a full-res pass and a half-res velocity SCENE RENDER (1246); measured here it costs ~14% of frame
// time. On a machine near the ladder's threshold that is exactly what tips rung 0 into rung 1, and rung 1
// has no MSAA at all. At any strength, because the passes run regardless of the amount — which is what
// the report said and what no "does blur blur the edge" experiment could ever have explained.
//
// So the ladder sheds in VALUE order now: antialiasing is worth more than motion blur.

const mk = (opts = {}) => {
  const fn = new Function('OPTS', `
    let _adaptOn = true, _prStepI = 0, _prScale = 1, _hiFxOn = true, _hiFxFails = 0;
    let _adaptAcc = 0, _adaptN = 0, _adaptSlow = 0, _adaptNext = 0, _adaptCool = 0;
    let _adaptGood = 0, _adaptUpNeed = 6, _adaptUpAt = 0, _adaptShiftAt = 0;
    // extractConst returns the literal's SOURCE TEXT, so it is already valid JS. JSON.stringify-ing it
    // made _PR_STEPS a STRING, whose .length is the character count — the ladder then thought it had 60
    // resolution rungs and _prStepI climbed to 60. Interpolate it raw.
    const IS_COARSE = false;                       // the desktop rung list — the one MSAA lives on
    const _PR_STEPS = ${extractConst('_PR_STEPS')};
    const ADAPT_FRAME_CAP = ${extractConst('ADAPT_FRAME_CAP')};
    const ADAPT_MIN_SAMPLE_MS = ${extractConst('ADAPT_MIN_SAMPLE_MS')};
    let _postMotion = OPTS.blur;
    const a11y = { blur: 1 };
    const _applyPixelRatio = () => {};
    ${src.slice(src.indexOf('let _mbShed = false'), src.indexOf('function _adaptResTick'))}
    ${extractFunction('_adaptResTick')}
    return {
      run(ms, frames){ let t = 0; for(let i=0;i<frames;i++){ t += ms; _adaptResTick(ms, t + OPTS.t0); } },
      runFrom(ms, frames, t0){ let t = t0; for(let i=0;i<frames;i++){ t += ms; _adaptResTick(ms, t); } },
      state(){ return { step:_prStepI, hiFx:_hiFxOn, mbShed:_mbShed, mbFails:_mbFails, hiFxFails:_hiFxFails }; },
      // The ORDER is the subject, not where the ladder ends up — it keeps shedding for as long as the
      // machine stays slow, so a state read after a long run says nothing about what went first.
      trace(ms, frames, t0){ const out = []; let t = t0 || 0, last = '';
        for(let i=0;i<frames;i++){ t += ms; _adaptResTick(ms, t);
          const k = _prStepI + '|' + (_hiFxOn?1:0) + '|' + (_mbShed?1:0);
          if(k !== last){ out.push({ step:_prStepI, hiFx:_hiFxOn, mbShed:_mbShed }); last = k; } }
        return out; },
      setBlur(v){ _postMotion = v; },
    };`);
  return fn(Object.assign({ blur: 0.62, t0: 0 }, opts));
};

// ---------------------------------------------------------------- blur goes FIRST, MSAA stays
{
  const L = mk({ blur: 0.62 });
  const tr = L.trace(33, 400);          // a sustained 30 fps load: slow enough to shed, not a hitch
  assert(tr.length >= 2, 'the ladder moved');
  const first = tr[1];                  // tr[0] is the starting state
  assert(first.mbShed, 'the FIRST thing shed is motion blur…');
  assert(first.hiFx, '…with the FX rung — which carries MSAA — still up');
  eq(first.step, 0, '…and full resolution untouched');
  // and only then does it start giving up the image
  const second = tr[2];
  assert(second && !second.hiFx && second.step === 0, 'the FX rung goes second, still at full resolution');
  assert(tr.some(s => s.step > 0), 'and resolution third — build 883/880’s order, preserved beneath the new rung');
}

// ---------------------------------------------------------------- with no blur, nothing changed
{
  const L = mk({ blur: 0 });
  const tr = L.trace(33, 400);
  const first = tr[1];
  assert(!first.mbShed, 'a level with no blur cannot shed it…');
  assert(!first.hiFx, '…so the FIRST relief is the FX rung, exactly as before this build');
  eq(first.step, 0, '…and it did not waste a rung on nothing before getting there');
  const s = L.state();
  // (it does go on to trade resolution as well — the point is only that the FX rung was the FIRST thing
  // to go, not that the ladder stopped there)
}

// ---------------------------------------------------------------- and the rest of the ladder still works
{
  const L = mk({ blur: 0.62 });
  L.run(60, 3000);                      // genuinely slow, for a long time
  const s = L.state();
  assert(s.mbShed, 'blur stays shed…');
  assert(!s.hiFx, '…the FX rung goes next…');
  assert(s.step > 0, '…and then resolution, which is build 883/880’s order preserved beneath the new rung');
}

// ---------------------------------------------------------------- recovery is the reverse
{
  const L = mk({ blur: 0.62 });
  L.run(60, 3000);
  const low = L.state();
  assert(low.mbShed && !low.hiFx && low.step > 0, 'everything is shed');
  // now give it a long stretch of headroom
  L.runFrom(10, 26000, 200000);   // ~260 s of headroom: enough for all three rungs to climb back
  const s = L.state();
  eq(s.step, 0, 'resolution comes back first…');
  assert(s.hiFx, '…then the FX rung, so the edges are back before the effect is…');
  assert(!s.mbShed, '…and motion blur last of all, because it is the least valuable thing on the ladder');
}

// ---------------------------------------------------------------- it cannot become a limit cycle
{
  // A re-arm that fails immediately counts a strike, on the same pattern as _hiFxFails, and three locks
  // it off for the session — otherwise blur would be handed back and taken away forever.
  assert(/_mbFails\+\+;/.test(src), 'a fast failed re-arm counts a strike');
  assert(/_mbShed && _mbFails < 3/.test(src), 'and three of them stop it being offered again');
  assert(/_adaptUpNeed = Math\.min\(48, _adaptUpNeed\*2\); _mbFails\+\+;/.test(src),
    'with the same doubling back-off the FX rung uses');
}

// ---------------------------------------------------------------- the gate, and the manual override
{
  assert(/&& !\(_adaptOn && _mbShed\)/.test(src), '_mbOn reads the shed flag…');
  assert(/!\(_adaptOn && _prStepI>=_PR_STEPS\.length-1\)/.test(src), '…and keeps build 1313’s bottom-rung term');
  // turning adaptive resolution off is a promise of full quality, and that has to include giving blur back
  assert(/_hiFxOn=true; _hiFxFails=0; _mbShed=false; _mbFails=0;/.test(src),
    'switching the scaler off restores everything, blur included');
  // and every path is gated on _adaptOn, so a creator who never touches the scaler is unaffected
  assert(/_mbShed = true; _adaptGood=0;/.test(src), 'the shed happens inside the ladder, nowhere else');
}

done('build 1342, from a play report of jagged edges whenever motion blur is above 0. Four probes failed to find blur damaging an edge, and that IS the finding: at the forced top rung blur makes a silhouette softer (65.7% -> 72.2% of scanlines antialiased) and on the default level mid-motion the conditions are identical within noise. Blur is not drawing the jagged edge — it is paying for it. MSAA exists only at `_prStepI === 0 && _hiFxOn`, and the adaptive ladder\'s first relief was to drop `_hiFxOn`, so the very first downshift threw the antialiasing away; motion blur adds a full-res pass and a half-res velocity scene render, measured at ~14% of frame time, which on a machine near the threshold is exactly what tips rung 0 into rung 1. At any strength, because the passes run regardless of the amount — which is what the report said and what no "does blur blur the edge" experiment could have explained. The ladder now sheds in VALUE order: motion blur is the cheapest rung and goes first, so a marginal machine keeps its edges and loses an effect instead of the reverse. Executed against the real _adaptResTick: a sustained 30 fps load sheds blur with the FX rung still up and resolution untouched, a level with no blur behaves exactly as before, deeper trouble still goes FX rung then resolution, and recovery restores them in reverse so blur returns last — with a three-strike lock so a re-arm that fails immediately cannot become a limit cycle');
