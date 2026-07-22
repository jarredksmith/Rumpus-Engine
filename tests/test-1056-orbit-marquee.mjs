// (build 1056) ANIM-EDITOR FEEL — author: "orbiting seems backwards" and "a way to click and
// drag to select multiple keyframes at once."
//  1) Orbit: dragging moved the CAMERA (+yaw with +dx), so the character appeared to spin
//     opposite the drag — while the auto-rig modal spins the model WITH the drag. The viewport
//     now matches: drag right, the character turns right.
//  2) Marquee: dragging across an empty spot on a dope-sheet row sweeps a band that selects
//     every key it covers (shift adds to the selection); a motionless click keeps the old
//     behavior (select the bone, jump the playhead), and the ruler stays a pure scrub zone.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- 1) orbit direction ----
assert(/_aeYaw-=dx\*0\.008;/.test(src), 'drag right -> the character turns right (grab-the-model)');
assert(!/_aeYaw\+=dx\*0\.008/.test(src), 'the camera-relative (backwards-feeling) orbit is gone');
assert(/_aePitch=Math\.max\(-1\.2, Math\.min\(1\.4, _aePitch\+dy\*0\.006\)\)/.test(src), 'vertical orbit is untouched');

// ---- 2) the marquee's pure brain, executed ----
const env = new Function(extractFunction('_aeKeysInRange', src) + '\nreturn _aeKeysInRange;')();
const clip = { dur: 1, tracks: { 'L:uparm': {
  q: [[0, 0, 0, 0, 1], [0.25, 0, 0, 0, 1], [0.5, 0, 0, 0, 1], [0.9, 0, 0, 0, 1]],
  p: [[0.3, 0, 0, 0], [0.25, 0, 0, 0]],   // a p-key sharing a q-key's time must not duplicate
} } };
eq(env(clip, 'L:uparm', 0.2, 0.55).join(','), '0.25,0.3,0.5', 'the band gathers every keyed time it covers, q and p merged');
eq(env(clip, 'L:uparm', 0.55, 0.2).join(','), '0.25,0.3,0.5', 'sweeping right-to-left selects the same keys');
eq(env(clip, 'L:uparm', 0.25, 0.25).join(','), '0.25', 'edge tolerance: a zero-width band on a key still catches it');
eq(env(clip, 'L:uparm', 0, 1).length, 5, 'a full-span sweep takes everything');
eq(env(clip, 'R:hand', 0, 1).length, 0, 'an unkeyed slot yields nothing');
eq(env(null, 'L:uparm', 0, 1).length, 0, 'no clip is a safe no-op');

// ---- the wiring is pinned ----
assert(/drag=\{ marq:true, slot, t0:t, sx:e\.clientX, sy:e\.clientY, moved:false, shift:e\.shiftKey,/.test(src),
  'an empty row spot arms a pending marquee instead of instantly scrubbing');
assert(/base:\(e\.shiftKey && slot===_aeSel\) \? _aeSelKeys\.slice\(\) : \[\]/.test(src),
  'shift keeps the existing selection as the base — the band adds to it');
assert(/_aeSelKeys=drag\.base\.concat\(_aeKeysInRange\(_aeClip, drag\.slot, drag\.t0, t\)/.test(src),
  'the selection updates live while the band sweeps');
assert(/if\(!drag\.moved && Math\.hypot\(e\.clientX-drag\.sx, e\.clientY-drag\.sy\)>4\)/.test(src),
  'a 4px threshold separates a click from a sweep');
assert(/if\(!drag\.moved\)\{   \/\/ a plain click: select the bone and jump the playhead \(pre-marquee behavior\)/.test(src),
  'a motionless click still selects the bone and jumps the playhead');
assert(/_aeMarq=\{ slot:drag\.slot, t0:drag\.t0, t1:t \};/.test(src) && /const mi=g\.rows\.indexOf\(_aeMarq\.slot\);/.test(src),
  'the band draws live on the dope sheet');
assert(/_aeMarq=null; _aeDrawTL\(\);/.test(src), 'release clears the band');
assert(/drag=\{ scrub:true \};   \/\/ the ruler stays a pure scrub zone/.test(src), 'ruler scrubbing is untouched');

done('build 1056: the viewport orbits with the drag, and a sweep of the dope sheet selects every key it touches');
