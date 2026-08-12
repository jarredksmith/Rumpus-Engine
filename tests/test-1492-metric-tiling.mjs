// build 1492 — a texture on a stretched primitive tiles by METRES, not by face
//
// Reported from play: "if I add a concrete texture to a primitive and then stretch it to be a long skinny
// rectangle, either the sides will look correct or the top and bottom will look correct... no matter how I
// adjust the x and y tiling in the editor, I can't fix it."
//
// It is unfixable from the panel by construction: `texture.repeat` is ONE (u,v) pair shared by all six faces
// while a BoxGeometry's UVs run 0..1 per face whatever that face's real size is. A 1x1x20 box wants (20,1)
// on its long sides, (1,1) on its caps and (1,20) on its top — one pair serves one of them.
//
// Half of this test is about the SHADER's premises against the real vendored three, because an undefined
// function inside a chunk every lit material compiles is a silent subsystem loss, not an error.

import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const three = readFileSync(new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');

/* ================================================================ the premises, in the REAL three build */
{
  const chunk = three.match(/var map_fragment = "([\s\S]{0,900}?)";/);
  assert(chunk, "three's map_fragment is where it was");
  const text = JSON.parse('"' + chunk[1] + '"');

  /* THE ONE THAT NEARLY SHIPPED BROKEN. The first draft called `mapTexelToLinear` on the hand-sampled
     texel, on the assumption that three decodes sRGB inside this chunk. It does NOT in r149 — the chunk is
     a bare multiply and the decode happens at UPLOAD, in the GL layer's internal format — so that call was
     an undefined function in a chunk every lit material compiles. Verified, not assumed. */
  assert(!/TexelToLinear/.test(text),
    'map_fragment does NO texel decode, so a hand-rolled sample must not call one');
  assert(/diffuseColor \*= sampledDiffuseColor;/.test(text), 'it is a bare multiply');
  assert(/texture2D\( map, vUv \)/.test(text), 'and samples `map` — the uniform this build re-projects');
  assert(!/mapTexelToLinear/.test(three), 'the function the first draft invented exists nowhere in r149');

  /* the guard the patch wraps itself in has to be the define three actually emits */
  assert(/#ifdef USE_MAP/.test(text), 'USE_MAP is the define that gates a map at all');

  /* the metric varying is composed with instanceMatrix when instancing is on, so the name must be real */
  assert(/instanceMatrix/.test(three), 'three exposes instanceMatrix for an instanced draw');
  assert(/#ifdef USE_INSTANCING/.test(three), 'behind USE_INSTANCING, which is what the patch tests');
}

/* ================================================================ the vertex patch */
const objDetail = extractFunction('applyObjDetail', src);
assert(objDetail, 'applyObjDetail is one function');

{
  assert(/varying vec3 vOdMet;/.test(objDetail), 'the metric varying is declared in both stages');
  eq((objDetail.match(/varying vec3 vOdMet;/g) || []).length, 2,
     'exactly twice — the vertex shader and the fragment shader');

  /* vOdPos must be BYTE-UNTOUCHED: builds 1379/1388 tune their noise against a unit box and re-derive
     density on the CPU, so moving that coordinate would silently retune every one of them */
  assert(/vOdPos = position;/.test(objDetail), 'vOdPos is still the raw unit-box position');
  assert(!/vOdPos = position \*/.test(objDetail), 'and is NOT scaled — that would retune 1379 and 1388');

  /* the scale comes from the matrix rather than a CPU uniform, so a resize needs nobody told */
  assert(/length\(_odM\[0\]\.xyz\)/.test(objDetail), 'the world scale is the model matrix column lengths');
  assert(/modelMatrix \* instanceMatrix/.test(objDetail), 'composed with instanceMatrix under USE_INSTANCING');
  assert(/vOdMet = position \* max\(_odS, vec3\(1e-4\)\)/.test(objDetail),
    'metres, with a degenerate axis floored rather than collapsing the projection to a line');
}

/* ================================================================ the fragment patch */
{
  const i = objDetail.indexOf("'#ifdef USE_MAP',");
  assert(i > 0, 'the map patch is in the map_fragment replacement');
  const blk = objDetail.slice(i, objDetail.indexOf("'#endif',", i) + 9);

  assert(/if\( uOdMapF > 0\.0 \)\{/.test(blk), 'gated on a per-material frequency');
  /* 0 must fall through to three's OWN chunk, or every model and every opted-out prop loses its texture */
  eq((blk.match(/#include <map_fragment>/g) || []).length, 2,
     "both the else and the no-USE_MAP branch fall through to three's own chunk");
  /* a CALL, not the bare name: the source comment beside it explains what the first draft called and why it
     does not exist, and a bare-name pin is satisfied — or here, DEFEATED — by that prose. This file records
     the same trap under builds 164, 1393, 1395, 1411 and 1421, and it caught this assertion on its first run. */
  assert(!/TexelToLinear\s*\(/.test(blk), 'and no decode CALL, per the premise above');

  /* triplanar: three projections blended by the surface normal, the same shape build 1384 already uses */
  for(const proj of ['vOdMet.zy', 'vOdMet.xz', 'vOdMet.xy'])
    assert(blk.indexOf(proj) > 0, 'projects from ' + proj);
  assert(/_mb = abs\(normalize\(vOdNrm\)\)/.test(blk), 'blended by the object-space normal');
  assert(/_mb \/= max\(1e-4, _mb\.x\+_mb\.y\+_mb\.z\)/.test(blk),
    'and normalised, so the three weights sum to one and the sample is not brightened');
}

/* ================================================================ the derivation, executed */
const freq = (function(){
  const f = extractFunction('_propMapFreq', src);
  assert(f, '_propMapFreq is one function');
  return new Function(f + '; return _propMapFreq;')();
})();

/* THE COMPATIBILITY CLAIM, which is the whole reason this can default to on: normalising by the LONGEST
   axis means the biggest face keeps exactly the tiling it has today. */
{
  /* a cube of any size: `repeat` tiles across a face, before and after */
  for(const s of [1, 3, 12]){
    const mf = freq(4, s);
    near(s * mf, 4, 1e-9, 'a ' + s + 'm cube still shows exactly the 4 tiles that were typed');
  }
  /* the stretched box from the report: every axis at the SAME density */
  const mf = freq(4, 20);                       // 1 x 1 x 20, longest axis 20
  near(20 * mf, 4, 1e-9, 'the long face keeps the authored 4 tiles — the face a creator tuned by eye');
  near(1 * mf, 0.2, 1e-9, 'and a 1 m face gets 0.2 of a tile, which is the SAME grain rather than 4 of them');
  const perM = [20, 1, 1].map(a => (a * mf) / a);
  near(perM[0], perM[1], 1e-12, 'tiles per metre is equal on the long axis and the short one');
  near(perM[1], perM[2], 1e-12, 'and on the third');
}
{
  /* hostile input cannot produce a division blow-up or a zero frequency */
  assert(freq(0, 10) > 0, 'a zero tiling clamps rather than switching the projection off');
  assert(isFinite(freq(1e9, 1e9)), 'and an absurd pair stays finite');
  assert(freq(4, 0) > 0 && isFinite(freq(4, 0)), 'a zero span cannot divide by zero');
  assert(isFinite(freq(NaN, NaN)), 'NaN in, a real number out');
}

/* ================================================================ the CPU wiring */
{
  /* ONE writer of the frequency, because it is derived from three things that move independently */
  const sync = extractFunction('_syncPropMapFreq', src);
  assert(sync, '_syncPropMapFreq is one function');
  assert(/userData\._odMapF = mf/.test(sync), 'it writes the material');
  assert(/u\.uOdMapF\.value = mf/.test(sync),
    'AND the live uniform — the uniform is created at first compile, so writing one of them lands nowhere half the time');
  assert(/!obj\.userData\.texFit/.test(sync), 'the opt-out turns it off');
  assert(/obj\.userData\.tex/.test(sync), 'and an untextured prop gets 0, never a projection');

  /* a RESIZE re-derives it, through the hook that already means "this prop was scaled" */
  const retile = extractFunction('retileProcSurface', src);
  assert(/_syncPropMapFreq\(root\)/.test(retile), 'a resize re-derives the density');
  assert(retile.indexOf('_syncPropMapFreq') < retile.indexOf('_procSet'),
    'before the early-out, or a prop with no procedural set never re-derives');

  /* the tiling field moves it too */
  const rep = extractFunction('applyPropTexRepeat', src);
  assert(/_syncPropMapFreq\(obj\)/.test(rep), 'and so does the tiling number it is derived from');
}

/* ================================================================ round trip */
{
  assert(/if\(o\.userData\.texFit\) m\.tfit = 1;/.test(src),
    'the opt-out serializes ONLY when set, so no existing level grows a key');
  const i = src.indexOf('if(mat.tfit) obj.userData.texFit = true');
  const j = src.indexOf('if(mat.tex) applyPropTexture(obj, mat.tex);');
  assert(i > 0 && j > 0, 'both lines are in the material restore');
  /* ORDER, and it was wrong first: applyPropTexture DERIVES the frequency from the flag, so a flag restored
     one line later loads every opted-out prop with the new projection and nothing fails. */
  assert(i < j, 'the flag is restored BEFORE the texture that reads it');
}

done('build 1492 — a creator\'s texture is measured in metres, so every face of a stretched primitive ' +
     'carries the same grain, and the longest face keeps exactly the tiling it had');
