import { gameSource, extractFunction, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const page = readFileSync(new URL('../breach.html', import.meta.url), 'utf8');
// build 369: toggle-sprint mode — a workaround for keyboards that ghost W+Shift+Space (jump fails only
// while running FORWARD). Tap Shift to lock running, so you hold just W+Space (no third key) to jump.

// executable: sprinting() resolves correctly in each mode
const fn0 = new Function('padSprint','touchSprint','_sprintMode','_sprintToggled','keys','BINDS',
  extractFunction('sprinting') + '\nreturn sprinting;');
const BINDS={ sprint:'ShiftLeft' };   // build 910: sprinting() reads the bind map
const fn = (a,b,c,d,k)=>fn0(a,b,c,d,k,BINDS);
const S = (mode, toggled, shift) => fn(false, false, mode, toggled, shift?{ShiftLeft:true}:{})();   // build+call
assert(S('hold', false, true) === true && S('hold', false, false) === false, 'hold mode tracks the Shift key');
assert(S('toggle', true, false) === true && S('toggle', false, true) === false, 'toggle mode tracks the latch, ignores held Shift');
assert(fn(true, false, 'hold', false, {})() === true, 'gamepad sprint always wins');
assert(fn(false, true, 'toggle', false, {})() === true, 'touch sprint always wins');

// both speed + slide reads go through sprinting()
assert(/let speedBase = sprinting\(\) \? SPEED\*SPRINT : SPEED;/.test(src), 'move speed uses sprinting()');
assert(/const _sprinting = sprinting\(\);/.test(src), 'slide eligibility uses sprinting()');

// the latch flips on a Shift tap only in toggle mode, and clears when input is wiped
assert(/if\(_sprintMode==='toggle' && \(e\.code==='ShiftLeft'\|\|e\.code==='ShiftRight'\) && !e\.repeat\)\{ _sprintToggled = !_sprintToggled; \}/.test(src), 'Shift tap toggles the latch (toggle mode only)');
assert(/function clearMovementInput\(\)\{\s*_sprintToggled=false;/.test(src), 'latch clears on a full input wipe');

// persisted + exposed in the pause menu
assert(/localStorage\.getItem\('breach_sprint_mode'\)/.test(src) && /localStorage\.setItem\('breach_sprint_mode', _sprintMode\)/.test(src), 'sprint mode persists');
assert(/<button id="pauseSprintMode" class="pBtnGhost">Sprint: Hold<\/button>/.test(page), 'pause menu exposes the sprint-mode toggle');
done();
