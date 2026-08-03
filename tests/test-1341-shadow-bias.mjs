import { gameSource, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1341 — reported from play with screenshots: light leaking along edges and inside CLOSED ROOMS, and
// a column whose shadow starts with a lit gap instead of at its base.
//
// Both are one number. Measured live at the shipped defaults BEFORE this build:
//   shadowDist 60, map 2048, extent 60  ->  texel 5.86 cm,  normalBias 0.4512  (7.7 texels)
//   the far cascade                     ->  normalBias 1.805
// Forty-five centimetres of world-space offset along the receiver's normal — and the room tool's own
// default wall is `roomDraft.t = 0.3`. The lookup was displaced ONE AND A HALF WALLS, so it landed on the
// lit side and the room was lit through its own wall; the same offset slides a contact shadow out from
// under the thing casting it, which is the gap at the column's base.
//
// THE UNIT WAS THE BUG. Build 1125 correctly re-expressed a world constant in TEXELS so it would scale
// with build 1120's variable volume — but the trade has two ends measured in different units: acne is a
// SAMPLING artifact whose scale is texels, while leak and peter-panning are GEOMETRY artifacts whose scale
// is metres, set by how thin the things a creator builds are. A rule in texels alone cannot know that at
// shadowDist 60 it has grown past a wall.
//
// The curve after, measured live across the whole shadowDist range:
//   dist    texel      normalBias   texels   far cascade
//     8     0.78cm     0.060        7.7      0.150      <- unchanged: the texel rule still binds
//    20     1.95cm     0.150        7.7      0.150      <- the crossover
//    30     2.93cm     0.150        5.1      0.176
//    60     5.86cm     0.150        2.6      0.352      <- the default: was 0.451 / 1.805
//   120    11.72cm     0.176        1.5      0.703
//   400    39.06cm     0.586        1.5      0.732      <- the texel floor takes over
//
// NOT verified here: that the residual gap at 0.15 is smaller than at 0.45. Three attempts at that
// measurement produced junk (a saturated counter, a non-monotonic leak reading, and a scanline that was
// measuring the column's own lit edge). What IS established is the parameter, the geometry it exceeded,
// and that the bias is what lights those pixels — a controlled A/B at 0 turned the base region from
// 57,56,54,52 to 26,26,26,26. The residual is a browser check, and it is in the release-blocker list.

const cap = new Function(`
  const WALL_REF_M = ${extractConst('WALL_REF_M')};
  const SUN_NB_MAX_M = ${extractConst('SUN_NB_MAX_M')};
  const SUN_NB_MIN_TEXELS = ${extractConst('SUN_NB_MIN_TEXELS')};
  const SUN_NB_TEXELS = ${extractConst('SUN_NB_TEXELS')};
  ${src.match(/const _sunNbCap = [^\n]+/)[0]}
  ${src.slice(src.indexOf('const _sunNormalBias = '), src.indexOf('const SHADOW_REFIT_TEXELS'))}
  return { _sunNormalBias, _sunNbCap, SUN_NB_MAX_M, SUN_NB_TEXELS, SUN_NB_MIN_TEXELS };`)();

// ---------------------------------------------------------------- the cap is DERIVED from a wall
{
  eq(+extractConst('WALL_REF_M'), 0.3, 'the reference wall is the room tool’s own default thickness');
  // ...and that link is enforced rather than restated: if the room tool's default changes, this fails
  // match ` t:` specifically — a loose [^}]* ran into the openings array and picked up height:2.1
  const rd = src.match(/let roomDraft = \{ w:\d+, d:\d+, h:\d+, t:([0-9.]+)/);
  assert(rd, 'roomDraft is present');
  eq(+rd[1], +extractConst('WALL_REF_M'),
    'WALL_REF_M IS roomDraft.t — the cap describes the thing it is protecting, rather than a number beside it');
  eq(cap.SUN_NB_MAX_M, 0.15, 'and the cap is half of it, so the offset cannot reach a wall’s mid-plane');
}

// ---------------------------------------------------------------- the shipped default
{
  const nb = cap._sunNormalBias(60, 2048);
  near(nb, 0.15, 1e-9, 'at the default shadowDist 60 and a 2048 map the offset is 0.15 m…');
  assert(nb < 0.3, '…which is inside a wall rather than through it');
  near(nb / (2 * 60 / 2048), 2.56, 0.02, 'and 2.6 texels — the ordinary range for a normal offset');
  // the value it replaces, recomputed from the old rule, so the size of the change is on the record
  near(Math.min(0.6, (2 * 60 / 2048) * 7.7), 0.4512, 1e-4, 'the old rule gave 0.4512 m at the same settings');
}

// ---------------------------------------------------------------- it only ever LOWERS the bias
{
  // A small volume is untouched: that is what makes this safe to ship without an acne re-tune.
  // the crossover sits just under extent 20, so 20 itself is capped by a hair — 8 and 10 are the
  // untouched cases, and stating that precisely is the point of the sweep
  for (const [ext, px] of [[8, 2048], [10, 2048], [19, 2048]]) {
    const old = Math.min(0.6, Math.max(0.02, (2 * ext / px) * 7.7));
    const now = cap._sunNormalBias(ext, px);
    near(now, old, 1e-9, 'shadowDist ' + ext + ' is byte-identical — the texel rule still binds there');
  }
  for (const [ext, px] of [[30, 2048], [60, 2048], [120, 2048], [400, 2048], [240, 2048]]) {
    const old = Math.min(0.6, Math.max(0.02, (2 * ext / px) * 7.7));
    assert(cap._sunNormalBias(ext, px) <= old + 1e-9,
      'and past the crossover it is never LARGER than the old rule (extent ' + ext + ')');
  }
}

// ---------------------------------------------------------------- ...but never below the sampling scale
{
  // The cure must not become the disease: a flat 0.15 m cap would be 0.4 of a texel at shadowDist 400,
  // far too little to clear acne on the volume where the map is coarsest.
  for (const ext of [8, 20, 60, 120, 240, 400, 1000]) {
    const t = 2 * ext / 2048, nb = cap._sunNormalBias(ext, 2048);
    assert(nb >= Math.min(t * 7.7, t * 1.5) - 1e-9,
      'extent ' + ext + ': never under 1.5 texels (or the 7.7-texel value where that is smaller)');
    assert(nb <= Math.max(0.15, t * 1.5) + 1e-9, 'extent ' + ext + ': never over the cap');
  }
  near(cap._sunNormalBias(400, 2048), 0.586, 1e-3, 'at a 400 extent the texel floor takes over, at 1.5 texels');
  near(cap._sunNormalBias(400, 2048) / (2 * 400 / 2048), 1.5, 1e-6, '...exactly 1.5');
}

// ---------------------------------------------------------------- one derivation, three consumers
{
  // The near cascade, the far cascade and a creator's spotlight all had their own literal cap (0.6, 2.2,
  // 0.35). Three caps is three things to keep in step, and the far one was 1.8 m — six walls.
  assert(/moonFar\.shadow\.normalBias = _sunNormalBias\(F, fpx\);/.test(src), 'the far cascade shares the derivation');
  assert(/light\.shadow\.normalBias = _sunNormalBias\(range, px\);/.test(src), 'and so does a placed spotlight');
  assert(!/Math\.min\(2\.2,/.test(src), 'the far cascade’s own 2.2 cap is gone');
  assert(!/Math\.min\(0\.35, Math\.max\(0\.01/.test(src), 'and the spotlight’s 0.35');
  // four CALLS (the declaration is `= (extent, px) =>`, so it does not match): the boot seed, the near
  // refit, the far refit and the spotlight. A fifth would be a site keeping its own rule.
  eq((src.match(/_sunNormalBias\(/g) || []).length, 4,
    'the boot seed + the near refit + the far refit + the spotlight all call the one derivation');
}

// ---------------------------------------------------------------- and the reasoning is recorded
{
  assert(/THE UNIT WAS THE BUG/.test(src), 'the diagnosis is written where the constant lives');
  assert(/ACNE is a shadow-map SAMPLING artifact\. Its scale is TEXELS/.test(src), 'both ends of the trade are named…');
  assert(/LIGHT LEAK and PETER-PANNING are GEOMETRY artifacts\. Their scale is METRES/.test(src), '…in their own units');
  assert(/the cure becomes the disease/.test(src), 'and why the cap needs a floor of its own');
  assert(/build 1125/.test(src), 'with credit to the build that got half of it right');
}

done('build 1341, reported from play with screenshots: light leaking along edges and inside closed rooms, and a column whose shadow starts with a lit gap instead of at its base. Both are one number — measured live, `moon.shadow.normalBias` was 0.4512 at the shipped defaults, forty-five centimetres of offset along the receiver normal, against a room tool whose default wall is 0.3 m. The lookup was displaced one and a half walls, so it landed on the lit side and the room was lit through its own wall. THE UNIT WAS THE BUG: build 1125 correctly re-expressed a world constant in texels so it would scale with build 1120\'s variable volume, but the trade has two ends measured in different units — acne is a sampling artifact whose scale is texels, leak and peter-panning are geometry artifacts whose scale is metres, set by how thin the things a creator builds are. So the texel rule stays and a world cap sits beside it, derived from the room tool\'s own default wall rather than picked, with a 1.5-texel floor so the cure cannot become the disease on the volumes where the map is coarsest. It only ever lowers the bias and never below the sampling scale: shadowDist 8 and 20 are byte-identical, the default 60 goes 0.451 to 0.150 (2.6 texels), and 400 lands on the floor at 1.5 texels. The far cascade (1.805 — six walls) and a creator\'s spotlight now share the one derivation instead of carrying their own caps. NOT verified here: that the residual gap at 0.15 is smaller than at 0.45 — three attempts at that measurement produced junk, and it is a browser check');
