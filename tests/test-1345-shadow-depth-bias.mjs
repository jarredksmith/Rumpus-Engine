// (build 1345) THE CORNER LEAK WAS THE DEPTH BIAS, NOT THE NORMAL BIAS.
// Third report of light leaking into closed rooms and along corners. Build 1341 cut normalBias from 0.45 m
// to 0.15 m for exactly this and the reporter still saw it — so this time a sealed room was built in the
// engine and the light decomposed instead of reasoned about (tools/probe/room-leak*.mjs).
//
// The leaking pixels sit ~1 cm from a concave corner and the wall that should shadow them is EIGHT
// MILLIMETRES away — an order of magnitude under the near cascade's 5.86 cm texel. Swept with both
// cascades stated per row so nothing carried over:
//
//   normalBias  0 / 0.05 / 0.10 / 0.15 / 0.45   ->  353 / 358 / 365 / 359 / 357 leaking px   FLAT
//   map size    512 / 2048 / 4096               ->  flat.   shadowRadius 0 -> flat
//   far cascade off -> unchanged.   NEAR cascade off -> zero.   sun off -> zero
//   shadow.bias 0 / -1e-4 / -4e-4* / -5e-4 / -2e-3 / -8e-3 / -3e-2
//               ->  151 / 208 / 354 / 404 / 1500 / 7417 / 25986        (* = the shipped value)
//
// A depth bias shifts the comparison depth by a constant, which is precisely what lets light past an
// occluder closer to the receiver than the offset — a concave corner is that case by definition. A normal
// offset moves the sample ALONG THE SURFACE and cannot do this. So the depth bias goes to zero and the
// normal offset keeps doing the acne work it was built for.
import { gameSource, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the value, and it is named ONCE so the two cascades cannot drift ----
eq(Number(extractConst('SHADOW_DEPTH_BIAS')), 0, 'the sun cascades carry no constant depth bias');
assert(/moon\.shadow\.bias = SHADOW_DEPTH_BIAS;/.test(src), 'the near cascade reads the constant');
assert(/moonFar\.shadow\.bias = SHADOW_DEPTH_BIAS;/.test(src), 'and so does the far one');
{
  // build 1341's lesson: three literal caps that had to be kept in step, and the far one never was.
  const lits = (src.match(/shadow\.bias\s*=\s*-?\d/g) || []);
  eq(lits.length, 1, 'exactly ONE literal shadow.bias survives in the file — the placed spotlight');
  assert(/light\.shadow\.bias = -0\.0005;/.test(src), '...and that is the creator-placed spot');
}

// ---- the spotlight is deliberately excluded, with its reason at the line ----
{
  const i = src.indexOf('light.shadow.bias = -0.0005;');
  const before = src.slice(Math.max(0, i - 700), i);
  assert(/build 1345/.test(before), "the spot's exclusion is explained where it lives, not left to be found");
  assert(/perspective|frustum/.test(before),
    '...and the reason is that the sweep ran on ORTHOGRAPHIC cascades, so it does not transfer');
  assert(/have not made it|not measured|does not transfer/.test(before),
    'stated as unmeasured rather than implied to be fine');
}

// ---- build 1341's normalBias derivation is UNTOUCHED, which is the point ----
// This build ruled that parameter out by measurement; it must not also quietly move.
{
  // _sunNormalBias is an arrow const, so extractFunction cannot reach it — pin the derivation in the source
  const f = src.match(/const _sunNormalBias = \(extent, px\) =>[\s\S]{0,400}?\};/);
  assert(f, 'the derivation still exists');
  assert(/Math\.min\(_sunNbCap\(t\), Math\.max\(0\.02, t \* SUN_NB_TEXELS\)\)/.test(f[0].replace(/\s+/g, ' ')),
    '1341: the texel rule with a world cap, unchanged');
  eq(Number(extractConst('SUN_NB_TEXELS')), 7.7, '...its texel figure is unchanged');
  eq(Number(extractConst('WALL_REF_M')), 0.3, '...and it is still derived from the room tool’s own wall');
  assert(/moon\.shadow\.normalBias = _sunNormalBias\(/.test(src), 'the near cascade still derives its normal offset');
}

// ---- the evidence is recorded at the site, because a zero is invisible without it ----
{
  const i = src.indexOf('const SHADOW_DEPTH_BIAS');
  const why = src.slice(Math.max(0, i - 3200), i);
  assert(/8 mm|EIGHT MILLIMETRES|eight millimetres/i.test(why),
    'the measurement that identifies the mechanism (the occluder is 8 mm from its receiver) is written down');
  assert(/151/.test(why) && /354/.test(why), 'the before/after leak counts are stated');
  for (const [needle, why_] of [
      [/normalBias\s+0 \/ 0\.05/, 'the normalBias sweep that EXONERATES build 1341 is recorded, or it gets re-blamed'],
      [/NEAR cascade off -> zero/, 'and which cascade it came from'],
      [/ACNE, stated honestly/, 'the acne measurement is reported as inconclusive rather than as a clean trade'],
      [/instrument cannot detect acne/, '...naming the instrument as the limitation'],
      [/A RESIDUE REMAINS/, 'and the residue is stated, so nobody tunes this number chasing the last of it']])
    assert(needle.test(why), why_);
}

// ---- the residue's real answer is contact-scale occlusion, which the engine has ----
// build 1346 added a second 'A RESIDUE REMAINS' note, and indexOf finds THAT one first — a needle that
// stops being unique is the same failure as a character-budget window. Scope to 1345's own block.
{ const blk = src.slice(src.indexOf('const SHADOW_DEPTH_BIAS') - 3200, src.indexOf('const SHADOW_DEPTH_BIAS'));
  const i = blk.indexOf('A RESIDUE REMAINS');
  assert(i >= 0, "1345's residue note is in its own block");
  assert(/SSAO|per-vertex bake/.test(blk.slice(i, i + 400)),
    'the note points at the terms that CAN close a sub-texel corner, rather than at more bias'); }

done('build 1345: the shadow depth bias was the corner leak, and the normal offset was innocent');
