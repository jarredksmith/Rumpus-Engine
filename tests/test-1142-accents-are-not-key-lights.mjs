// build 1142: the loudest light in the engine was a decoration.
//
// The default level's floor rendered olive-green: measured (87,105,77) where its albedo `floorColor
// 0x4f5d66` is (79,93,102) — the blue channel is the HIGHEST in the albedo and the LOWEST in the frame,
// which no positive light times that albedo produces. It measured the same in build 1138, so it was not
// a regression from any recent build, and it was not the grid (hidden in play; the play and editor
// frames measured identically).
//
// Probing the running scene's actual light list settled it in one run: 29 lights, and four of them were
// `PointLight(0x38f5b5, 8, 22)` from buildPillar — intensity 8 against a sun of 1.5, in a saturated teal
// whose linear channels are R 0.028, G 0.745, B 0.434. Four of those pillars stand around the default
// level's spawn. The frame's key light was a decoration.
//
// A/B, nothing else changed, pillar lights 8 -> 0:
//   mid floor    56,101,101  ->  55,71,83     (B>G>R restored, exactly what the albedo implies)
//   near deck    81,101,70   ->  78,66,51     (warm concrete finally reads warm)
//   crate face   116,149,146 ->  115,125,132  (B highest, as its 0x5c6670 implies)
// but they also carried most of the frame's VARIATION (mid floor 4,027 -> 1,074 unique colours), so the
// fix is accent strength, not zero. Swept: 4.0/18 is the most light that leaves the frame's hue
// albedo-correct while still laying a real pool at the pillar's own foot (G +20 over unlit, 722 -> 1,370
// unique colours there).
//
// The station beacon at PointLight(0x38c8f5, 6, 14) was the obvious second suspect and was MEASURED
// rather than assumed: dropping it to 2.0/12 moved the dais by 4 code values and the floor by none, so
// it is deliberately unchanged. Its 14 m range confines it to the landmark it marks.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- sRGB -> linear, from the spec
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const linRGB = (hex) => [16, 8, 0].map(sh => lin((hex >> sh) & 255));

// ---------------------------------------------------------------- the pillar's light
{
  const fn = extractFunction('buildPillar');
  const m = fn.match(/new THREE\.PointLight\(0x([0-9a-f]{6}), ([\d.]+), (\d+)\)/);
  assert(m, 'the pillar carries a point light');
  const [, hex, iStr, rStr] = m;
  const intensity = +iStr, range = +rStr;

  // the sun it has to live beside
  const dw = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
  const sun = +dw.match(/sun:\s*([\d.]+)/)[1];
  assert(sun > 0, 'DEFAULT_WORLD has a sun (' + sun + ')');
  assert(intensity <= sun * 3, 'a decorative pillar does not out-light the sun by more than 3x ('
    + intensity + ' vs ' + sun + ') — it was 8 against 1.5, i.e. 5.3x');
  assert(intensity > sun * 0.5, '...and is still a light rather than a token (' + intensity + ')');
  assert(range <= 20, 'its reach is local (' + range + ' m) — at 22 m from four pillars it covered the whole spawn half of the arena');
  assert(range >= 10, '...but still lights the ground under it (' + range + ' m from 4 m up)');

  // The colour is the reason intensity matters so much here: it is not a neutral fill, it is a
  // saturated hue that REPLACES the frame's channel balance wherever it dominates.
  const [r, g, b] = linRGB(parseInt(hex, 16));
  assert(g > r * 5, 'the accent is a saturated hue, not a neutral fill (linear R ' + r.toFixed(3) + ' G ' + g.toFixed(3) + ')');
  // ...so the product of intensity and saturation is the thing to bound. At 8 it was 5.96 in G against
  // a sun contributing 1.33; at 4 it is 2.98 against the same 1.33, and the falloff does the rest.
  const sunG = linRGB(parseInt(dw.match(/sunColor:\s*0x([0-9a-f]{6})/)[1], 16))[1] * sun;
  assert(intensity * g < sunG * 3, 'the green it can deliver is bounded against what the sun delivers ('
    + (intensity * g).toFixed(2) + ' vs ' + sunG.toFixed(2) + ')');
}

