// build 1457 — THE DRAW-CALL LEVER WAS OFF, AND THE LADDER COULD NOT REACH IT.
//
// `_adaptResTick` sheds motion blur, then MSAA+SSAO, then RESOLUTION, then the sun's shadow map. It
// never touched `lodPx`, whose default has been 0 since build 1273. So the single largest scaling lever
// in the engine — the one build 1270 measured at 844 -> 574 draw calls (-32%) at 2 px — was opt-in, and
// a struggling device got pixel-count relief while submitting every draw call it always had.
//
// BUILD 1273 IS NOT REVERSED, and that distinction is the whole build. Its argument stands: a perf
// feature that DELETES a creator's prop does not get to be on by default, and that build could not
// reproduce the report behind it. What it does not cover is a device already running at 60-66% of native
// with its antialiasing and ambient occlusion gone. The ladder engaging IS the engine saying "this
// machine is in trouble"; spending draw calls there is the same trade every other rung already makes.
//
// Four things keep it honest, and each is a defect the other way:
//   - rungs 0 and 1 are EXACTLY 0, so no full-quality frame moves and neither does the first resolution
//     downshift;
//   - it is a FLOOR, never a cap — an authored 4 px stays 4 px at every rung;
//   - `_adaptOn === false` returns 0, because turning the scaler off is a promise of full quality
//     (build 1342) and this build must not be what quietly breaks it;
//   - LOD_NEAR_KEEP is untouched, so nothing inside 40 m can vanish at any rung, which is what makes
//     build 1273's reported symptom structurally unreachable rather than merely unlikely.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the rig
function mkRig({ adaptOn = true, lodPx = 0, rung = 0, editorOpen = false, steps = 4 } = {}) {
  const floorDecl = (src.match(/const _LADDER_LOD_PX = \[[^\]]*\];/) || [])[0];
  assert(floorDecl, 'the per-rung floor table is declared');
  return new Function('ADAPT', 'LODPX', 'RUNG', 'EDIT', `
    let _adaptOn = ADAPT, _prStepI = RUNG, editorOpen = EDIT;
    const worldCfg = { lodPx: LODPX };
    ${floorDecl}
    ${extractFunction('_lodFloorNow')}
    ${extractFunction('_lodPxNow')}
    return { px: _lodPxNow(), floor: _lodFloorNow() };`)(adaptOn, lodPx, rung, editorOpen);
}

// ---------------------------------------------------------------- 1. the top rungs are untouched
// This is the compatibility argument, and it is executed rather than asserted.
{
  eq(mkRig({ rung: 0 }).px, 0, 'rung 0 culls nothing — no frame at full quality moves by a pixel');
  eq(mkRig({ rung: 1 }).px, 0, 'rung 1 culls nothing either — the first resolution downshift is still free');
  eq(mkRig({ rung: 0 }).floor, 0, '...and the floor itself is zero there');
  eq(mkRig({ rung: 1 }).floor, 0, '...at both');
}

// ---------------------------------------------------------------- 2. it engages where the machine is in trouble
{
  eq(mkRig({ rung: 2 }).px, 1, 'rung 2 (72% of native, no MSAA, no SSAO) buys back draw calls at 1 px');
  eq(mkRig({ rung: 3 }).px, 2, 'rung 3 goes to 2 px');
  eq(mkRig({ rung: 4 }).px, 3, 'the phone-only bottom rung goes to 3 px');
  // monotone: a worse rung never culls less
  let prev = -1;
  for (let i = 0; i <= 4; i++) { const p = mkRig({ rung: i }).px; assert(p >= prev, 'rung ' + i + ' never culls less than rung ' + (i-1)); prev = p; }
}

