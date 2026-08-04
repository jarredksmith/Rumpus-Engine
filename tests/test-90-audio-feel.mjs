// (builds 132-133) Audio/feel pass: a slide whoosh (filtered-noise downward sweep) plays on slide start,
// and footsteps tick while running on the ground, paced by speed (silent mid-air or while sliding).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// slide whoosh
assert(/slide\(\)\{ if\(!actx\|\|!sfxBus\) return;/.test(src) && /filt\.frequency\.exponentialRampToValueAtTime\(320,t\+dur\)/.test(src), 'SFX.slide is a downward whoosh');
assert(/step\(\)\{ const f=\[420,520,640\]/.test(src) && /noise\(\{dur:0\.06, vol:0\.07\*/.test(src), 'SFX.step exists (soft tap — rotating variants since 1363, base vol 0.07)');
assert(/slideDir\.copy\(wish\)\.normalize\(\); SFX\.slide\(\);/.test(src), 'whoosh plays when a slide starts');

// footstep cadence
assert(/let _stepT=0;/.test(src), 'footstep timer state');
assert(/if\(gameOn && player\.onGround && !sliding\)\{/.test(src), 'steps only while grounded and not sliding');
assert(/if\(_stepT <= 0\)\{ SFX\.step\(\); _stepT = Math\.max\(0\.26, 3\.2 \/ Math\.max\(1, hspd\)\); \}/.test(src), 'cadence scales with speed');
done('audio feel');
