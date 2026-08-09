// build 1441 — a canvas is an image, and an image of a colour has to say so.
//
// From the four-critic audit. Every texture this engine LOADS FROM A FILE is tagged sRGB, because that is
// what an 8-bit colour image is. Every texture it DRAWS ITSELF was not, so three treated the bytes as
// linear and each of them rendered too bright. This is build 1429's defect in the MIRROR: that build found
// DATA maps being decoded as colour; this one is colour not being decoded at all.
//
// The arithmetic, on the two a creator looks at closest:
//   a bullet decal core, rgba(8,6,4,.95)  ->  0.031 read as linear where 0.0024 was meant, ~13x
//   an authored sign at #808080           ->  0.5   read as linear where 0.214 was meant, ~2.3x
//
// AND A LARGER ONE FOUND ON THE WAY. Two sites already carried what looked like a tag:
//
//   if('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
//
// with no `encoding` companion. On r149 a Texture has `.encoding` and NO `.colorSpace` at all, so that test
// is FALSE and the assignment never ran. The muzzle flash and the explosion sheets — the two most-drawn
// textures in the game, and both ADDITIVE, so an over-bright decode goes straight into the frame — believed
// they were tagged for as long as they have existed, as did a creator's own flipbook url.
//
// A tag written against a three version you are not running is not a tag. That premise is asserted against
// the REAL vendored build below, because an upgrade would invalidate the whole build silently.
import { createRequire } from 'node:module';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const require = createRequire(import.meta.url);
const THREE = require('three');
const three = require('node:fs').readFileSync(
  new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');

/* ---- THE PREMISE, against the real vendored three ------------------------------------------------ */
{
  const t = new THREE.Texture({ width: 4, height: 4 });
  eq('colorSpace' in t, false,
    'PREMISE: an r149 Texture has NO .colorSpace — which is why a bare colorSpace test never fires');
  eq('encoding' in t, true, 'PREMISE: it has .encoding');
  eq(THREE.sRGBEncoding, 3001, 'PREMISE: sRGBEncoding is the 3001 the writer assigns');
  eq(t.encoding, THREE.LinearEncoding, 'PREMISE: and an untagged texture defaults to LINEAR — the defect');
  assert((three.match(/texture\.encoding/g) || []).length > 0,
    'PREMISE: WebGLTextures decides the decode from .encoding');
  eq((three.match(/texture\.colorSpace/g) || []).length, 0,
    'PREMISE: ...and never once reads .colorSpace, so the old spelling reached nothing at all');
}

/* ---- EXECUTED: the one writer -------------------------------------------------------------------- */
const srgbTex = new Function('THREE', extractFunction('_srgbTex', src) + '; return _srgbTex;')(THREE);
{
  const t = new THREE.Texture({ width: 4, height: 4 });
  assert(srgbTex(t) === t, 'it hands the texture back, so it can wrap a constructor in place');
  eq(t.encoding, 3001, '...and on THIS three it takes the encoding branch');
  assert(!('colorSpace' in t), '...without inventing a property the build does not have');
}
{
  // the forward-compatible branch: a three that HAS colorSpace must take it instead
  const fake = { colorSpace: 'srgb-linear', encoding: 3000 };
  srgbTex(fake);
  eq(fake.colorSpace, THREE.SRGBColorSpace, 'on a newer three it sets colorSpace');
  eq(fake.encoding, 3000, '...and leaves the legacy field alone rather than writing both');
}
{
  eq(srgbTex(null), null, 'a null texture passes through — a failed load must not throw here');
  eq(srgbTex(undefined), undefined, '...and so does undefined');
}

/* ---- the numbers this build exists for ----------------------------------------------------------- */
const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
{
  const meant = s2l(8 / 255), wrong = 8 / 255;
  near(meant, 0.00242, 1e-4, 'a decal core of 8/255 MEANS 0.0024 linear');
  near(wrong / meant, 12.9, 0.5, '...and untagged arrived ~13x too bright — a pale smudge, worst in the dark');
  const sm = s2l(0.5);
  near(sm, 0.2140, 1e-3, 'a sign at #808080 means 0.214 linear');
  near(0.5 / sm, 2.34, 0.02, '...and untagged arrived ~2.3x too bright');
  // and the two values the alpha-only sheets actually contain are fixed points, so tagging them is a no-op
  eq(s2l(0), 0, '0 is a fixed point of the transfer');
  near(s2l(1), 1, 1e-12, '...and so is 1 — which is why the white/black sheets could be routed for free');
}

/* ---- THE INVARIANT: every canvas that carries a colour says so ----------------------------------- */
// Deliberately a property of the whole file rather than a list of sites, because a list rots and the next
// canvas texture somebody adds is exactly the one that would be missed.
const canvasSites = [...src.matchAll(/(.{0,40})new THREE\.CanvasTexture\(/g)].map(m => m[1]);
assert(canvasSites.length >= 15, 'found the canvas textures at all — ' + canvasSites.length);
const bare = canvasSites.filter(p => !/_srgbTex\($/.test(p));
eq(bare.length, 3,
  'exactly three canvas textures are NOT tagged, and every one of them carries DATA rather than colour');

// ...and those three are named, in both directions, because dragging a data map through an sRGB decode is
// precisely what build 1429 had to undo after an encoder had done it.
const proc = extractFunction('_procSurface', src);
assert(/const normalMap = new THREE\.CanvasTexture\(nc\);/.test(proc) &&
       !/_srgbTex\(new THREE\.CanvasTexture\(nc\)/.test(proc),
  'the procedural NORMAL map is never tagged — it is a packed vector, not a colour');
assert(/const roughnessMap = new THREE\.CanvasTexture\(rc\);/.test(proc) &&
       !/_srgbTex\(new THREE\.CanvasTexture\(rc\)/.test(proc),
  '...nor the roughness map beside it');
assert(/NOT sRGB[\s\S]{0,400}const normalMap = new THREE\.CanvasTexture\(nc\)/.test(src),
  '...and the reason is written where somebody would come to "fix" it');
assert(/NOT sRGB[\s\S]{0,200}const _paintTex = new THREE\.CanvasTexture\(_paintCanvas\)/.test(src),
  'the splat texture is likewise named as weights, not colour');

/* ---- the sites the finding named ------------------------------------------------------------------ */
const tagged = (name, what) => assert(
  /_srgbTex\(new THREE\.(CanvasTexture|TextureLoader)/.test(extractFunction(name, src)), what);
tagged('_makeDefaultDecalTex', 'the default bullet decal is tagged');
tagged('_getDecalTex', 'and so is a creator’s own decal url — the one loader in the file that never said so');
tagged('_signRender', 'a build-1411 sign is tagged, and it is UNLIT, so its board colour reaches the frame ' +
  'directly rather than being multiplied by a light first');
tagged('_arRingTex', 'the hitbox-rig ring markers are tagged');
tagged('makeNameSprite', 'and a player’s name tag, which is drawn in the roster’s own colour');

/* ---- the tag that was written and never fired ----------------------------------------------------- */
eq((src.match(/if\('colorSpace' in \w+\) \w+\.colorSpace ?= ?THREE\.SRGBColorSpace;(?! ?else)/g) || []).length, 0,
  'no sRGB tag anywhere tests colorSpace WITHOUT an encoding companion — the form that silently did nothing');
{
  const sheet = extractFunction('_procVfxSheet', src);
  assert(/_srgbTex\(new THREE\.CanvasTexture\(cv\)\)/.test(sheet),
    'the procedural flipbook sheet goes through the writer that tries both spellings');
  // the STATEMENT, never the bare word: the comment I wrote at that site to explain the removal names
  // `colorSpace` in prose, and a bare grep is defeated by it. Builds 164, 1393, 1395, 1411, 1421 and 1439
  // all record this trap in one direction or the other; this is the seventh.
  assert(!/\.colorSpace\s*=/.test(sheet), '...and the dead assignment is gone, not left beside the new one');
}
assert(/\(t\)=>\{ _srgbTex\(t\);/.test(src),
  'the LOADED flipbook — a creator’s own sheet url — is tagged on delivery too');

/* ---- what must NOT have changed -------------------------------------------------------------------- */
// build 1429's repair drags DATA slots back to linear. It runs on imported materials and is untouched here;
// if this build had reached it, every generated level's interior bake would have gone linear.
assert(/DATA_MAP_SLOTS/.test(src), 'build 1429’s data-slot repair is still present');
assert(/m\.lightMap\.colorSpace = THREE\.SRGBColorSpace; else m\.lightMap\.encoding = 3001/.test(src),
  '...and the bake, which IS sRGB-authored, still gets its tag by the correct two-branch form');
eq((src.match(/function _srgbTex\(/g) || []).length, 1, 'one writer, declared once');

done('build 1441: the canvases that carry a colour are decoded as colour — a bullet hole stops rendering ' +
     '13x too bright and a sign 2.3x — and the two sheets that believed they were already tagged, the ' +
     'muzzle flash and the explosion, turn out to have been testing for a property r149 does not have');