// ---------------------------------------------------------------- 3. a FLOOR, never a cap
// A creator who chose a threshold keeps it. The ladder can only ever ask for MORE culling.
{
  for (const rung of [0, 1, 2, 3, 4]) {
    eq(mkRig({ lodPx: 4, rung }).px, 4, 'an authored 4 px survives rung ' + rung + ' — the ladder never lowers it');
    assert(mkRig({ lodPx: 8, rung }).px === 8, 'and an authored 8 px likewise');
  }
  // ...and where the ladder asks for more than the creator did, the larger wins
  eq(mkRig({ lodPx: 1, rung: 3 }).px, 2, 'an authored 1 px at rung 3 rises to the ladder\'s 2');
  eq(mkRig({ lodPx: 3, rung: 3 }).px, 3, '...but an authored 3 px stays 3, because it is already more');
}

// ---------------------------------------------------------------- 4. "off" is a promise of full quality
// Build 1342: turning the scaler off restores everything. This build must not be what breaks that.
{
  for (const rung of [0, 1, 2, 3, 4])
    eq(mkRig({ adaptOn: false, rung }).px, 0, 'adaptive OFF culls nothing at rung ' + rung + ', whatever the ladder left behind');
  eq(mkRig({ adaptOn: false, lodPx: 5, rung: 4 }).px, 5, '...while an authored threshold is still honoured');
  assert(/if\(typeof _adaptOn==='undefined' \|\| !_adaptOn\) return 0;/.test(extractFunction('_lodFloorNow')),
    'the opt-out is the FIRST thing the floor checks');
}

// ---------------------------------------------------------------- 5. the clamp still holds
{
  eq(mkRig({ lodPx: 999, rung: 4 }).px, 16, 'a hostile level value clamps at 16, ladder or not');
  eq(mkRig({ lodPx: -5, rung: 0 }).px, 0, 'a negative authored value is 0, not a negative threshold');
  eq(mkRig({ lodPx: NaN, rung: 2 }).px, 1, 'a NaN authored value falls to the ladder floor rather than poisoning it');
}

// ---------------------------------------------------------------- 6. the rung index cannot run off the table
// `_PR_STEPS` is 4 long on desktop and 5 on a phone; the floor table must cover the longer one and clamp.
{
  const steps = extractConst('_PR_STEPS');
  assert(/IS_COARSE \? \[1, 0\.85, 0\.72, 0\.6, 0\.5\] : \[1, 0\.85, 0\.72, 0\.66\]/.test(steps),
    'the ladder is 5 rungs on a phone and 4 on desktop');
  const table = (src.match(/const _LADDER_LOD_PX = \[([^\]]*)\];/) || [, ''])[1].split(',').map(x => +x.trim());
  eq(table.length, 5, 'the floor table covers the LONGEST ladder, so a phone\'s bottom rung has an entry');
  eq(table[0], 0, 'and its first entry is exactly 0');
  eq(table[1], 0, '...as is its second');
  eq(mkRig({ rung: 99 }).px, table[4], 'an out-of-range rung clamps to the last entry rather than reading undefined');
  eq(mkRig({ rung: -3 }).px, 0, '...and a negative one clamps to the first');
}

// ---------------------------------------------------------------- 7. nothing near the player can vanish
// Build 1273's structural guard — the reason its reported symptom cannot recur at any rung.
{
  eq(+extractConst('LOD_NEAR_KEEP'), 40, 'the near-keep radius is unchanged');
  const tick = src.slice(src.indexOf('function _lodTick(){'), src.indexOf('function _lodTick(){') + 4000);
  assert(/const near = d < LOD_NEAR_KEEP;/.test(tick) || /LOD_NEAR_KEEP/.test(tick),
    '...and the tick still consults it');
  // the editor gate lives where it acts, which is why the floor does not repeat it
  assert(/if\(!px \|\| \(typeof editorOpen!=='undefined' && editorOpen\) \|\| typeof propModels==='undefined'\)\{ _lodRestoreAll\(\); return; \}/.test(src),
    'the tick still refuses to cull while authoring, whatever the threshold says');
  // A bare-name pin here is satisfied by the function's OWN COMMENT explaining that it does not gate on
  // editorOpen — the prose trap this file records under builds 164, 1393, 1395, 1411, 1412 and 1421, and
  // it caught this assertion on its first run. Pin the STATEMENT: there must be no `if(... editorOpen ...)`.
  assert(!/if\([^)]*editorOpen/.test(extractFunction('_lodFloorNow')),
    'so the floor deliberately does NOT repeat that gate — repeating it would make the ladder case unreportable in Level Check');
}

