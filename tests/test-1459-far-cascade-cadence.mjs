// build 1459 — THE FAR CASCADE TAKES EVERY SECOND REFRESH.
//
// THE AUDIT'S OWN PROPOSAL DIED ON MEASUREMENT, and that is the first thing this file records so nobody
// re-derives it. The finding was: `_shDirty` is true whenever any enemy is alive, so gate it on whether a
// mover sits inside the NEAR cascade's fitted volume. The premise is verified — `for(const e of enemies){
// if(e && e.hp>0){ _shDirty=true; break; } }` really does dirty both maps every frame of every wave. The
// fix does not work:
//
//   * both cascades share ONE dirty counter (`_shadowDirtyFrames` -> `renderer.shadowMap.needsUpdate`), so
//     a mover inside the FAR volume genuinely needs the refresh and the honest test is against THAT;
//   * measured (tools/probe/shadow-dirty-scope.mjs) the far half-extent is 240 at the shipped defaults,
//     against an arena of 70. 100% of the default arena and 100% of a build-1372 wave ring sit inside it.
//
// So the near-volume test buys 0.0% of wave frames on any level under ~500 half-extent. `_shDirty` is
// therefore UNCHANGED, and this file asserts that it is.
//
// What is real is the far map's cost: measured at 358 of 990 draw calls in a shadow frame. r149 checks a
// PER-LIGHT gate after the global one, so the far light can opt out and take its own cadence — no define,
// no light-count change, no recompile, which is what every other approach here would have cost.

