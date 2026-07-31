// build 1187: LUT colour grade — the industry-standard strip LUT, in the composite.
//
// The grade was saturation + contrast, two scalars; "make my level look like a film stock" was
// unauthorable. A standard N*N x N strip LUT (256x16 or 1024x32 — the Unreal/GTA convention) now applies
// in the composite AFTER the frame is display-referred, which is what LUT strips are authored against,
// so there is no transfer math to get wrong: display bytes in, display bytes out, loaded RAW (an sRGB
// tag would decode the texels and corrupt the mapping).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the sampling formula, executed
{
  // an identity 256x16 strip in JS: tile = blue, x-in-tile = red, y = green
  const N = 16, W = N * N, H = N;
  const strip = (x, y) => { const tile = Math.floor(x / N); return [(x % N) / (N - 1), y / (N - 1), tile / (N - 1)]; };
  const bilerp = (u, v) => {                                   // GPU-style bilinear over texel centers
    const fx = u * W - 0.5, fy = v * H - 0.5;
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const m = (a, b, t) => a.map((v2, i) => v2 * (1 - t) + b[i] * t);
    return m(m(strip(x0, y0), strip(x1, y0), tx), m(strip(x0, y1), strip(x1, y1), tx), ty);
  };
  const lookup = (r, g, b) => {                                // the shader's exact formula
    const n = N;
    const bb = b * (n - 1), b0 = Math.floor(bb), bf = bb - b0, b1 = Math.min(b0 + 1, n - 1);
    const baseU = (r * (n - 1) + 0.5) / (n * n), baseV = (g * (n - 1) + 0.5) / n;
    const l0 = bilerp(baseU + b0 / n, baseV), l1 = bilerp(baseU + b1 / n, baseV);
    return l0.map((v, i) => v * (1 - bf) + l1[i] * bf);
  };
  for (const c of [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.25, 0.6, 0.85], [0.9, 0.1, 0.4]]) {
    const o = lookup(...c);
    for (let i = 0; i < 3; i++) near(o[i], c[i], 1 / 60,
      'an IDENTITY strip returns [' + c + '] unchanged (got ' + o.map((v) => v.toFixed(3)) + ') — the half-texel insets keep every lookup inside its own tile');
  }
  { // the corners never bleed across a tile boundary
    const n = N;
    assert((1 * (n - 1) + 0.5) / (n * n) < 1 / n, 'red=1 samples the LAST texel center of its tile, not the first of the next');
    eq(Math.min(Math.floor(1 * (n - 1)) + 1, n - 1), n - 1, 'blue=1 clamps its second tap to the last tile');
  }
}

// ---------------------------------------------------------------- the loader, executed
{
  const mk = () => {
    const state = {};
    const fn = new Function('THREE', 'proxied', '_texPending', 'console',
      "let _lutMap=null, _lutN=16, _lutLoadedUrl='';\n" +
      extractFunction('_ensureLut') +
      '\nreturn { load:_ensureLut, get:()=>({ map:_lutMap, n:_lutN }) };');
    const mkTex = (w, h) => ({ image: { width: w, height: h }, disposed: 0, dispose() { this.disposed++; } });
    state.pending = null;
    const THREEstub = { TextureLoader: function () { this.setCrossOrigin = () => {};
        this.load = (u, ok) => { state.pending = { u, ok }; }; },
      LinearFilter: 'lin', ClampToEdgeWrapping: 'clamp' };
    const api = fn(THREEstub, (u) => u, undefined, { warn: (...a) => (state.warned = a.join(' ')) });
    return { ...api, state, mkTex };
  };
  { const t = mk(); t.load('a.png');
    const tex = t.mkTex(256, 16); t.state.pending.ok(tex);
    assert(t.get().map === tex, 'a valid 256x16 strip is taken');
    eq(t.get().n, 16, '...and N comes from the image height');
    eq(tex.flipY, false, 'flipY off — green runs DOWN each tile, deterministically');
    eq(tex.generateMipmaps, false, 'no mips — a mip of a LUT is a different grade');
    eq(tex.minFilter, 'lin', 'bilinear filtering does the in-tile interpolation'); }
  { const t = mk(); t.load('bad.png');
    const tex = t.mkTex(120, 10); t.state.pending.ok(tex);   // 10 tiles would be 100 wide; 120 is no strip
    assert(t.get().map === null && tex.disposed === 1, 'a non-strip image is rejected and disposed');
    assert(/LUT rejected/.test(t.state.warned), '...loudly'); }
  { const t = mk(); t.load('a.png'); const p1 = t.state.pending;
    t.load('b.png');                                            // a newer url before the first finishes
    const stale = t.mkTex(256, 16); p1.ok(stale);
    assert(t.get().map === null && stale.disposed === 1, 'a stale load that lost the url race is dropped, not applied'); }
  { const t = mk(); t.load('a.png'); t.state.pending.ok(t.mkTex(256, 16));
    const first = t.get().map; t.load('');
    assert(t.get().map === null && first.disposed === 1, 'clearing the url disposes the texture'); }
  assert(!/colorSpace|encoding/.test(extractFunction('_ensureLut')),
    'the LUT is loaded RAW — an sRGB tag would decode the bytes and corrupt a display-to-display mapping');
}

// ---------------------------------------------------------------- the wiring
{
  const comp = src.match(/_matComp=new THREE\.ShaderMaterial\(\{[\s\S]{0,14000}?'  gl_FragColor=vec4\(clamp\(c,0\.0,1\.0\), 1\.0\); \}'/)[0];   // anchored on the shader's own last line, not a character budget (1149)
  assert(/tLut:\{value:null\}, uLutAmt:\{value:0\}, uLutN:\{value:16\}/.test(comp), 'the composite carries the three LUT uniforms');
  const sat = comp.indexOf('uSat);'), lut = comp.indexOf('if(uLutAmt > 0.001){'), vig = comp.indexOf('r)*uVig;');
  assert(sat > -1 && lut > sat && vig > lut,
    'the LUT applies AFTER contrast/saturation (it is the final grade) and BEFORE vignette/grain (lens artifacts sit on top of any grade)');
  assert(/cu\.uLutAmt\.value = _lutMap \? _postLutAmt : 0;/.test(src),
    'no LUT loaded (or a failed load) means amount 0 — exactly the old grade, never a black lookup');
  assert(/lut:'', lutAmt:1,/.test(src), 'DEFAULT_WORLD ships the keys — worldCfg serialises whole, so they round-trip for free');
  assert(/_postLutAmt = Math\.max\(0, Math\.min\(1, worldCfg\.lutAmt == null \? 1 : \+worldCfg\.lutAmt\)\)/.test(src),
    'applyWorldCfg clamps the strength and kicks the loader');
  assert(/texRow\(b,'https:\/\/\\u2026\/grade-lut\.png \(256x16 strip\)','lut'\); slider\(b,'LUT strength','lutAmt',0,1,0\.05\);/.test(src),
    'the URL row and strength slider live beside the grade sliders');
}

done('build 1187: LUT colour grade — a standard N*N x N strip sampled with half-texel-inset tile math (identity strip proven to return its input; corners proven not to bleed tiles), loaded raw with no mips and green-down orientation, applied display-referred after sat/con and before the lens artifacts, amount 0 when absent — the whole look of a level from one hosted PNG');
