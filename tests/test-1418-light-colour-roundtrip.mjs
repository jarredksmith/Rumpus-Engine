// build 1418: a light's colour survives being saved.
//
// `ColorManagement.legacyMode = false` (build 1115) means `Color.setHex` runs the sRGB->linear transfer on
// the way IN. So `color.r` is a LINEAR value, and `Math.round(color.r*255)` is not the byte the creator
// authored — it is that byte pushed through a one-way curve. Three sites did exactly that, and two of them
// fed the result straight back into `setHex`, which applies the curve again.
//
// Measured against the real r149, six save/load cycles of one warm lamp:
//
//     shipped   ffddaa -> ffb867 -> ff7a23 -> ff3204 -> ff0800 -> ff0100 -> ff0000
//     fixed     ffddaa -> ffddaa -> ffddaa -> ffddaa -> ffddaa -> ffddaa -> ffddaa
//
// A warm lamp becomes PURE RED in six saves, and this engine autosaves every 20 seconds. Duplicating a
// light did it too, because `_lightOpts` -> `buildLight` is the same round trip through a hex.
//
// Found by asking a question no single-feature test asks: is `serialize -> restore -> serialize`
// idempotent? (tools/probe/level-roundtrip.mjs)
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

THREE.ColorManagement.legacyMode = false;   // what the engine sets (build 1115)

// ---------------------------------------------------------------- the conversion, executed
const mk = () => {
  const scope = new Function('THREE',
    src.slice(src.indexOf('const _colSRGB = new THREE.Color();'), src.indexOf('function buildLight(opts){')) +
    '; return { _colToHex, _colToBytes, _colFromBytes };')(THREE);
  return scope;
};
const C = mk();

{
  // THE SWEEP: every byte value, through setHex and back. This is the assertion that matters, because the
  // defect was not "slightly off" — it was wrong for almost every value in the range.
  const c = new THREE.Color();
  let bad = 0, worst = 0;
  for (let v = 0; v < 256; v++) {
    const hex = (255 << 16) | (v << 8) | v;
    c.setHex(hex);
    const back = C._colToHex(c);
    if (back !== hex) { bad++; worst = Math.max(worst, Math.abs(((hex >> 8) & 255) - ((back >> 8) & 255))); }
  }
  eq(bad, 0, 'setHex -> _colToHex round-trips EXACTLY for all 256 byte values (worst channel error ' + worst + ')');

  // and the shipped-before form, so the size of the defect is on the record rather than described
  let oldBad = 0;
  for (let v = 0; v < 256; v++) {
    const hex = (255 << 16) | (v << 8) | v;
    c.setHex(hex);
    const back = (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255);
    if (back !== hex) oldBad++;
  }
  assert(oldBad >= 250,
    'while reading the raw components was wrong for ' + oldBad + ' of 256 — this is what was shipped, and ' +
    'it is recorded so the fix is never mistaken for a rounding tweak');
}

{
  // the decay, and its absence
  const c = new THREE.Color();
  let h = 0xffddaa;
  const fixed = [h];
  for (let i = 0; i < 6; i++) { c.setHex(h); h = C._colToHex(c); fixed.push(h); }
  assert(fixed.every(x => x === 0xffddaa),
    'six save/load cycles of a warm lamp leave it exactly where it started (' +
    fixed.map(x => x.toString(16)).join(' -> ') + ')');

  let g = 0xffddaa;
  const shipped = [g];
  for (let i = 0; i < 6; i++) { c.setHex(g); g = (Math.round(c.r*255)<<16)|(Math.round(c.g*255)<<8)|Math.round(c.b*255); shipped.push(g); }
  eq(shipped[shipped.length - 1], 0xff0000,
    '...where the shipped form reached PURE RED in six (' + shipped.map(x => x.toString(16)).join(' -> ') + ')');
}

