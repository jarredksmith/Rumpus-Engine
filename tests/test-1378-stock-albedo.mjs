// build 1378: THE STOCK LEVEL HAS AN ALBEDO.
//
// Every critic named it first: the default level — the first frame anybody sees — had no texture on any
// surface. `floorTex`/`wallTex` were '' in DEFAULT_WORLD, so the ground and the boundary walls were flat
// colour, and the whole frame read as greybox however well the lighting was tuned. The generator has had
// a procedural texture library the whole time (`node tools/levelgen.mjs tex <id> <out.png>`); nothing
// pointed the engine's own two surfaces at it.
//
// The load-bearing part is NOT the url. It is that an albedo `map` MULTIPLIES the material colour
// (build 1139), so dropping a texture onto a tuned colour can only darken it — concrete's linear mean is
// 0.366, so the stock floor would have lost 63% of its albedo and every value build 1360 tuned (the
// exposure, the bounce, the sky's ground band) would have been wrong. So the base colours are
// COMPENSATED: `newColour_linear = oldColour_linear / textureMean`, which holds the DRAWN albedo where it
// was while the surface gains its variation.
//
// This test recomputes that from the PNGs THAT SHIP — decoding them, linearising per pixel (build 1151's
// rule: `toBytes` writes the sRGB fraction with no transfer, and the map is sRGB-tagged, so linearise
// then average, never the other way round) — and asserts the product lands on build 1360's values. So
// regenerating a texture at a different brightness without re-deriving the colour fails HERE rather than
// silently re-exposing the first frame of the game.
import { readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { gameSource, assert, near, done } from './harness.mjs';

const src = gameSource();
const url = (p) => new URL('../' + p, import.meta.url);

// ---------------------------------------------------------------- the shipped bytes ----
// A minimal PNG reader (8-bit, non-interlaced, colour type 0/2/6) — the test has to read what SHIPS,
// not what the generator held in memory, or it is testing the generator and not the game's asset.
function pngDecode(buf){
  let p = 8, w = 0, h = 0, ch = 0; const idat = [];
  while(p < buf.length){
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if(type === 'IHDR'){
      w = d.readUInt32BE(0); h = d.readUInt32BE(4);
      assert(d[8] === 8, 'the shipped texture is 8-bit');
      ch = d[9] === 2 ? 3 : d[9] === 6 ? 4 : d[9] === 0 ? 1 : 0;
      assert(ch > 0, 'the shipped texture is greyscale, RGB or RGBA');
      assert(!d[12], 'the shipped texture is not interlaced');
    } else if(type === 'IDAT') idat.push(d);
    else if(type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(w * h * ch);
  let q = 0;
  for(let y = 0; y < h; y++){
    const f = raw[q++], line = raw.subarray(q, q + stride); q += stride;
    const o = y * stride, pv = o - stride;
    for(let x = 0; x < stride; x++){
      const a = x >= ch ? out[o + x - ch] : 0, b = y > 0 ? out[pv + x] : 0, c = (x >= ch && y > 0) ? out[pv + x - ch] : 0;
      let v = line[x];
      if(f === 1) v += a; else if(f === 2) v += b; else if(f === 3) v += (a + b) >> 1;
      else if(f === 4){ const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[o + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
function linearMean(path){
  const { w, h, ch, data } = pngDecode(readFileSync(url(path)));
  const n = w * h; let r = 0, g = 0, b = 0;
  for(let i = 0; i < n; i++){ r += s2l(data[i * ch] / 255); g += s2l(data[i * ch + 1] / 255); b += s2l(data[i * ch + 2] / 255); }
  return { mean: [r / n, g / n, b / n], w, h };
}
const hexLin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => s2l(v / 255));

// ------------------------------------------------------------------ what is authored ----
const DW = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
const pick = (k) => { const m = DW.match(new RegExp(k + ":\\s*(0x[0-9a-f]+|'[^']*')")); assert(m, 'DEFAULT_WORLD names ' + k); return m[1]; };

const floorTex = pick('floorTex').slice(1, -1), wallTex = pick('wallTex').slice(1, -1);
assert(floorTex && wallTex, 'the stock level ships a floor AND a wall albedo — the frame everybody sees is not greybox');

// Same-origin relative paths, deliberately: build 1332's CSP is `img-src 'self'`, and build 1335 reports
// every third-party host a level contacts. An asset the engine ships must add neither a refusal nor a row.
for(const [k, u] of [['floorTex', floorTex], ['wallTex', wallTex]]){
  assert(!/^[a-z]+:/i.test(u) && !u.startsWith('//') && !u.startsWith('/'),
    k + ' is a relative same-origin path (CSP img-src is \'self\', and a stock asset must not be a third-party contact)');
  const st = statSync(url(u));
  assert(st.size > 0, k + ' exists in the repo: ' + u);
  assert(st.size < 220 * 1024, k + ' stays small — it is on the first-load path for every player (' + (st.size / 1024 | 0) + ' KB)');
}

// ------------------------------------------------- the compensation, RE-DERIVED, not restated ----
// build 1360 tuned these two colours against an UNTEXTURED surface. They are what the drawn albedo must
// still be, so they are the target rather than the setting.
const TUNED_FLOOR = 0x403d39, TUNED_WALL = 0x3a454b;
for(const [what, tuned, texPath, hexNow] of [
  ['floor', TUNED_FLOOR, floorTex, parseInt(pick('floorColor'), 16)],
  ['wall',  TUNED_WALL,  wallTex,  parseInt(pick('wallColor'), 16)],
]){
  const { mean, w, h } = linearMean(texPath);
  assert(w === h && w >= 128, what + ' texture is square and at least 128px (' + w + 'x' + h + ')');
  const drawn = hexLin(hexNow).map((v, i) => v * mean[i]);
  const want = hexLin(tuned);
  for(let c = 0; c < 3; c++){
    // 2% per channel: the authored colour is quantised to 8 bits, so exact is not reachable.
    near(drawn[c], want[c], Math.max(want[c] * 0.02, 1e-4),
      what + ' channel ' + c + ': colour x texture mean = the albedo build 1360 tuned (' +
      drawn[c].toFixed(4) + ' vs ' + want[c].toFixed(4) + ')');
  }
  // And the compensation must have gone UP — a texture can only darken, so a colour that did not rise is
  // a colour that was never compensated.
  assert(hexNow > tuned, what + 'Color was raised to pay for the texture it now multiplies');
}

// ------------------------------------------------------------------ tiling is a SIZE ----
// build 1139: "UV tiling is not a physical size". The auto repeats were `ARENA/4` and `ARENA/8` — ratios
// of the arena's extent, so one tile covered more metres in a bigger level — and the wall used ONE repeat
// for a face 140 m wide by 8 m tall, a 17:1 stretch.
assert(/const SURF_TILE_M = \d/.test(src), 'the metres-per-tile is named once');
assert(/function _surfRepeat\(spanM\)\{[^}]*\/ SURF_TILE_M/.test(src), '...and the repeat count is derived from a SPAN, not from ARENA');
assert(!/Math\.round\(ARENA\/4\)/.test(src) && !/Math\.round\(ARENA\/8\)/.test(src), 'neither auto tiling is an arena ratio any more');
assert(/const fAuto = _surfRepeat\(ARENA\*2\)/.test(src), 'the floor derives from the plane it is on');
assert(/const wuAuto = _surfRepeat\(ARENA\*2\), wvAuto = _surfRepeat\(H\)/.test(src), 'the wall derives PER AXIS from its own width and height');
assert(/wallTileV>0 \? \+worldCfg\.wallTileV : wvAuto/.test(src), '...and the V axis actually uses the V derivation');

// Executed: the derivation is a real function of metres, and it never returns 0 (a repeat of 0 collapses
// the texture to one texel).
{
  const SURF_TILE_M = parseFloat(src.match(/const SURF_TILE_M = ([\d.]+)/)[1]);
  const _surfRepeat = new Function('SURF_TILE_M', src.match(/function _surfRepeat\(spanM\)\{[\s\S]*?\}/)[0] + '\nreturn _surfRepeat;')(SURF_TILE_M);
  near(_surfRepeat(140) * SURF_TILE_M, 140, SURF_TILE_M, 'a 140 m span tiles at about ' + SURF_TILE_M + ' m');
  near(_surfRepeat(8) * SURF_TILE_M, 8, SURF_TILE_M, 'an 8 m wall does too — which is what stops the stretch');
  for(const span of [0, -5, 0.1, 1, 3, 1000]) assert(_surfRepeat(span) >= 1, 'never 0 repeats (span ' + span + ')');
  assert(_surfRepeat(140) !== _surfRepeat(8), 'the two axes of the boundary wall genuinely differ');
}

// ------------------------------------------------ a generated arena states its own ground ----
// The mood owns the ground (build 1143). Now that the stock world ships a texture, a mood that named only
// the colour would leave that concrete multiplying a theme's ground the bake integrated without it.
const lg = readFileSync(url('tools/levelgen.mjs'), 'utf8');
const gm = lg.match(/function groundMood\([\s\S]*?\n\}/)[0];
for(const k of ['floorTex', 'floorTexN', 'floorTexR', 'wallTex', 'wallTexN', 'wallTexR'])
  assert(new RegExp(k + ":\\s*''").test(gm), 'groundMood clears ' + k + " — otherwise the stock albedo rides into every generated theme");

// The engine's own empty-scene path must clear them too, or wiping a level would keep the last one's maps.
assert(/floorTex/.test(src.match(/function _worldFrom[\s\S]*?\n\}/)[0]) === false,
  '_worldFrom stays a plain default merge — a saved level carries its own floorTex and is untouched by this build');

done('build 1378: the stock level has an albedo, and its value structure is derived from the texture that ships');
