// build 1151: a theme's ground albedo is the albedo of the ground it actually DRAWS.
//
// `light.groundAlb` was a hand-picked triple per theme. Four things derive from it — the lightmap bake's
// sun-bounce colour, the sky dome's ground band, the engine plane's floorColor/wallColor (build 1143), and
// the one-bounce fill factor (build 1149) — and measured against the material the generator actually draws
// it was wrong in EVERY theme, from 0.35x (garden) to 1.59x (facility):
//
//     industrial  drawn 0.110/0.114/0.117   was 0.20/0.21/0.22   0.54x
//     castle      drawn 0.154/0.136/0.113   was 0.22/0.19/0.15   0.71x
//     volcanic    drawn 0.142/0.091/0.053   was 0.16/0.13/0.10   0.74x
//     garden      drawn 0.034/0.067/0.011   was 0.12/0.18/0.08   0.35x
//     desert      drawn 0.511/0.372/0.185   was 0.42/0.34/0.22   1.11x
//     frost       drawn 0.779/0.829/0.900   was 0.60/0.64/0.70   1.29x
//     facility    drawn 0.165/0.189/0.222   was 0.10/0.12/0.14   1.59x
//
// Build 1143 introduced `groundMood` so "the plane the player walks past and the bounce the bake assumed
// are the same surface". They were not, because naming a value once is not the same as deriving it from the
// thing it describes. This test closes that: it recomputes all seven from the REAL generator — the palette's
// ground material, its base factor, and the mean of its own texture — so retuning a texture without
// updating the mood fails here instead of silently putting the engine's ground a stop away from the
// arena's.
import { readFileSync } from 'node:fs';
import { assert, eq, near, done } from './harness.mjs';

const lg = readFileSync(new URL('../tools/levelgen.mjs', import.meta.url), 'utf8').replace(/^#![^\n]*\n/, '');
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
process.env.TEXSIZE = '128';   // the mean is stable across sizes (checked at 64/128/256); small keeps this fast
const api = await new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lg + '\n;return { arenaPalette, arenaMood, MATS, TEXS, groundMood };')(
  { deflateSync: () => new Uint8Array(0), writeFileSync: () => {} }, Buffer, process);

const THEMES = ['industrial', 'castle', 'volcanic', 'garden', 'desert', 'frost', 'facility'];
// Tex.rgb holds sRGB-encoded fractions — `toBytes` writes `px*255` with NO transfer, and the glTF
// baseColorTexture is sRGB-tagged, so the renderer decodes them. Linearise PER PIXEL then average;
// averaging first and linearising after is a different (and wrong) number.
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const Y = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];

function drawnGroundAlbedo(theme){
  const pal = api.arenaPalette(theme);
  assert(pal && pal.ground != null, theme + ' names a ground material');
  const m = api.MATS[pal.ground];
  assert(m && m.tex, theme + "'s ground material carries a texture");
  const tex = api.TEXS[m.tex];
  assert(tex && tex.rgb, theme + "'s ground texture was generated");
  const n = tex.S * tex.S, a = [0, 0, 0];
  for (let i = 0; i < n; i++) { a[0] += s2l(tex.rgb[i*3]); a[1] += s2l(tex.rgb[i*3+1]); a[2] += s2l(tex.rgb[i*3+2]); }
  return [a[0]/n * m.base[0], a[1]/n * m.base[1], a[2]/n * m.base[2]];
}

// ---------------------------------------------------------------- THE invariant
const drawn = {}, mood = {};
for (const t of THEMES) { drawn[t] = drawnGroundAlbedo(t); mood[t] = api.arenaMood(t); }
for (const t of THEMES) {
  const d = drawn[t], g = mood[t].light.groundAlb;
  for (let k = 0; k < 3; k++)
    near(g[k], d[k], Math.max(0.012, d[k] * 0.09),
      t + ' groundAlb[' + k + '] is the albedo it draws (' + g[k] + ' vs ' + d[k].toFixed(3) + ')');
}

