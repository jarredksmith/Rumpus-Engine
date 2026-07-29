// build 1117: two independent black-pixel defects, both found by capturing frames and then proven
// with arithmetic rather than with a lucky screenshot.
//
// 1. THE ENGINE FLOOR IS COPLANAR WITH EVERY GENERATED ARENA. The built-in floor plane sits at y=0
//    (its position is never assigned) and spans ARENA*2, while levelgen writes its ground slab with
//    the top face at exactly y=0. Two coplanar surfaces means the GPU picks a winner per pixel, so a
//    placed arena's sand is cut by bands of engine floor — and that floor reads as pure black,
//    because 0x141c22 is 0.007 linear and ACES clamps anything below 0.00325 to zero.
//
// 2. THE GRADE RAN IN SCENE-LINEAR SPACE (pre-existing, not introduced by the colour work). The
//    composite applied contrast to linear values, where the shipped default uCon 1.05 drives
//    everything below linear 0.0238 negative — every pixel that should display under sRGB 43/255,
//    hard-clipped to black, with grain speckling the boundary.
//
// The capture that exposed this was NOT reproducible: identical source produced 0%, 34.6% and 78.5%
// pure-black pixels across runs, because the frame is taken after a timed walk and the player stops
// somewhere different each time. Hence this file proves the mechanisms, not the screenshot.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
const lg = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs'), 'utf8');

// ---------------------------------------------------------------- 1. the coplanarity is real
assert(/const floor = new THREE\.Mesh\(new THREE\.PlaneGeometry\(1, 1\), floorMat\);/.test(src),
  'the engine floor exists as a plane');
{
  // its y is never assigned anywhere — that is WHY it lands on the generated ground's plane
  const moved = /floor\.position\.y\s*=/.test(src);
  assert(!moved, 'the engine floor is never moved off y=0');
}
assert(/box\(P\.ground, -W - 1\.5, -T, -W - 1\.5, W \+ 1\.5, 0, W \+ 1\.5\);/.test(lg),
  'and levelgen puts its ground slab top face at exactly y=0 — these two facts must stay linked');

// the fix biases DEPTH, not position, so nothing that reads geometry changes
assert(/polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1/.test(src),
  'the engine floor loses depth ties via polygonOffset');
{
  const seg = src.slice(src.indexOf('const floorMat = new THREE.MeshPhysicalMaterial'), src.indexOf('scene.add(floor);'));
  assert(/polygonOffset/.test(seg), '...on the floor material specifically');
  assert(!/floor\.position/.test(seg), '...and the plane itself is not moved (collision, nav grid and surfaceTopAt all read y=0)');
}

// ---------------------------------------------------------------- ...and why it renders BLACK
{
  // three's ACES fit, verbatim: (v*(v+0.0245786) - 0.000090537) / (v*(0.983729*v+0.432951) + 0.238081)
  const aces = (v) => Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081));
  const toLin = (s) => s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  const zero = (-0.0245786 + Math.sqrt(0.0245786 ** 2 + 4 * 0.000090537)) / 2;
  assert(Math.abs(zero - 0.003253) < 1e-5, 'ACES output is clamped to zero below linear ~0.00325 (' + zero.toFixed(6) + ')');
  const floorLin = [0x14, 0x1c, 0x22].map(c => toLin(c / 255));
  assert(floorLin[0] < 0.008, 'floorColor 0x141c22 is only ' + floorLin[0].toFixed(5) + ' linear in red');
  // in shadow it falls under the crossing and goes to literal zero
  const shadowed = floorLin.map(v => v * 0.2);
  assert(aces(shadowed[0]) === 0, '...so in shade its red channel tone-maps to exactly 0');
  assert(aces(floorLin[2]) > 0, 'sanity: the blue channel is not zero when lit, so this is a near-black surface, not a broken one');
}

// ---------------------------------------------------------------- 2. the grade must run in display space
{
  const comp = src.slice(src.indexOf('_matComp=new THREE.ShaderMaterial'), src.indexOf('_matAfter=new THREE.ShaderMaterial'));
  const encAt = comp.indexOf("c=_out(clamp(c,0.0,1.0));");
  const conAt = comp.indexOf("c=(c-0.5)*uCon+0.5;");
  const satAt = comp.indexOf('c=mix(vec3(l), c, uSat)');
  const vigAt = comp.indexOf('smoothstep(0.42,0.78,r)*uVig');
  const grnAt = comp.indexOf('(n-0.5)*uGrain');
  const bloomAt = comp.indexOf('texture2D(tBloom,vUv).rgb * uBloom');
  assert(encAt > 0, 'the composite encodes to display space');
  assert(bloomAt < encAt, 'bloom is added BEFORE the encode — light adds like light, in linear');
  for (const [name, at] of [['contrast', conAt], ['saturation', satAt], ['vignette', vigAt], ['grain', grnAt]])
    assert(at > encAt, name + ' runs AFTER the encode');
  assert(!/_out\(clamp\(c,0\.0,1\.0\)\), 1\.0\)/.test(comp), 'and the final write does not encode a second time');
}
{
  // the arithmetic that makes this a real bug and not a preference
  const uCon = 1.05;                       // DEFAULT_WORLD.postCon, the shipped default
  const crossing = 0.5 - 0.5 / uCon;       // (c-0.5)*uCon+0.5 == 0
  const enc = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  assert(Math.abs(crossing - 0.02381) < 1e-4, 'in LINEAR space, contrast 1.05 sends everything below 0.0238 negative');
  assert(Math.round(enc(crossing) * 255) === 43,
    '...which is everything that should display below sRGB 43/255 — an eighth of the range, crushed to black');
  // in display space the same contrast is harmless: it only pivots around mid-grey
  assert(0.5 - 0.5 / uCon < 0.03, 'sanity: the crossing is a small display value, so grading there clips almost nothing');
  const m = src.match(/postCon:([0-9.]+)/);
  assert(m && +m[1] === uCon, 'the default this was computed against is still the shipped one (' + (m && m[1]) + ')');
}

// ---------------------------------------------------------------- the capture that found it was not reproducible
assert(/identical source produced/.test(readFileSync(new URL(import.meta.url)).toString()),
  'this file records that the originating capture was non-deterministic, so nobody re-derives it from one screenshot');

done('build 1117: the engine floor stops z-fighting every generated arena, and the grade runs in display space');
