// (build 940) TWO DEVICE-PARITY GAPS from live testing:
// MOBILE SLIDE — _slideKey = keys[BINDS.slide]||padCrouch: touch had NO input that could ever feed
// the slide. Tapping the on-screen CROUCH button at a sprint now feeds the same 0.25s tap-buffer as
// the C key (the buffer's sprint/grounded/moving gate does the rest); a standing tap keeps the
// crouch toggle, so crouch-walking is unchanged.
// CONTROLLER "can't drop/place a picked up item" — the physics carry verified green on pad in solo
// AND as an MP client (Y grab/drop, RT throw, host releases, prop falls); the real gap was the
// INVENTORY: picked-up ITEMS are used/placed through the bag + inspector buttons ("Use — hold &
// place"), and no controller could click them. The build-911 focus navigator now serves both
// surfaces, and the bag/inspector close X carries data-close so B backs out.
// Verified live: touch sprint-tap slid without toggling crouch, standing tap toggled crouch; pad
// D-pad-up opened the bag, the ring walked X -> item cell, A opened the inspector, A on
// "Use — +25 HP" healed 50->75 and consumed the item, B+B backed out to the game.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// touch slide
assert(/if\(typeof sprinting==='function' && sprinting\(\) && !touchCrouch && typeof _slideBufT!=='undefined'\)\{ _slideBufT=0\.25; \}/.test(src),
  'tapping CROUCH at a sprint feeds the slide tap-buffer (mobile finally slides)');
assert(/else \{ touchCrouch=!touchCrouch; cb\.classList\.toggle\('on', touchCrouch\); \}/.test(src),
  'a standing tap keeps the crouch toggle');

// pad-navigable bag + inspector
const surf = extractFunction('_padNavSurface', src);
assert(/getElementById\('inspect'\)/.test(surf) && /insp\.querySelector\('#inspectCard'\)/.test(surf),
  'the item inspector is a navigator surface (topmost)');
assert(/getElementById\('inventory'\)/.test(surf), 'the inventory grid is a navigator surface');
assert(/if\(typeof invOpen!=='undefined' && invOpen\)\{ _padMenuNavTick\(bt, ax, edge9\);/.test(extractFunction('pollGamepad', src)),
  'while the bag is open the navigator owns the pad (stick/D-pad focus, A uses, B backs out)');
assert(/b\.dataset\.close='1';/.test(extractFunction('_invCloseX', src)),
  "the bag/inspector close X carries data-close, so the navigator's B finds it");

done('build 940: mobile slides (CROUCH tap at a sprint) and a controller can use/place/inspect inventory items');
