import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const src = gameSource();
// build 1340 — rendering audit #4, re-verified before building: `alphaTest` appears once in the whole game
// script (a snow sprite), so "foliage cards, chain-link, grates and decals-as-props are unbuildable without
// either z-fighting or blend-sorting artifacts; opacity <1 forces `transparent`". A creator had exactly one
// alpha tool and it was the wrong one — alpha BLENDING sorts per object, so a bush drawn as one transparent
// card either draws in front of what is behind it or vanishes behind it and never intersects correctly.
// A cutout is opaque: it writes depth, sorts per PIXEL for free, and needs no ordering at all.
//
// Measured live (tools/probe/alpha-cutout.mjs) on a white card with a striped alpha texture, same camera,
// same scanline through the card's own projected centre, only the flag changed:
//
//   cutout 0     alphaTest 0    transparent false  side front    scanline min 12 max 17   FLAT — one solid card
//   cutout 0.5   alphaTest 0.5  transparent false  side double   scanline min 16 max 82   alternating, 31 runs
//
// The first two runs of that probe sampled the MIDDLE of the frame and produced numbers opposite to the
// prediction, because the card was not on that scanline at all. It projects the card and raycasts it before
// believing a pixel now — build 1124's rule, and the third time this session it has been the answer.

// ---------------------------------------------------------------- one writer of the blend state
{
  // Two functions each setting transparent/depthWrite/alphaTest on one material is the defect this file has
  // recorded six times: whichever ran last would win, so nudging opacity would silently un-cut the leaves.
  const blend = extractFunction('_applyPropBlend');
  const op = extractFunction('applyPropOpacity');
  const cut = extractFunction('applyPropCutout');
  for (const [n, f] of [['applyPropOpacity', op], ['applyPropCutout', cut]]) {
    assert(/_applyPropBlend\(obj\);/.test(f), n + ' routes through the one writer…');
    assert(!/\.transparent\s*=|\.alphaTest\s*=|\.depthWrite\s*=/.test(f), '…and sets none of it itself: ' + n);
  }
  assert(/m\.alphaTest = cut; m\.transparent = false; m\.opacity = 1; m\.depthWrite = true;/.test(blend),
    'a cutout is OPAQUE — blending it too would put it back in the sorted pass it exists to escape');
  assert(/m\.side = THREE\.DoubleSide;/.test(blend), 'and double-sided…');
  assert(/a single-sided quad is INVISIBLE from behind/.test(src),
    '…because a foliage card, a grate and chain-link are all single quads');

  // executable: the state machine, both directions, with the awkward order
  const run = new Function('THREE', `
    const CUT_MAX = ${'0.99'};
    const isMatPrimitive = ()=>true;
    let mat = { alphaTest:0, transparent:false, opacity:1, depthWrite:true, side:THREE.FrontSide, needsUpdate:false };
    const eachPrimMesh = (o, fn)=>fn({ material: mat });
    ${blend}
    ${op}
    ${cut}
    const obj = { userData:{ src:'box' } };
    const snap = ()=>({ a:mat.alphaTest, t:mat.transparent, o:+mat.opacity.toFixed(2), d:mat.depthWrite,
                        s: mat.side===THREE.DoubleSide ? 'double' : 'front' });
    const out = {};
    applyPropOpacity(obj, 0.4);            out.glass = snap();
    applyPropCutout(obj, 0.5);             out.cutOverGlass = snap();
    applyPropOpacity(obj, 0.9);            out.opacityWhileCut = snap();
    applyPropCutout(obj, 0);               out.cutOff = snap();
    applyPropCutout(obj, 5);               out.clampHigh = mat.alphaTest;
    return out;`)(THREE);

  eq(JSON.stringify(run.glass), JSON.stringify({ a:0, t:true, o:0.4, d:false, s:'front' }), 'glass is unchanged from build 871');
  eq(JSON.stringify(run.cutOverGlass), JSON.stringify({ a:0.5, t:false, o:1, d:true, s:'double' }),
    'a cutout overrides the blend entirely');
  eq(JSON.stringify(run.opacityWhileCut), JSON.stringify({ a:0.5, t:false, o:1, d:true, s:'double' }),
    'and nudging opacity while cut out does NOT un-cut it — the property this shape exists for');
  // depthWrite TRUE at 0.9 is build 871's own rule — it stays on down to ~0.6, since solid-ish plastic
  // sorts fine and only true glass must never occlude itself. (My first expectation here was wrong.)
  eq(JSON.stringify(run.cutOff), JSON.stringify({ a:0, t:true, o:0.9, d:true, s:'front' }),
    'turning the cutout off restores the opacity the creator had set meanwhile, on 871’s own depthWrite rule');
  eq(run.clampHigh, 0.99, 'the cutoff clamps below 1 — at exactly 1 every pixel fails and the prop vanishes');
}

