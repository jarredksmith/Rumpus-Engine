// (build 965) WEAPON DRAW + RELOAD RECOVERY. Firing was allowed the same frame as a weapon
// switch (no draw animation, no gate) and the reload pose snapped upright the instant the flag
// cleared — the first shot always landed while the gun was still visually down. Now: a switch
// arms a 300ms draw (the viewmodel visibly rises: +0.85 rot at full) and shoot() holds fire
// until it lands; the reload dip eases in AND back out (_rlP smoothed at dt*12) with fire held
// while _rlP>0.35. Hip fire and ADS stay instant by design. Verified LIVE headless: same-tick
// shot after a switch blocked, pose lifted (rot 0.85), fires after; _rlP=1 blocks, 0 fires.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

assert(/const DRAW_MS = 300;/.test(src) && /let _drawUntil = 0;/.test(src), 'draw state exists');
assert(/_drawUntil = performance\.now\(\) \+ DRAW_MS;/.test(src), 'switching arms the draw');
assert(/if\(now < _drawUntil\) return;/.test(src), 'the trigger is held while drawing');
assert(/if\(_rlP > 0\.35\) return;/.test(src), 'the trigger is held while recovering from a reload');
assert(/_rlP \+= \(\(reloading\?1:0\) - _rlP\) \* Math\.min\(1, dt\*12\);/.test(src), 'the reload dip eases both ways');
assert(/gun\.position\.y = move - recoil\*0\.5 \+ _rlP\*-0\.25/.test(src) && /gun\.rotation\.x = _rlP\*0\.5/.test(src),
  'the smoothed pose drives the viewmodel (no more snap)');
assert(/const _dw = Math\.max\(0, Math\.min\(1, \(_drawUntil - performance\.now\(\)\) \/ DRAW_MS\)\);/.test(src)
  && /gun\.position\.y -= _dw\*0\.45; gun\.rotation\.x \+= _dw\*0\.85;/.test(src),
  'the draw visibly raises the gun from a lowered pose');

done('build 965: the gun rises before it fires — draw gate + smooth reload recovery');
