// (build 915) SNIPER SCOPE BURIED THE TOUCH CONTROLS — the touch cluster lives inside #hud, a
// z-index-10 stacking context, so the body-level scope overlay (z-14) painted over FIRE/AIM/stick
// no matter their own z-40 (z-index cannot escape a stacking context). On phones the sniper scope
// left no way to fire or unscope. The overlay now mounts INSIDE #hud: the flat HUD panels (z-auto)
// stay hidden beneath it for scope immersion, while the touch cluster (z-40) rises above. Verified
// live on a touch profile: while scoped, FIRE/AIM/JUMP/stick all paint over the vignette.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const fn = extractFunction('_setScopeOverlay', src);
assert(/\(document\.getElementById\('hud'\)\|\|document\.body\)\.appendChild\(el\)/.test(fn),
  'the scope overlay mounts inside #hud (same stacking context as the touch controls)');
assert(!/^\s*document\.body\.appendChild\(el\)/m.test(fn), 'no body-level mount remains');
assert(/z-index:14/.test(fn), 'overlay z sits between the flat panels (auto) and the touch cluster (40)');

done('build 915: scoped snipers on touch keep FIRE, AIM and the stick');
