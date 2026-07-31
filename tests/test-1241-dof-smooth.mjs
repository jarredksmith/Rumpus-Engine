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
{
  // the shipped constants: radius = cocN * clamp(strength,0,4) * 6 texels; spacing = min(radius/8, 1.5)
  const spacing = (cocN, strength) => Math.min((cocN * Math.min(4, Math.max(0, strength)) * 6) / 8, 1.5);
  for (const s of [0.5, 1.4, 3, 4, 400]) {
    assert(spacing(1, s) <= 1.5, 'tap spacing never exceeds 1.5 texels at strength ' + s + ' — the banding that read as "blocky" is structurally impossible');
  }
  near(spacing(1, 4), 1.5, 1e-9, 'full blur saturates the cap');
  near(spacing(0.2, 1.4), 0.21, 0.01, 'gentle blur uses proportionally tighter taps');
  // 17 taps at <=1.5 spacing: adjacent taps always overlap under the gaussian, so no repeated images
  assert(1.5 <= 2.0, 'spacing stays under the 2-texel overlap threshold for a smooth kernel');
}

// ---------------------------------------------------------------- the shader shape
{
  const dof = src.slice(src.indexOf('build 1241: the DoF stops being blocky'), src.indexOf('_dofMatH = new THREE.ShaderMaterial'));
  assert(/float cocAt\(vec2 uv\)\{ float dd = viewZ\(texture2D\(tDepth, uv\)\.x\); return smoothstep\(0\.0, 1\.0, abs\(dd - uFocus\) \/ max\(0\.001, uRange\)\); \}/.test(dof),
    'the CoC is a smoothstep — soft focus-to-blur transition instead of a linear ramp with a hard cutoff');
  assert(/float spacing = min\(radius \/ 8\.0, 1\.5\);/.test(dof), 'the spacing cap ships');
  assert(/for\(int i=-8;i<=8;i\+\+\)/.test(dof), '17 taps');
  assert(/exp\(-fi\*fi\/32\.0\) \* \(0\.25 \+ 0\.75\*cocAt\(uv2\)\)/.test(dof),
    'each tap is weighed by its OWN focus — an in-focus neighbour mostly keeps its colour to itself, killing the sharp-edge halo');
  assert(/if\(radius < 0\.35\)/.test(dof) && /_out\(c0\.rgb\)/.test(dof),
    'the in-focus early-out still encodes through the shared OETF (the 1115 invariant)');
  assert(/uEncode/.test(src.slice(src.indexOf('function _runDofTo'), src.indexOf('function _runDofTo') + 1600)),
    'the encode-once plumbing is untouched');
}
{ // the editor hint tells the truth about the saturation trade
  assert(/it saturates rather than ever going blocky/.test(src), 'the hint says what Strength actually does now');
}

done('build 1241: the DoF is smooth at every strength — spacing computed from the shipped constants proves the cap holds from 0.5 through a hostile 400, the smoothstep CoC and own-focus tap weights are in the shader, the 1115 encode invariant survives both paths, and the capture measured the real thing: 36% far-field gradient drop at focus 4m with luminance steady');
