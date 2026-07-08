import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 517: jumps are edge-triggered (a fresh press) and rate-limited by JUMP_CD, so holding the key can
// no longer bunny-hop the instant you land.
assert(/const JUMP_CD=0\.5;/.test(src), 'a jump cooldown constant exists');
assert(/let _jumpHeldPrev=false;/.test(src), 'jump tracks the previous held state for edge detection');
assert(/const _jHeld = !!\(keys\[BINDS\.jump\]\|\|padJump\);/.test(src), 'held jump inputs are read (jump bind, build 910)');
assert(/const _jPressed = \(_jHeld && !_jumpHeldPrev\) \|\| touchJump;/.test(src), 'jump fires on a rising edge (or the touch pulse), not while simply held');
assert(/if\(!_ledge && _jPressed && player\.onGround && \(player\.jumpCd\|\|0\)<=0[\s\S]*?player\.jumpCd=JUMP_CD;/.test(src), 'jump requires the cooldown to be clear and re-arms it');
assert(/if\(player\.jumpCd>0\) player\.jumpCd-=dt;/.test(src), 'the cooldown ticks down each frame');
assert(/_jumpHeldPrev = _jHeld;/.test(src), 'the held state is stored for next frame');

// regression: jump no longer fires straight from a held key
assert(!/if\(\(keys\['Space'\]\|\|padJump\|\|touchJump\) && player\.onGround/.test(src), 'the old hold-to-repeat jump is gone');

done();
