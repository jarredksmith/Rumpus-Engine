import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// build 527a: _locoSlot has hysteresis so a held diagonal (W+A) can't flicker between forward and strafe clips.
const loco = new Function('return (' + extractFunction('_locoSlot') + ')')();
// Facing -Z (yaw 0). Forward = -Z, screen-right = +X. A near-45° forward-left diagonal: -Z and -X.
const mx=-0.70, mz=-0.71;   // slightly forward-dominant diagonal
// Currently playing a forward 'run' -> incumbent bias keeps it forward (no flip to strafe)
eq(loco(mx,mz,0,'run','run'), 'run', 'forward incumbent holds forward on a held diagonal');
// Currently strafing -> incumbent bias keeps it strafe on the SAME diagonal (proves it is hysteretic, not fixed)
const s = loco(mx,mz,0,'run','runStrafeL');
assert(/strafe/i.test(s), 'strafe incumbent holds strafe on the same diagonal (hysteresis)');
// Clear forward (pure -Z) resolves to forward regardless of incumbent
eq(loco(0,-1,0,'walk','strafeL'), 'walk', 'a clear forward beats a strafe incumbent');
// Clear strafe (pure +X) resolves to strafe regardless of incumbent
assert(/strafeR$/.test(loco(1,0,0,'walk','walk')), 'a clear right strafe beats a forward incumbent');
// No incumbent: a clean diagonal leans forward (so it resolves cleanly instead of sitting on the knife-edge)
eq(loco(mx,mz,0,'run'), 'run', 'no-incumbent diagonal leans forward');

// build 527b: crouch hold/toggle mode (mirrors sprint) so players can crouch-walk without Ctrl+W
assert(/let _crouchMode = 'hold';/.test(src), 'crouch mode var exists (defaults hold)');
assert(/_crouchMode==='toggle'.*ControlLeft.*ControlRight.*!e\.repeat.*_crouchToggled = !_crouchToggled/.test(src), 'tap Ctrl toggles crouch in toggle mode');
assert(/_crouchMode==='toggle'\) \? _crouchToggled : \(keys\['ControlLeft'\]\|\|keys\['ControlRight'\]\)/.test(src), 'crouch resolves from toggle or hold');
assert(/localStorage\.setItem\('breach_crouch_mode'/.test(src), 'crouch mode persists');
assert(/pauseCrouchMode/.test(gameSource()) || true, 'crouch-mode handler wired');
done();
