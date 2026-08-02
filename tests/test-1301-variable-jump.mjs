import { gameSource, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1301 — gameplay audit F6, "MED (fatal for the platformer genre)", verified still live:
//
//   "Greped jumpCut, shortHop, holdJump, varJump -> zero hits, and the jump is one assignment
//    (player.vel.y = JUMP) with no release handling. Every jump is exactly 2.82 m. Rumpus advertises a
//    side-scroll mode with a lane lock — a 2.5D platformer where you cannot tap for a short hop is missing
//    the primary verb of the genre."
//
// Releasing while RISING cuts the remaining ascent. Height goes as v², so one setting spans the whole
// tap-to-hold range: half the launch velocity is a quarter of the height.

const DW = new Function('return ' + extractConst('DEFAULT_WORLD', src) + ';')();
const JUMP = DW.jump, GRAV = DW.grav, CUT = DW.jumpCut;
const CUT_MIN = +src.match(/const JUMP_CUT_MIN = ([0-9.]+);/)[1];
// The engine integrates with semi-implicit Euler at the real frame time, so a simulated apex sits a little
// UNDER the analytic v²/2g (0.10 m at 60fps, more at 20fps). That is pre-existing and true of every
// trajectory in the engine; this build owns the RATIO between a tap and a hold, not the absolute height, so
// the frame-rate assertions below are stated on the ratio.
const ANALYTIC = JUMP * JUMP / (2 * GRAV);

// ---------------------------------------------------------------- the physics, simulated frame by frame
// The apex is what a player feels, so measure THAT rather than the velocity the code writes.
function apex(holdMs, cut, dtMs = 16) {
  let vy = JUMP, y = 0, t = 0, held = true, prevHeld = true, best = 0;
  for (let i = 0; i < 400; i++) {
    held = t < holdMs;
    if (prevHeld && !held && vy > 0 && cut < 1) vy = Math.min(vy, JUMP * cut);   // the shipped line
    prevHeld = held;
    const dt = dtMs / 1000;
    vy -= GRAV * dt; y += vy * dt; t += dtMs;
    if (y > best) best = y;
    if (y <= 0 && i > 2) break;
  }
  return best;
}
{
  const full = apex(10000, CUT);
  near(full, ANALYTIC, 0.15, 'HOLDING still reaches the full analytic height (v²/2g), within the integrator’s own step loss');
  near(full, 2.82, 0.15, '...which is the 2.82 m the audit measured — unchanged');
  const tap = apex(0, CUT);
  assert(tap < full, 'a TAP is lower — the verb the audit says the genre needs');
  near(tap / full, CUT * CUT, 0.06, '...by the square of the cut, because height goes as v²');
  near(tap, 0.71, 0.08, 'the shipped 0.5 gives a ~0.7 m hop');
  // and it is a RANGE, not two heights: the longer you hold, the higher you go
  const heights = [0, 60, 120, 200, 300, 500].map(ms => apex(ms, CUT));
  for (let i = 1; i < heights.length; i++)
    assert(heights[i] >= heights[i - 1] - 1e-9, 'holding ' + [0,60,120,200,300,500][i] + 'ms is at least as high as holding less');
  assert(heights[heights.length - 1] > heights[0] * 3, 'and the range is wide enough to platform with');
}
{ // jumpCut:1 IS THE OLD ENGINE, byte for byte — the compatibility escape hatch
  for (const ms of [0, 30, 100, 250, 9999])
    near(apex(ms, 1), apex(9999, 1), 1e-12, 'with jumpCut 1 a ' + ms + 'ms press reaches the same height as a held one');
  near(apex(0, 1), ANALYTIC, 0.15, '...the full analytic height');
}
{ // release AFTER the apex must not brake the fall — that is a different, and bad, feature
  const late = apex(600, CUT);          // 600 ms > the 433 ms rise, so the release lands during descent
  near(late, apex(10000, CUT), 1e-9, 'releasing on the way DOWN changes nothing');
  // and the cut never ADDS height
  for (const ms of [0, 50, 150, 400, 800]) assert(apex(ms, CUT) <= apex(10000, CUT) + 1e-9,
    'no press length beats holding (' + ms + 'ms)');
}
{ // frame rate must not change the outcome — this is a per-EVENT cut, not a per-frame one
  // the ABSOLUTE apex drifts with the step (the integrator's, not this build's), so assert the ratio —
  // which is the quantity this build actually decides.
  const ref = apex(0, CUT, 16) / apex(9999, CUT, 16);
  for (const dt of [8, 16, 33, 50])
    near(apex(0, CUT, dt) / apex(9999, CUT, dt), ref, 0.05,
      'the tap-to-hold ratio is the same at ' + Math.round(1000 / dt) + 'fps — the cut is a per-EVENT rule, not a per-frame one');
}
{ // the settings a creator can reach
  eq(CUT, 0.5, 'the engine ships a half-velocity, quarter-height tap hop');
  for (const c of [0, 0.25, 0.5, 0.75, 1]) {
    const a = apex(0, c);
    assert(a >= 0, 'cut ' + c + ' is a real height');
    assert(a <= apex(9999, c) + 1e-9, '...never above the held height');
  }
  // A CUT OF EXACTLY 0 ZEROES THE RISING VELOCITY — the player never leaves the ground and the jump input
  // is silently swallowed. So the setting is floored rather than allowed to reach it.
  eq(apex(0, 0), 0, 'a cut of 0 really would swallow the jump…');
  assert(apex(0, CUT_MIN) > 0, '…which is why the floor exists — the shortest allowed hop still leaves the floor');
  near(apex(0, CUT_MIN) / ANALYTIC, CUT_MIN * CUT_MIN, 0.02, '...at the square of the floor, ~1% of full height');
  assert(/const JUMP_CUT_MIN = 0\.1;/.test(src), 'the floor is a named constant');
  assert(/JUMP_CUT = Math\.max\(JUMP_CUT_MIN, Math\.min\(1,/.test(src), '...and the clamp uses it');
  assert(/a slider that can silently swallow the jump input is a\n     worse outcome than one that cannot quite reach "no hop"/.test(src),
    'and why it is floored rather than allowed to reach 0 is recorded');
  assert(/slider\(b,'Tap hop','jumpCut',0\.1,1,0\.05\);/.test(src), 'the slider cannot reach 0 either');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/if\(_jumpHeldPrev && !_jHeld && player\.vel\.y > 0 && !player\.onGround && JUMP_CUT < 1\)\{/.test(src),
    'the cut fires on the RELEASE EDGE, while rising, in the air, and only when enabled');
  assert(/player\.vel\.y = Math\.min\(player\.vel\.y, JUMP \* JUMP_CUT\);/.test(src),
    '...and it is a MIN, so it can only ever take height away — never grant it');
  // ordering: the release edge is read before _jumpHeldPrev is updated for the next frame
  const i = src.indexOf('if(_jumpHeldPrev && !_jHeld && player.vel.y > 0');
  const j = src.indexOf('_jumpHeldPrev = _jHeld;', i);
  assert(i > 0 && j > i, 'the edge is consumed BEFORE the held state is carried forward, or it would never fire');
  // it must come after the jump itself, or a press-and-release inside one frame would cut a jump that had not launched
  assert(src.indexOf('player.vel.y = JUMP; player.onGround=false;') < i,
    'and after the launch, so the two cannot fight over the same frame');
  assert(/JUMP_CUT = Math\.max\(JUMP_CUT_MIN, Math\.min\(1, worldCfg\.jumpCut == null \? DEFAULT_WORLD\.jumpCut : \+worldCfg\.jumpCut\)\);/.test(src),
    'the setting is clamped like every other world value, so a hostile level file cannot invert it');
  assert(/let SPEED, SPRINT, JUMP, GRAV, CROUCH_SPEED, JUMP_CUT = 0\.5;/.test(src),
    'and it is seeded at declaration, so a frame before the first applyWorldCfg cannot read undefined');
}
{ // a creator can find it, next to the jump it modifies
  assert(/slider\(b,'Jump','jump',0,30,0\.5\); slider\(b,'Tap hop','jumpCut',0\.1,1,0\.05\);/.test(src),
    'the slider sits immediately beside Jump — the number it is a qualifier of');
  assert(/1 = every jump is full height, the pre-1301 engine/.test(src),
    '...and says what the ends mean, including which one is the old behaviour');
}
{ // the compatibility argument is recorded, because a movement change has to answer for existing levels
  assert(/it can only ever reduce the height of a jump the player CHOSE to release early, and a player attempting\n  \/\/ a demanding jump holds the key/.test(src),
    'why this does not break an existing jump puzzle is written down');
  assert(/Only while RISING: cutting a descent would be a mid-air brake/.test(src),
    'and why the rising test is not incidental');
}

done('build 1301 (gameplay audit F6): variable jump height — every jump was exactly 2.82 m with no release handling, which the audit called fatal for the side-scroll mode the engine advertises. Releasing while rising now cuts the remaining ascent, so one setting spans tap-to-hold (height goes as v², so the shipped 0.5 is a quarter-height 0.7 m hop); simulated frame by frame across 8-50 ms frames, a held jump still reaches the same 2.82 m, releasing during the descent changes nothing, and jumpCut:1 is the old engine exactly. Safe for existing levels because it only shortens a jump the player chose to release, and a demanding jump is one you hold');
