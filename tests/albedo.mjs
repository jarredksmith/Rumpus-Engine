// Shared: what albedo does the engine's own ground plane / boundary wall ACTUALLY DRAW?
//
// Build 1378 gave the stock level a texture, and an albedo `map` MULTIPLIES the material colour
// (build 1139) — so from that build on, `DEFAULT_WORLD.floorColor` is no longer the albedo of the
// floor. It is one factor of it. Every test that reasons about the frame's value structure wants the
// product, and build 1151 already learned this lesson for the generator's themes: deriving the drawn
// value from the texture that ships is the only version that cannot drift.
//
// Kept in one module because three harnesses need it (1156, 1360, 1378) and three copies of a
// derivation is how the thing being derived stops agreeing with itself.
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
export const hexLin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => s2l(v / 255));
export const Y = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];

// A minimal PNG reader — 8-bit, non-interlaced, colour type 0/2/6. The test has to read the bytes that
// SHIP, not what the generator held in memory, or it is testing the generator instead of the asset.
export function pngDecode(buf){
  let p = 8, w = 0, h = 0, ch = 0; const idat = [];
  while(p < buf.length){
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if(type === 'IHDR'){
      w = d.readUInt32BE(0); h = d.readUInt32BE(4);
      if(d[8] !== 8) throw new Error('png: bit depth ' + d[8] + ' unsupported');
      ch = d[9] === 2 ? 3 : d[9] === 6 ? 4 : d[9] === 0 ? 1 : 0;
      if(!ch) throw new Error('png: colour type ' + d[9] + ' unsupported');
      if(d[12]) throw new Error('png: interlaced');
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

// build 1151's rule: `toBytes` writes the sRGB fraction with no transfer and the map is sRGB-tagged, so
// the renderer decodes it. Linearise PER PIXEL then average — averaging first is a different, wrong number.
export function texLinearMean(path){
  const { w, h, ch, data } = pngDecode(readFileSync(path));
  const n = w * h; let r = 0, g = 0, b = 0;
  for(let i = 0; i < n; i++){ r += s2l(data[i * ch] / 255); g += s2l(data[i * ch + 1] / 255); b += s2l(data[i * ch + 2] / 255); }
  return { mean: [r / n, g / n, b / n], w, h };
}

const _cache = Object.create(null);
/**
 * The linear albedo the surface actually draws: DEFAULT_WORLD's colour times its texture's mean.
 * `which` is 'floor' or 'wall'. With no texture authored this is exactly the colour, so a caller that
 * uses it reads correctly both before and after a texture is added.
 */
export function drawnAlbedo(src, which, repoRoot){
  const W = src.match(/const DEFAULT_WORLD = \{[\s\S]*?\};/);
  if(!W) throw new Error('DEFAULT_WORLD not found');
  const hm = W[0].match(new RegExp(which + "Color:\\s*(0x[0-9a-fA-F]+)"));
  if(!hm) throw new Error(which + 'Color not declared');
  const lin = hexLin(parseInt(hm[1], 16));
  const tm = W[0].match(new RegExp(which + "Tex:\\s*'([^']*)'"));
  const tex = tm ? tm[1].trim() : '';
  if(!tex || /^[a-z]+:/i.test(tex)) return lin;          // no texture, or a remote one this cannot read
  const path = new URL(tex, repoRoot).pathname;
  if(!existsSync(path)) throw new Error('authored ' + which + 'Tex is missing from the repo: ' + tex);
  const mean = (_cache[path] || (_cache[path] = texLinearMean(path))).mean;
  return lin.map((v, i) => v * mean[i]);
}