// ---------------------------------------------------------------- 8. the report says WHOSE threshold it is
// Build 1274 made the culler answerable. A threshold the creator never set, reported as if they had, is
// the "number I cannot find in my own settings" that build exists to prevent.
{
  const rep = extractFunction('lodReport');
  assert(/authored/.test(rep) && /floor/.test(rep) && /fromLadder/.test(rep),
    'the report carries the authored value, the ladder floor, and who is responsible');
  assert(/fromLadder: floor > authored/.test(rep), 'and fromLadder is true only when the ladder RAISED it');
  // the advice must match: "set it back to 0" is false when it already is 0
  assert(/raised from '\+r\.authored\+' by the adaptive quality scaler/.test(src),
    'the Level Check row names the scaler when the scaler is responsible');
  assert(/r\.fromLadder \? 'turn off Adaptive resolution in the pause menu' : 'set Cull below \(px\) back to 0'/.test(src),
    '...and gives the fix that matches, rather than pointing at a setting that already reads 0');
  // that control really exists (build 1425's lesson: do not invent a control name)
  assert(/id="adaptResCb"/.test(src) || /adaptResCb/.test(src), 'the Adaptive resolution control it names is real');
}

// ---------------------------------------------------------------- 9. the ladder itself is untouched
// This build adds a READER of `_prStepI`. It must not have changed what moves it.
{
  const t = extractFunction('_adaptResTick');
  assert(!/_LADDER_LOD_PX/.test(t) && !/lodPx/.test(t),
    'the ladder knows nothing about culling — it moves the rung, and the threshold reads it');
  assert(/_prStepI\+\+; _prScale=_PR_STEPS\[_prStepI\]; _applyPixelRatio\(\);/.test(t), 'the downshift is unchanged');
  assert(/if\(_prStepI > 0\)\{ _prStepI--; _prScale=_PR_STEPS\[_prStepI\]; _applyPixelRatio\(\); \}/.test(t),
    'and the climb is unchanged — so the floor is restored by the same motion that restores resolution');
}

done('build 1457 (performance audit CRITICAL): the adaptive ladder shed motion blur, MSAA+SSAO, resolution and the sun\'s shadow map and NEVER touched `lodPx` — so the single largest scaling lever in the engine, measured by build 1270 at -32% of draw calls, was opt-in and unreachable by the system whose entire job is finding relief. `_lodPxNow` now takes the larger of the creator\'s value and a per-rung FLOOR. Build 1273 is not reversed: its argument that a feature which deletes a creator\'s prop cannot be on by default is intact, and what it does not cover is a device already at 60-66% of native with its antialiasing and AO gone. Executed: rungs 0 and 1 are exactly 0 so no full-quality frame moves; rungs 2/3/4 go to 1/2/3 px monotonically; an authored threshold is never LOWERED at any rung; adaptive OFF returns 0 at every rung, because build 1342 made "off" a promise of full quality; hostile, negative and NaN values still clamp; and an out-of-range rung clamps to the table rather than reading undefined. LOD_NEAR_KEEP stays 40 so nothing within 40 m can vanish at any rung — the structural reason 1273\'s reported symptom cannot recur. The floor deliberately does NOT repeat the tick\'s editor gate, because that would make the case unreportable in Level Check, whose row now names the SCALER when the scaler raised the threshold and offers the matching fix rather than telling a creator to set a slider back to a 0 it already reads');
