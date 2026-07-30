// build 1156: the stock level's ground plane is the same ground its sky dome draws.
//
// The first frame anybody sees read as monochrome teal, and it was not the grade, the sky or the lights:
// `DEFAULT_WORLD.skyGround` — the dome's own ground band — is WARM (linear B/R 0.80), while the ground plane it
// abuts was `0x4f5d66`, blue-dominant at B/R 1.70. The horizon had two different grounds, and the blue one was
// the largest surface in the frame.
//
// That is exactly the fault build 1143 fixed for GENERATED levels and 1151 made derivable: `groundMood` names
// the ground albedo once and hands the same value to the bake, the dome's ground band and the engine plane.
// `DEFAULT_WORLD` was never run through it. This build applies the same derivation by hand — skyGround's HUE at
// the floor's OWN luminance — and this test pins the LINK rather than the hex, so retuning the dome without
// the plane fails here instead of putting two grounds either side of one horizon again.
//
// Measured, headless, at the real spawn pose (a control pair first: two runs of the unchanged build agreed to
// 0.1 of a percentage point on every figure below, so every delta here is far outside run-to-run spread):
//
//                    frame mean      distant architecture    lower frame: B is the largest channel
//   before        111,128,138          103,121,128 (B>G>R)          63.7%  (reddest 22.1%)
//   floor warmed  114,128,135          114,119,117 (neutral)        46.6%  (reddest 33.5%)
//   + wall too    115,128,134          115,119,116                  41.5%  (reddest 39.4%)
//
// The wall change is NOT shipped: it buys 5 points and spends the cool-distance note a warm ground reads
// against. Recorded so it is not re-derived. The frame's luminance is unmoved (128 green, all three runs) —
// which is the point of matching the luminance rather than adopting skyGround outright.
import { gameSource, extractConst, assert, near, eq, done } from './harness.mjs';
const src = gameSource();

const W = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/);
assert(W, 'DEFAULT_WORLD is readable');
const num = (k) => { const m = W[0].match(new RegExp(k + ':(0x[0-9a-fA-F]+)')); assert(m, k + ' is declared'); return parseInt(m[1], 16); };

const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lin = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(v => s2l(v / 255));
const Y = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
const unit = (a) => { const y = Y(a); return a.map(v => v / y); };      // hue, with luminance divided out

const floor = lin(num('floorColor')), ground = lin(num('skyGround')), wall = lin(num('wallColor'));

// ---------------------------------------------------------------- THE link
{
  const f = unit(floor), g = unit(ground);
  for (let k = 0; k < 3; k++)
    near(f[k], g[k], 0.035, 'the ground plane and the dome\'s ground band are the same HUE (ch ' + k + ': ' +
      f[k].toFixed(3) + ' vs ' + g[k].toFixed(3) + ')');
  assert(floor[0] > floor[2], 'and it is WARM — red above blue, like the band it meets at the horizon');
  assert(floor[0] / floor[2] > 1.15, '...clearly so (B/R ' + (floor[2] / floor[0]).toFixed(2) + ')');
}
{
  // luminance is HELD. The grade, the exposure and build 1149's bounce term are all tuned against it, so this
  // build swaps hue and moves nothing else. 0.1045 is what 0x4f5d66 measured before the change.
  near(Y(floor), 0.1045, 0.004, 'the floor keeps the luminance the whole grade was tuned against (Y ' + Y(floor).toFixed(4) + ')');
  assert(Math.abs(Y(floor) - Y(ground)) > 0.02,
    'and it is NOT simply skyGround adopted outright — that band is 29% brighter and would move the exposure');
}
{
  // the wall is deliberately left cool: a warm ground needs something to read against
  assert(wall[2] > wall[0], 'the boundary wall stays COOL, on purpose (see the numbers in the header)');
  assert(Y(wall) > Y(floor), '...and brighter than the ground, so the far edge still recedes');
}

// ---------------------------------------------------------------- it must not leak into existing content
{
  // every saved level carries its OWN full world block, so a creator's floor is untouched by this
  assert(/world:\s*Object\.assign\(\{\}, worldCfg\)/.test(src),
    'serializeLevel writes the WHOLE world block, so no saved level inherits this default');
  assert(/const out = Object\.assign\(\{\}, DEFAULT_WORLD, w \|\| \{\}\);/.test(src),
    '...and _worldFrom lets the level win wherever it states a value');
}
{
  // nothing else may still hardcode the old teal: a second copy is how a default drifts away from itself
  assert(!/(Color\s*[:=]|setHex\()\s*0x4f5d66/i.test(src),
    'nothing assigns the old blue ground hex any more (the two remaining mentions are the notes explaining why)');
  eq((src.match(/floorColor:0x[0-9a-fA-F]{6}/g) || []).length, 1, 'and the default ground is named exactly once');
}

// ---------------------------------------------------------------- and the reason is written down
{
  assert(/The horizon had two different grounds/.test(src),
    'the source states WHY this hex is what it is, so the next person derives it rather than picking one');
  assert(/skyGround's HUE at the floor's OWN luminance/.test(src), '...and how it was derived');
  assert(/`wallColor` is deliberately left COOL/.test(src),
    '...and that the wall was measured and deliberately not changed');
}

done('build 1156: the stock level\'s ground plane is skyGround\'s hue at its own luminance — one ground either side of the horizon instead of two, which takes the first frame anybody sees from 63.7% blue-dominant to 46.6% without moving its exposure');
