// (build 1346) THE CORNER LEAK IS ONE TEXEL WIDE, SO THE TEXEL IS THE ONLY LEVER.
// Build 1345 halved the leak (354 -> 156 px) and the reporter said it looked unchanged — fair, since 156
// pixels of a bright line is still a bright line. So the residue was characterised instead of argued about.
//
// WHERE: the bright pixels are on a wall's INNER face at y = 2.99-3.00, the wall/ceiling junction, facing
// the sun (N.L 0.74), with the occluder ONE MILLIMETRE away. The benign explanation — a sunlit top face
// seen edge-on, which would be correct rendering — is dead: of eight sampled, upFaces 0, sideFaces 8.
//
// WHAT IT SCALES WITH, and it is exactly one thing:
//   shadowDist  400 / 120 / 60 / 30 / 15 / 8   ->  910 / 300 / 141 / 75 / 37 / 28 leaking px
//   texel      39.06 / 11.72 / 5.86 / 2.93 / 1.46 / 0.78 cm        — proportional
//   normalBias flat across its range · shadowRadius flat · seam overlap 3/6/12 cm flat (141/140/131)
//
// texel = 2*extent / mapSize, so map size is the other half of that ratio and is the half that does not
// shorten the range at which shadows exist. Measured, with the return to 2048 as the control:
//   near map   2048 / 4096 / 8192 / 2048   ->  136 / 70 / 39 / 137 px  at  323.6 / 364.3 / 528.3 / 330.6 ms
import { gameSource, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the rung that was worth its cost ----
{
  const c = extractConst('SUN_SHADOW_PX');
  assert(/IS_COARSE\s*\?\s*1024\s*:\s*4096/.test(c),
    'the near cascade is 4096 on desktop (half the texel, half the leak, ~12% of frame time) and phones ' +
    'are untouched at 1024 — 12% is not free there and a 4096 depth map is ~16x the memory');
  assert(/moon\.shadow\.mapSize\.set\(SUN_SHADOW_PX, SUN_SHADOW_PX\);/.test(src),
    'the near cascade reads it');
}

// ---- and the one that was NOT: 8192 quarters the leak for 63% of frame time ----
assert(!/8192/.test(extractConst('SUN_SHADOW_PX')), 'the measured-and-rejected rung did not sneak in');

// ---- the FAR cascade deliberately stays coarse ----
{
  const far = src.match(/moonFar\.shadow\.mapSize\.set\(([^)]*)\)/);
  assert(far, 'the far cascade still sets its own map size');
  assert(/2048,\s*2048/.test(far[1]),
    'the far cascade stays 2048: its texel is 4x coarser BY DESIGN and a one-texel line on geometry tens ' +
    'of metres away is under a pixel — doubling it would pay the cost where it cannot be seen');
  assert(!/SUN_SHADOW_PX/.test(far[1]), '...so it must not share the near constant');
}

// ---- ORDERING: the constant is declared above its use ----
// The mapSize line runs ~140 lines before SHADOW_DEPTH_BIAS is declared, so putting this beside that
// constant would have been a temporal dead zone — and `typeof` does not guard a TDZ (builds 1127, 1331).
{
  const decl = src.indexOf('const SUN_SHADOW_PX');
  const use = src.indexOf('moon.shadow.mapSize.set(SUN_SHADOW_PX');
  const coarse = src.indexOf('const IS_COARSE');
  assert(coarse >= 0 && coarse < decl, 'IS_COARSE is declared before the constant that reads it');
  assert(decl >= 0 && decl < use, 'SUN_SHADOW_PX is declared BEFORE the line that uses it');
  assert(decl < src.indexOf('const SHADOW_DEPTH_BIAS'),
    '...and above SHADOW_DEPTH_BIAS, which is where it would have been a TDZ');
}

// ---- build 1345's work is untouched: this build ADDS a lever, it does not retune the last one ----
eq(Number(extractConst('SHADOW_DEPTH_BIAS')), 0, '1345’s depth bias is still zero');
assert(/moon\.shadow\.normalBias = _sunNormalBias\(/.test(src), '1341’s normal offset still derives itself');

// ---- the evidence, at the site ----
{
  const i = src.indexOf('const SUN_SHADOW_PX');
  const why = src.slice(Math.max(0, i - 2600), i);
  for (const [needle, msg] of [
      [/ONE MILLIMETRE/, 'the occluder distance that makes this a resolution limit is written down'],
      [/upFaces 0, sideFaces 8/, 'and the check that killed the benign "it is a lit top face" reading'],
      [/910\s+300\s+141\s+75\s+37\s+28|910     300     141      75      37      28/, 'the shadowDist sweep'],
      [/FLAT across its whole range/, 'and that normalBias is flat, so nobody re-blames build 1341'],
      [/8192 quarters it for 63%/, 'the rejected rung is recorded with its cost'],
      [/A RESIDUE REMAINS/, 'the residue is stated'],
      [/contact shadows/, '...and pointed at the technique that could actually close it']])
    assert(needle.test(why), msg);
}

done('build 1346: half the texel, half the corner leak — and the map size is the only lever left');
