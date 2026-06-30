import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// The physics world must keep stepping when the KCC is active, even with no dynamic props,
// or the controller's collision queries go stale and the player sinks through static-only levels.
assert(/if\(!dynamicProps\.length && !fragments\.length && !_corpses\.length && !\(playerPhysMode && playerBody\)\)\{ physAccum = 0; return; \}/.test(src), 'step loop runs for the character controller on static-only levels (build 779: also for ragdoll corpses)');
done('kcc-step-static');
