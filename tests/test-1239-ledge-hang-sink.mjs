// build 1239: the ledge hang sinks below the lip — reported from play: "positions the chest/belly at
// the edge, torso/arms/head way over the top, clinging to thin air." Build 966's formula put the
// avatar's HEAD TOP exactly at the lip by construction (hy = lip + EYE - vh*1.02), whatever the
// model's height — correct for a body standing at the wall, wrong for a HANG, whose pose raises the
// arms ~0.4 above the head: the hands gripped air above the edge and half the body cleared the lip.
// LEDGE_HANG_SINK drops the whole hang so raised hands land ON the lip.
import { gameSource, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the geometry, computed from the shipped constants
{
  const SINK = +src.match(/const LEDGE_HANG_SINK = ([0-9.]+);/)[1];
  near(SINK, 0.42, 1e-9, 'the sink ships at 0.42 — roughly a raised forearm');
  // replay the hy formula for a representative avatar and ledge
  const EYE = 1.7, lip = 10, vh = 1.7;
  const hy = lip + EYE - vh * 1.02 - SINK;                       // player.pos.y (the EYES) at full hang
  const feet = hy - EYE, headTop = feet + vh;
  assert(headTop < lip, 'the head top now sits BELOW the lip (was exactly at it)');
  near(lip - headTop, 0.454, 0.01, '...by ~0.45 — so hands raised ~0.4 above the head land ON the edge, not in the air over it');
  assert(hy < lip, 'first person: the eyes are under the lip — you look at the wall face with the edge just above view centre, not out over a ledge you are supposedly dangling from');
  near(lip - hy, 0.454, 0.01, '...about 0.45 under');
  // and the pull-up still ends standing ON the ledge, unchanged
  assert(/ty:_lt\+EYE/.test(src), 'the pull-up target is still eyes-at-standing-height on the ledge top');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/const _hy=Math\.max\(_lt \+ EYE - _vh\*1\.02 - LEDGE_HANG_SINK, _gy \+ EYE - 0\.12\);/.test(src),
    'the hang height carries the sink (966\'s avatar-height sizing is kept — a short model still hangs by its hands, not its waist; 1243 added the ground clamp so low-window ledges cannot bury the feet)');
  const i0 = src.indexOf('const LEDGE_HANG_SINK'), i1 = src.indexOf('const _hy=Math.max(_lt + EYE');
  assert(i0 > 0 && i0 < i1, 'the constant is declared above its reader (the TDZ rule this file has been burned by)');
}

done('build 1239: the ledge hang sinks 0.42 below the old head-at-lip framing — computed from the shipped constants: head top ~0.45 under the lip so a raised-arm hang grips the edge instead of thin air, eyes under the lip for correct first-person framing, the pull-up still lands standing on top, and the avatar-height sizing survives');
