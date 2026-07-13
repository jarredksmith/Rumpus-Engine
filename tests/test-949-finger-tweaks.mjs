// (build 949) FINGER BONES IN JOINT TWEAKS — thumb/index/middle/ring/pinky, three segments each,
// both hands. The canonicalizer already named them (Mixamo 'LeftHandIndex2' and UE 'index_02_l'
// both land on L:index2) and the apply path resolves any canonical key, so this is the label list
// (30 generated entries) plus the sanitizer's key cap raised 24 -> 64 (both hands of fingers alone
// are 30 keys).
// Verified live on the UAL rig: the dropdown listed all 30, a +60° X tweak on 'L index 2' rotated
// index_02_l by exactly 60.0° (stable over a second of animation), and clearing returned the
// finger to the mixer.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

assert(/const F=\['thumb','index','middle','ring','pinky'\]; for\(const sd of \['L','R'\]\) for\(const f of F\) for\(let i=1;i<=3;i\+\+\) JF_LABELS\[sd\+':'\+f\+i\]=sd\+' '\+f\+' '\+i;/.test(src),
  'all 30 finger bones (5 fingers x 3 segments x 2 hands) join the tweakable set');
assert(/if\(n>=64\) break;/.test(extractFunction('_sanitizeJointFix', src)),
  'the sanitizer keeps up to 64 tweaked bones (fingers alone are 30)');
assert(!/if\(n>=24\) break;/.test(src), 'the old 24-key cap is gone');

done('build 949: finger bones are joint-tweakable — full-hand pose fixes, both hands');
