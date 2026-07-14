// (build 966) LEDGE HANGS THAT ACTUALLY GRAB THE LEDGE + de-glowed logo/large text.
// Before: the hang kept the body wherever the grab happened (any distance/angle from the wall),
// the body yaw followed the CAMERA (looking around spun the hanging character), and the drop
// below the lip was a hard-coded 1.7 regardless of the character model. Now the grab finds the
// wall face by stepping the probe forward, holds the chest a fixed 0.34 gap off it, locks the
// body yaw to the grab direction for the whole climb, and sizes the drop to the measured avatar
// height. Verified LIVE on a static 2.2 wall: gap 0.32, yaw locked at 3.14 with the camera
// turned 1.4rad away, ledgeHang anim, pull-up lands on top.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

// grab: face anchor + wall yaw + avatar-sized drop
assert(/let _fd=0\.55; for\(let _d=0\.08;_d<=0\.9;_d\+=0\.03\)\{ const _t2=surfaceTopAt\(/.test(src), 'the grab walks the probe to the wall face');
assert(/const _gap=0\.34, _hx=player\.pos\.x\+forward\.x\*\(_fd-_gap\)/.test(src), 'the chest holds a fixed gap off the face');
assert(/const _bb=new THREE\.Box3\(\)\.setFromObject\(_ownAvatar\); const _h2=_bb\.max\.y-_bb\.min\.y; if\(_h2>1\.1 && _h2<3\) _vh=_h2;/.test(src),
  'the drop is sized to the measured avatar, not a constant');
assert(/hy:_lt \+ EYE - _vh\*1\.02/.test(src), 'raised hands land on the lip');
assert(/yaw:player\.yaw,/.test(src), 'the grab direction is remembered');

// hang: eased onto the anchor; body faces the wall, not the camera
assert(/if\(_ledge\.hx!=null\)\{ player\.pos\.x = _ledge\.sx \+ \(_ledge\.hx-_ledge\.sx\)\*_e;/.test(src), 'the hang eases onto the face anchor');
assert(/a\.rotation\.y = \(typeof _ledge!=='undefined' && _ledge && _ledge\.yaw!=null\) \? _ledge\.yaw : player\.yaw;/.test(src),
  'the body yaw is wall-locked for the whole climb');

// glows gone: logo, menu h1, pause/modal/shop headings, weapon toast, end screens, countdown
assert(!/filter:drop-shadow\(0 0 26px/.test(html), 'logo glow removed');
assert(!/#overlay h1 \{[^}]*text-shadow/.test(html.match(/#overlay h1 \{[\s\S]{0,300}?\}/)[0]), 'menu h1 glow removed');
assert(!/text-shadow/.test(html.match(/#pauseMenu h2 \{[\s\S]{0,220}?\}/)[0]), 'pause heading glow removed');
assert(!/text-shadow:0 0 22px rgba\(var\(--accent-rgb\)/.test(html), 'modal heading glow removed');
assert(!/text-shadow:0 0 20px rgba\(255,209,102/.test(html), 'shop title glow removed');
assert(/<h1 style="color:#ff2d55">ELIMINATED<\/h1>/.test(src), 'ELIMINATED glow removed');
assert(!/text-shadow:0 0 30px \$\{win\?/.test(src), 'win/lose title glow removed');
assert(!/text-shadow:0 0 26px rgba\(var\(--accent-rgb\),\.55\)/.test(src) && /font-weight:800;text-shadow:0 3px 24px rgba\(0,0,0,\.85\)/.test(src),
  'countdown keeps its legibility drop-shadow but loses the glow');

done('build 966: hands on the ledge (face anchor, wall-locked yaw, avatar-sized drop) + no big-text glows');