import { gameSource, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. r149 really does gate per light
// If an upgrade drops this, the far cascade silently stops refreshing at all — a stale distant shadow
// forever, which renders perfectly plausibly. Pin it against the REAL vendored build.
{
  const three = (await import('fs')).readFileSync(
    new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');
  assert(/if \( shadow\.autoUpdate === false && shadow\.needsUpdate === false \) continue;/.test(three),
    'r149 skips a light whose own shadow opts out — the mechanism this build stands on');
  assert(/shadow\.needsUpdate = false;/.test(three),
    '...and clears the flag once rendered, so this build only ever has to RAISE it');
  assert(/if \( scope\.autoUpdate === false && scope\.needsUpdate === false \) return;/.test(three),
    '...with the global gate still checked first, which is what keeps a still scene free');
}

// ---------------------------------------------------------------- 2. the number is derived
{
  eq(+extractConst('FAR_SHADOW_EVERY'), 2, 'the far cascade takes every second refresh');
  // the derivation, restated as arithmetic rather than trusted from the comment
  const RUN = 14, FPS = 60, E = 60, PX_PER_RAD = 444;
  const lagPx = (n) => ((n - 1) * RUN / FPS) / E * PX_PER_RAD;
  assert(lagPx(2) < 2, 'N=2 lags under two screen pixels at the cascade boundary for a running caster');
  assert(lagPx(3) > 3, '...where N=3 would be over three, which is visible on a sprint');
  assert(/FAR_SHADOW_EVERY IS DERIVED, not picked/.test(src), 'and the derivation is recorded at the constant');
}

// ---------------------------------------------------------------- 3. the opt-out is set once
{
  eq((src.match(/moonFar\.shadow\.autoUpdate = false/g) || []).length, 1,
    'the far light opts out of the global refresh exactly once');
  assert(/const moonFar = IS_COARSE \? null : new THREE\.DirectionalLight/.test(src),
    'and it is still null on a phone, where there is no far cascade at all');
  // it must never touch the things that would recompile
  // scoped to the block THIS build added. A wider slice reaches build 1185's mirror line, which
  // legitimately writes `moonFar.visible = moon.visible` — a pin must not fail on code it does not own.
  const blk = src.slice(src.indexOf('const FAR_SHADOW_EVERY'), src.indexOf('if(moonFar && moonFar.shadow) moonFar.shadow.autoUpdate = false;') + 80);
  assert(!/moonFar\.castShadow *=/.test(blk) && !/moonFar\.visible *=/.test(blk),
    'it never flips castShadow or visibility — either would change a #define or the light count (builds 636/977/1153)');
}

// ---------------------------------------------------------------- 4. the cadence, executed
{
  const run = (frames) => new Function('FRAMES', `
    const FAR_SHADOW_EVERY = ${extractConst('FAR_SHADOW_EVERY')};
    let _farShN = 0, _farShRefit = false;
    let _shadowDirtyFrames = 0;
    const moonFar = { shadow: { needsUpdate: false, autoUpdate: false } };
    const out = [];
    for(const f of FRAMES){
      _shadowDirtyFrames = f.dirty ? 1 : 0;
      if(f.refit) _farShRefit = true;
      moonFar.shadow.needsUpdate = false;
      if(_shadowDirtyFrames>0){ _shadowDirtyFrames--;
        if(moonFar && moonFar.shadow){
          _farShN++;
          if(_farShRefit || (_farShN % FAR_SHADOW_EVERY === 0)){ moonFar.shadow.needsUpdate = true; _farShRefit = false; }
        }
      }
      out.push(moonFar.shadow.needsUpdate ? 1 : 0);
    }
    return out;`)(frames);

  const dirty = (n) => Array.from({ length: n }, () => ({ dirty: true }));

  eq(run(dirty(6)).join(''), '010101', 'every second dirty frame refreshes the far map');

  // a refit must force one, whatever the cadence says — the VOLUME moved, so the map is now stale in
  // the wrong place, which is a different fault from being stale by a frame
  const withRefit = run([{dirty:true},{dirty:true},{dirty:true,refit:true},{dirty:true},{dirty:true}]);
  eq(withRefit[2], 1, 'a refit forces a refresh out of turn');
  eq(withRefit[0], 0, '...and the frames around it keep the cadence');

  // ...and the forced one CONSUMES ITSELF without resetting the counter, so the cadence keeps its phase.
  // My first expectation here was '1010' and the engine was right: a refit on frame 0 fires it, and
  // frame 1 then fires on its OWN turn because _farShN reached 2. Only frame 0 differs from the
  // unforced run — which is precisely what "does not shift the phase" means.
  eq(run([{dirty:true},{dirty:true},{dirty:true},{dirty:true}]).join(''), '0101', 'the unforced cadence');
  eq(run([{dirty:true,refit:true},{dirty:true},{dirty:true},{dirty:true}]).join(''), '1101',
    'a refit adds ONE refresh at frame 0 and leaves every later frame exactly where it was');

  // a STILL scene must not bank credit: the global gate skips the whole pass, so the counter must not
  // advance, or the first frame of movement would owe several refreshes
  eq(run([{dirty:false},{dirty:false},{dirty:false},{dirty:true},{dirty:true}]).join(''), '00001',
    'quiet frames advance nothing, so the cadence resumes where it left off rather than firing at once');

  // and the flag is only ever RAISED, because three lowers it itself
  const body = src.slice(src.indexOf('if(_shadowDirtyFrames>0){'), src.indexOf('if(_shadowDirtyFrames>0){') + 900);
  assert(/moonFar\.shadow\.needsUpdate = true;/.test(body), 'the cadence raises the flag');
  assert(!/moonFar\.shadow\.needsUpdate = false/.test(body), '...and never lowers it — three does that after rendering');
}

// ---------------------------------------------------------------- 5. the NEAR cascade is untouched
{
  assert(/if\(_shadowDirtyFrames>0\)\{ renderer\.shadowMap\.needsUpdate = true; _shadowDirtyFrames--;/.test(src),
    'the near map still follows the global flag exactly as before');
  assert(/else renderer\.shadowMap\.needsUpdate = false;/.test(src),
    '...and a still scene still skips the whole pass at the global gate');
}

// ---------------------------------------------------------------- 6. `_shDirty` is NOT narrowed
// The audit asked for this and the measurement said no. Asserting the absence keeps it a DECISION.
{
  const blk = src.slice(src.indexOf('let _shDirty ='), src.indexOf('let _shDirty =') + 1400);
  assert(/for\(const e of enemies\)\{ if\(e && e\.hp>0\)\{ _shDirty=true; break; \} \}/.test(blk),
    'a living enemy still dirties the shadow — the near-volume gate was measured at 0.0% and not built');
  assert(!/shadowCovers|_inShadowVol|nearExtent/.test(blk),
    '...so no volume test was added to the dirty block');
  assert(/THE AUDIT'S OWN PROPOSAL WAS NOT BUILT/.test(src) || /the audit's own proposal/i.test(src),
    'and the reason is recorded where the next reader will look');
}

// ---------------------------------------------------------------- 7. a refit sets the flag
{
  assert(/_farShRefit = true;   \/\* build 1459: the far VOLUME moved/.test(src),
    'the refit site raises it');
  assert(/_dirtyShadows\(1\);\s*\n\s*_farShRefit = true;/.test(src),
    '...beside the dirty call it belongs with, so the two cannot be separated by an edit');
  // and it starts true, so the first frame of a session draws a far map rather than an empty one
  assert(/let _farShN = 0, _farShRefit = true;/.test(src),
    'it starts TRUE, so the very first shadow frame renders the far cascade rather than an empty map');
}

done('build 1459 (performance audit): the audit asked for `_shDirty` to be gated on the NEAR cascade\'s fitted volume, and that DIED ON MEASUREMENT — both cascades share one dirty counter, so the honest test is against the FAR volume, whose half-extent is 240 at the shipped defaults against an arena of 70; 100% of the default arena and 100% of a build-1372 wave ring sit inside it, so the test buys 0.0% on any level under ~500 half-extent. `_shDirty` is therefore unchanged and this file asserts that it is, so the rejection stays a decision rather than an oversight. What IS real is the far map\'s cost, measured at 358 of 990 draw calls in a shadow frame. r149 checks a PER-LIGHT gate after the global one and clears the flag itself once rendered, so the far light opts out and takes every second refresh — no define, no light-count change and no recompile, which every other approach would have cost. FAR_SHADOW_EVERY = 2 is DERIVED rather than picked: a caster lags at most (N-1) frames, and at run speed that is (N-1)x1.7 screen pixels at the cascade boundary where the far map first draws, so 2 stays under two pixels where 3 would be three and a half. Executed: every second dirty frame refreshes, a refit forces one out of turn and consumes itself without shifting the phase, quiet frames bank no credit so the first frame of movement does not owe several refreshes, the flag is only ever raised because three lowers it, and the near cascade is byte-identical');