// ---------------------------------------------------------------- the shadow follows the holes
{
  // three's shadow pass swaps in a depth material, and it only carries the cutout when the material has a
  // map. Asserted against the REAL build, because if an upgrade drops this the foliage silently starts
  // casting rectangles and nothing errors.
  // read the bundle directly: three's package `exports` does not expose ./build/three.cjs to a resolver
  const three = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),
    'node_modules', 'three', 'build', 'three.cjs'), 'utf8');
  const i = three.indexOf('function getDepthMaterial');
  const body = three.slice(i, i + 2600);
  assert(/\( material\.map && material\.alphaTest > 0 \)/.test(body),
    'r149 takes the custom-depth branch for a mapped alphaTest material…');
  assert(/result\.alphaTest = material\.alphaTest;/.test(body) && /result\.map = material\.map;/.test(body),
    '…and copies alphaTest and the map into it, so the shadow has the same holes');
  assert(/result\.side = \( material\.shadowSide !== null \) \? material\.shadowSide : shadowSide\[ material\.side \]/.test(body),
    'and the side is mapped through, so a double-sided card still casts');
}

// ---------------------------------------------------------------- it rides the level
{
  assert(/if\(o\.userData\.cut\) m\.cut = \+o\.userData\.cut;/.test(src), 'serialized only when set');
  assert(/if\(mat\.cut!=null\) applyPropCutout\(obj, mat\.cut\);/.test(src), 'and applied on load…');
  const a = src.indexOf('if(mat.op!=null) applyPropOpacity');
  const b = src.indexOf('if(mat.cut!=null) applyPropCutout');
  assert(a > 0 && b > a, '…AFTER opacity, because the cutout overrides it and the last call decides');
}

// ---------------------------------------------------------------- and the panel explains it
{
  assert(/slider\('Cutout'/.test(src), 'there is a Cutout slider beside Opacity');
  assert(/the creator-facing thing\n         is "holes in the texture", not the technique/.test(src),
    'named for what it does rather than for alpha testing');
  assert(/casts a hole-shaped shadow/.test(src), 'the hint says the shadow follows…');
  assert(/it also becomes double-sided/.test(src), '…and that it turns double-sided…');
  assert(/Cutout replaces Opacity/.test(src), '…and that the two are exclusive, which is the surprising part');
}

done('build 1340 (rendering audit #4): `alphaTest` appeared once in the whole game script — a snow sprite — so a creator had exactly one alpha tool and it was the wrong one. Alpha BLENDING sorts per object, so foliage, chain-link and grates drawn as transparent cards either draw in front of what is behind them or vanish behind it, and never intersect correctly; a cutout is opaque, writes depth, and sorts per pixel for free. Cutout and blend are mutually exclusive and there is exactly ONE writer of the blend state, because two functions each setting transparent/depthWrite/alphaTest is the defect this file has recorded six times — whichever ran last would win, so nudging opacity would silently un-cut the leaves. Executed here in both directions: glass is byte-identical to build 871, a cutout overrides it, changing opacity WHILE cut out leaves the cutout intact, and turning the cutout off restores the opacity set meanwhile. A cutout is double-sided, because a foliage card, a grate and chain-link are all single quads and a single-sided quad is invisible from behind. The shadow follows the holes, asserted against the real r149 shadow path rather than assumed. Measured live on a card with a striped alpha texture, same camera and the scanline through the card\'s own projected centre: min 12 max 17 (a flat, solid card) becomes min 16 max 82 alternating across 31 runs');