{
  // it must ROUND, not truncate. three's own getHex() is the right conversion with the wrong rounding, and
  // an engine that called it would walk a near-black colour one value darker per save.
  const c = new THREE.Color();
  let trunc = 0;
  for (let v = 0; v < 256; v++) { const hex = (255<<16)|(v<<8)|v; c.setHex(hex); if (c.getHex() !== hex) trunc++; }
  assert(trunc > 200,
    'three\'s own getHex() TRUNCATES (clamp(r*255) << 16) and is wrong for ' + trunc + ' of 256 — the right ' +
    'conversion with the wrong rounding, which is why this rounds instead of calling it. A first, narrower ' +
    'sweep of this compared only the green channel and reported 11; the full hex is worse, because a 255 ' +
    'channel lands a hair under 255.0 and truncates to 254');
  // and ours is strictly better than it
  eq(0, [...Array(256).keys()].filter(v => { const hex=(255<<16)|(v<<8)|v; c.setHex(hex); return C._colToHex(c)!==hex; }).length,
    '...and the shipped conversion is exact where getHex is not');
}

{
  // the editor's sliders: bytes out, bytes in, same value
  const c = new THREE.Color();
  for (const trip of [[255, 221, 170], [0, 0, 0], [255, 255, 255], [1, 2, 3], [56, 245, 181]]) {
    C._colFromBytes(c, trip[0], trip[1], trip[2]);
    const back = C._colToBytes(c);
    eq(back.join(','), trip.join(','), 'the light panel round-trips ' + trip.join(',') + ' exactly');
  }
  // ...and it really is naming sRGB rather than defaulting to the working space, which is the whole point
  C._colFromBytes(c, 255, 221, 170);
  assert(Math.abs(c.g - 221 / 255) > 0.05,
    'the stored component is LINEAR, not the byte — so the panel is converting rather than passing through');
}

// ---------------------------------------------------------------- and all three sites share it
{
  assert(/const hx=_colToHex;/.test(extractFunction('_lightOpts')),
    '_lightOpts uses the shared conversion (this one feeds buildLight, so a DUPLICATED light took the ' +
    'same one-way transform in seconds rather than over a session)');
  assert(/const lightHex = g=>_colToHex\(g\.userData\.light\.color\);/.test(extractFunction('serializeLevel')),
    '...and so does the level file');
  const panel = src.slice(src.indexOf("if(t==='hemi'){ const _g=_colToBytes") - 400, src.indexOf("if(t==='hemi'){ const _g=_colToBytes") + 200);
  assert(/_colToBytes\(L\.color\)/.test(panel), '...and the editor panel reads through it');
  assert(/_colFromBytes\(L\.color, s\.r, s\.g, s\.b\)/.test(src), '...and writes through its inverse');
  // no hand-rolled copy may come back — that is how the two sites came to disagree with three
  // COMMENTS STRIPPED FIRST. The explanation beside the helper quotes the defective expression, so a raw
  // count reads 2 and the pin fails on its own prose — this file records that trap in the other direction
  // (a pin SATISFIED by prose) three times; this is the counting form of it.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  eq((code.match(/Math\.round\([A-Za-z_.]*\.r *\* *255\)/g) || []).length, 1,
    'and exactly ONE such expression remains in the engine: the one inside the shared helper');
}

// ---------------------------------------------------------------- the helper is declared before its users
{
  const decl = src.indexOf('const _colSRGB = new THREE.Color();');
  assert(decl > 0 && decl < src.indexOf('function _lightOpts('), 'declared above _lightOpts...');
  assert(decl < src.indexOf('function serializeLevel()'), '...and above serializeLevel');
  // it degrades rather than throwing if a three build ever drops the API (builds 1127/1331's lesson)
  assert(/try\{ if\(THREE\.ColorManagement && THREE\.ColorManagement\.fromWorkingColorSpace\)/.test(src),
    'and it is guarded, so a three upgrade that moves the API leaves colours flat rather than breaking the save');
}

done('build 1418: a light\'s colour no longer decays to red one save at a time');
