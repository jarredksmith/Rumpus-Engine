// (build 932) "STILL NOT LETTING ME STACK" — the self-overlap veto padded the ghost box by the
// player's full body radius, so standing BESIDE the base block (as you naturally do to stack) put
// your shoulder inside the padded zone and vetoed every second-layer placement. The phase-out
// allowance the veto exists to prevent (insideSolid) only fires when the player's CENTRE column is
// inside a solid above STEP height — the veto now mirrors that exactly (centre in footprint +0.12
// margin, band feet+STEP..head). Grazing a shoulder is harmless: clearAt just blocks movement.
// Verified live: standing 0.9 to the side of the base block, the on-top ghost VALIDATES; a ghost
// enclosing the player's centre still refuses; occupied-cell and level-prop rules unchanged.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const val = extractFunction('_bmValidate', src);
assert(/lo=feet\+STEP, hi=feet\+effPlayerHeight\(\), M=0\.12/.test(val),
  'the veto uses the insideSolid band (feet+STEP..height) with a 0.12 margin, not the body radius');
assert(/player\.pos\.x>_bmBox\.min\.x-M && player\.pos\.x<_bmBox\.max\.x\+M/.test(val),
  'the CENTRE column decides, matching the phase-out mechanism exactly');
assert(!/player\.radius\+0\.05/.test(val), 'the radius-padded test is gone');

done('build 932: stack while standing next to the base block — only true centre embedding refuses');