// ---------------------------------------------------------------- and every consumer follows it
{
  const dec = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  for (const t of THEMES) {
    const w = mood[t].world, d = drawn[t];
    // 1. the engine's ground plane. This is the seam build 1143 set out to remove: the plane runs on to
    //    +-ARENA where the imported ground stops at +-W, so the two are adjacent in the frame.
    const fc = dec(w.floorColor).map(v => s2l(v / 255));
    for (let k = 0; k < 3; k++)
      near(fc[k], d[k], Math.max(0.012, d[k] * 0.09), t + ' floorColor matches the drawn ground (ch ' + k + ')');
    // 2. the boundary walls: the same albedo one value down, not a different world
    const wc = dec(w.wallColor).map(v => s2l(v / 255));
    for (let k = 0; k < 3; k++)
      near(wc[k], d[k] * 0.55, Math.max(0.012, d[k] * 0.09), t + ' wallColor is that albedo at 55% (ch ' + k + ')');
    // 3. the dome's ground band, so the horizon has no seam either
    const sg = dec(w.skyGround).map(v => s2l(v / 255));
    for (let k = 0; k < 3; k++)
      near(sg[k], d[k], Math.max(0.012, d[k] * 0.09), t + ' skyGround matches it too (ch ' + k + ')');
  }
}
{
  // 4. build 1149's fill factor. It divides the target out of the ground's own luminance, so every theme
  //    delivers the same amount of bounce however bright its ground is — and now "its ground" is real.
  const fills = THEMES.map(t => [t, mood[t].world.bounce * Y(mood[t].light.groundAlb)]);
  const v = fills.map(f => f[1]);
  const spread = Math.max(...v) / Math.min(...v);
  assert(spread < 1.12, 'every theme still delivers the same bounce fill to within 12%: ' +
    fills.map(f => f[0] + ' ' + f[1].toFixed(4)).join(', ') + ' (spread ' + spread.toFixed(3) + 'x)');
  // garden's ground is the darkest by far and asks for the most factor; the clamp must not hold it short
  const g = mood.garden.world.bounce;
  assert(g > 0.8, "garden's dark grass asks for more than the old 0.8 clamp allowed, and gets it: " + g);
  for (const t of THEMES) {
    const b = mood[t].world.bounce;
    assert(b >= 0.05 && b <= 1.0, t + ' bounce ' + b + ' is inside the clamp');
  }
  // and the bright grounds still ask for almost none
  assert(mood.frost.world.bounce < mood.volcanic.world.bounce,
    'snow asks for less than ash: ' + mood.frost.world.bounce + ' vs ' + mood.volcanic.world.bounce);
}

// ---------------------------------------------------------------- the shape, so it stays derived
{
  assert(/const y = 0\.2126 \* gnd\[0\] \+ 0\.7152 \* gnd\[1\] \+ 0\.0722 \* gnd\[2\];/.test(lg),
    'the fill factor is derived from the ground luminance, in one place');
  assert(/Math\.min\(1\.0, 0\.0535 \/ Math\.max\(1e-4, y\)\)/.test(lg),
    '...with the upper clamp at 1.0, because 0.8 was arbitrary and the equal fill is not');
  assert(/the albedo of the ground material the generator ACTUALLY DRAWS/.test(lg),
    'and the source says where these numbers come from, so the next person regenerates them rather than guessing');
  // one declaration per theme still: build 1143's count, unchanged by this build
  const body = lg.slice(lg.indexOf('function arenaMood('));
  eq((body.match(/const zen = \[/g) || []).length, 7, 'still exactly one albedo declaration per theme');
}

done('build 1151: a theme\'s ground albedo is the ground it actually draws — recomputed from the real palette, texture and base, so the bake, the dome, the engine plane and the bounce all describe one surface');
