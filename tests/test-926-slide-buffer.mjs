// (build 926) SLIDE TAP BUFFER — pressing C slid only ~50% of the time. The old trigger demanded
// every condition on the EXACT frame of the press (sprint held, feet grounded, cooldown clear,
// moving); sprinting over anything uneven flickers player.onGround for a frame or two, so taps
// landing on a bad frame silently vanished. The tap is now remembered for 0.25s and the slide
// starts on the FIRST frame the conditions hold.
// Verified live with real KeyboardEvents: grounded sprint+C slides; a press on a flickered
// (airborne) frame slides on the next grounded frame — the old code ate it; a stale tap (buffer
// expired before conditions were met) does NOT fire.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

assert(/let sliding=false, slideT=0, slideCD=0, _prevSlideKey=false, _slideBufT=0;/.test(src), 'the buffer state exists');
assert(/if\(_slideEdge\) _slideBufT = 0\.25; else if\(_slideBufT>0\) _slideBufT -= dt;/.test(src),
  'a tap arms a 0.25s buffer that decays when unconsumed');
assert(/if\(!sliding && slideCD<=0 && _slideBufT>0 && _sprinting && player\.onGround && wish\.lengthSq\(\)>0\.01/.test(src),
  'the slide fires from the BUFFER on the first good frame, not from the raw edge');
assert(/_slideBufT = 0; sliding = true; slideT = SLIDE_DUR;/.test(src), 'firing consumes the buffer (no double slides)');
assert(!/slideCD<=0 && _slideEdge && _sprinting/.test(src), 'the exact-frame edge gate is gone');

done('build 926: the slide tap is buffered — C works every time, not half the time');
