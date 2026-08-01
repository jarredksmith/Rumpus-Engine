// build 1241: the DoF stops being blocky — reported from play: "super blocky and I can't ever quite
// get the settings to look right." Two structural shader faults: tap SPACING scaled with the blur
// (step = coc*6 texels with strength folded into coc, so strong blur put 13 taps across ~140 texels —
// visibly repeated images, exactly "blocky"), and every tap weighed by the CENTER's blur only (sharp
// in-focus edges smeared halos into the blurred field). Now: spacing capped at 1.5 texels between
// taps — the radius SATURATES instead of ever banding, so no strength setting can break the image —
// 17 taps, each weighed by its OWN focus, and a smoothstep CoC for a soft transition. CAPTURE-
// VERIFIED: focus 4m/range 3/strength 3 drops far-field gradient energy 36.0% vs DoF off while
// luminance holds within 1.8% (a silently-failed raw shader would have crashed it).
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the structural guarantees, computed
// build 1247 note: the blur became a 32-tap Vogel DISC + a 3x3 CoC-scaled fill. The 1241 intent —
// no strength setting can ever band the image — now rests on the RADIUS cap (14 texels) plus the
// fill pass; the computed check moves to the new constants.
{
  const radius = (cocN, strength) => Math.min(cocN * Math.min(4, Math.max(0, strength)) * 6, 14);
  for (const s of [0.5, 1.4, 3, 4, 400]) {
    const r = radius(1, s);
    // Vogel point spacing ~ r*sqrt(pi/N); with the 14-texel cap, bilinear taps (~2 texels) plus the
    // 3x3 fill (spread ~1.4, span ~4.2) cover the widest gap — repeated images stay impossible
    const gap = r * Math.sqrt(Math.PI / 32);
    assert(gap <= 4.4001, 'widest Vogel gap at strength ' + s + ' is covered by bilinear + the fill pass');
  }
  near(radius(1, 400), 14, 1e-9, 'a hostile strength saturates the radius cap');
  const fillSpacing = (r) => Math.min(r * 0.18, 1.4);
  assert(fillSpacing(14) === 1.4 && fillSpacing(2) < 0.4, 'the fill spread scales with local CoC and is capped');
}

// ---------------------------------------------------------------- the shader shape
{
  const dof = src.slice(src.indexOf('build 1241: the DoF stops being blocky'), src.indexOf('_dofMatH = new THREE.ShaderMaterial'));
  assert(/float cocAt\(vec2 uv\)\{ float dd = viewZ\(texture2D\(tDepth, uv\)\.x\); return smoothstep\(0\.0, 1\.0, abs\(dd - uFocus\) \/ max\(0\.001, uRange\)\); \}/.test(dof),
    'the CoC is a smoothstep — soft focus-to-blur transition instead of a linear ramp with a hard cutoff');
  assert(/float radius = min\(cocN \* clamp\(uStrength, 0\.0, 4\.0\) \* 6\.0, 14\.0\);/.test(dof), 'the radius cap ships (1247: the anti-banding guarantee moved from tap spacing to the disc radius + fill)');
  assert(/for\(int i=0;i<32;i\+\+\)/.test(dof), '32 disc taps');
  assert(/float spacing = min\(radius \* 0\.18, 1\.4\);/.test(dof), 'the fill spread is capped');
  assert((dof.match(/\(0\.25 \+ 0\.75\*cocAt\(uv2\)\)/g) || []).length === 2,
    'each tap in BOTH passes is weighed by its OWN focus — an in-focus neighbour mostly keeps its colour to itself, killing the sharp-edge halo');
  assert(/if\(radius < 0\.35\)/.test(dof) && /_out\(c0\.rgb\)/.test(dof),
    'the in-focus early-out still encodes through the shared OETF (the 1115 invariant)');
  assert(/uEncode/.test(src.slice(src.indexOf('function _runDofTo'), src.indexOf('function _runDofTo') + 1600)),
    'the encode-once plumbing is untouched');
}
{ // the editor hint tells the truth about the saturation trade
  assert(/it saturates rather than ever going blocky/.test(src), 'the hint says what Strength actually does now');
}

done('build 1241: the DoF is smooth at every strength — the anti-banding guarantee holds through the 1247 disc rewrite (radius cap + fill computed from the shipped constants, hostile 400 included), the smoothstep CoC and own-focus tap weights survive in both passes, and the 1115 encode invariant is untouched');
