// (build 172) (1) The "E" activate prompt now measures 3D distance to the prop's mesh box (clamped in Y too),
// so a door one floor up no longer prompts from directly below it. (2) Moving/rotating platforms carry the
// player via the prop's full transform delta (so a pure-rotation trebuchet arm moves the player), and a fast
// surface (> XA_LAUNCH) flings the player off (extVel horizontally + an upward pop) — a working launcher.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// 1) proximity includes Y
const cp = extractFunction('checkProximity');
// build 1451: the clamp the four categories each computed separately is now ONE shared helper, called at
// most once per prop. All three assertions are about that clamp — a door one storey up must not prompt
// from the floor below — so they move to it, and the count is what proves every category shares it.
const idf = extractFunction('_interDist');
assert(/const cy = Math\.max\(b\.min\.y, Math\.min\(py, b\.max\.y\)\);/.test(idf), 'anim proximity clamps Y to the box');
assert(/return Math\.hypot\(px-cx, py-cy, pz-cz\);/.test(idf), 'anim proximity is 3D');
assert((cp.match(/_interDist\(o, ud/g) || []).length === 4,
  'xanim proximity clamps Y — all four categories share the one 3D clamp');

// 2) carry/launch
assert(/const XA_LAUNCH=9;/.test(src), 'launch speed threshold');
const xc = extractFunction('_xaCarry');
assert(/function _xaCarry\(o, b, prevP, prevQ, dt, peakSp\)/.test(src), 'carry takes the support box as a param (gates on where the player stood)');
assert(/_xaDelta\.multiplyMatrices\(_xaCur, _xaPrevM\.invert\(\)\)/.test(xc), 'carry uses the prop full-transform delta (handles rotation)');
assert(/if\(sp > XA_LAUNCH\)\{/.test(xc) && /player\.extVel\.x = \(_xaUp\.x\*sp \+ mvx\/dt\) \* LP;/.test(xc), 'fast surface flings forward along the tilting face normal');
assert(/\{ const kd = Math\.max\(0, 1 - \(player\.onGround \? 6 : 0\.6\)\*dt\)/.test(src), 'launch momentum carries through the air (slow airborne decay)');
assert(/player\.pos\.x\+=mvx; player\.pos\.y\+=mvy; player\.pos\.z\+=mvz;/.test(xc), 'slow surface carries (rides)');
// updateXAnim calls carry on rotation too
const ux = extractFunction('updateXAnim');
assert(/const turns=\(a\.rx\|\|a\.ry\|\|a\.rz\), scaled=\(a\.scx\|\|a\.scy\|\|a\.scz\);/.test(ux) && /if\(dx\|\|dy\|\|dz\|\|turns\|\|scaled\)\{/.test(ux), 'rotation- or scale-only props still drive the carry (build 714)');
assert(/_xaCarry\(o, _xaOldBox, _xaPrevP, _xaPrevQ, dt, _peakSp\)/.test(ux), 'carry gets the pre-rotation box + prev transform + dt');
done('proximity-Y + platform carry/launch');