// ---------------------------------------------------------------- the accents that were already right
{
  // The _DL palette's own emitter accents were never the problem — measured at 0.10 to 0.55 — and build
  // 1135 already cut their EMISSIVE. This pins that they stay in accent territory, because the emissive
  // and the light are two separate knobs and 1135 only touched one of them.
  const dl = src.match(/const _DL = \{[\s\S]*?\n\};/)[0];
  const emits = [...dl.matchAll(/emit:\s*\{ c:0x[0-9a-f]{6}, i:([\d.]+) \}/g)].map(m => +m[1]);
  assert(emits.length >= 2, 'the palette has emissive accents (' + emits.length + ')');
  for (const i of emits) assert(i <= 0.8, 'an accent emissive stays under 0.8 (' + i + ') — at 1.6 it bloomed across the whole frame');
}
{
  // the station beacon is deliberately untouched, and this records why so it is not "tidied up" later
  assert(/const light = new THREE\.PointLight\(0x38c8f5, 6, 14\);/.test(src),
    'the station beacon is unchanged: measured at 4 code values on the dais and none on the floor');
}

// ---------------------------------------------------------------- the general rule, as arithmetic
{
  // Any light in the scene graph whose intensity dwarfs the sun's is a candidate for this same fault.
  // Sweep every hardcoded PointLight/SpotLight literal in the source and bound it. This is the guard
  // that would have caught the pillar before it shipped, and catches the next one.
  const dw = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
  const sun = +dw.match(/sun:\s*([\d.]+)/)[1];
  const loud = [];
  for (const m of src.matchAll(/new THREE\.(Point|Spot)Light\(0x([0-9a-f]{6}), ([\d.]+)(?:, (\d+))?/g)) {
    const inten = +m[3], range = m[4] ? +m[4] : Infinity;
    if (inten <= sun * 3) continue;                       // in accent territory already
    // A loud light is only acceptable if it cannot reach far: intensity x reach is what tints a frame.
    if (range <= 15) continue;
    loud.push(m[0] + ' (intensity ' + inten + ', range ' + range + ')');
  }
  eq(loud.length, 0, 'no hardcoded light is both far-reaching and louder than 3x the sun' + (loud.length ? ': ' + loud.join('; ') : ''));
}

// ---------------------------------------------------------------- and the frame it produces
{
  // The whole point is that a surface renders the hue its albedo implies. That is a property of the
  // CONTENT, so assert it about the content: the default palette's channel ORDER must be preserved by
  // a neutral-ish key light, which is only true when no saturated accent dominates.
  const dw = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
  const floor = linRGB(parseInt(dw.match(/floorColor:\s*0x([0-9a-f]{6})/)[1], 16));
  const sunC = linRGB(parseInt(dw.match(/sunColor:\s*0x([0-9a-f]{6})/)[1], 16));
  const sun = +dw.match(/sun:\s*([\d.]+)/)[1];
  assert(sunC[0] >= sunC[1] && sunC[1] >= sunC[2], 'the sun is warm, R>=G>=B');
  // build 1156 made the default floor WARM (it now shares the sky dome's ground band), so the literal
  // "B>G>R" this originally asserted is no longer true — and it was never the point. The invariant is that
  // the KEY LIGHT preserves whatever order the albedo has: a saturated accent loud enough to be the key is
  // exactly what reverses it, which is what 1142 found and what this must keep catching.
  const order = (a) => a.map((v, i) => [v, i]).sort((p, q) => q[0] - p[0]).map(p => p[1]).join('');
  const lit = floor.map((v, i) => v * sunC[i] * sun);
  eq(order(lit), order(floor),
    'sun-lit, the floor still renders its own channel order (albedo ' + order(floor) + ', lit ' + order(lit) +
    ') — so a FRAME that reverses it is proof of a third light, not of the sun or the albedo');
  assert(Math.abs(floor[0] - floor[2]) > 0.01,
    'and the albedo has a real channel order to preserve (R ' + floor[0].toFixed(4) + ' vs B ' + floor[2].toFixed(4) +
    '), or the test above would pass on a neutral grey by accident');
}

done('build 1142: the pillar accent stops being the engine\'s key light, and no far-reaching hardcoded light outshines the sun');
