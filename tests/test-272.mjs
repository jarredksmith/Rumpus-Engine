import { gameSource, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const page = readFileSync(new URL('../breach.html', import.meta.url), 'utf8');
// build 377: crouch and slide are on separate keys. Ctrl = crouch (hold), C = slide (tap while sprinting).
// They used to share Ctrl||C, so either key did both and they fought.

// crouch reads Ctrl (+ gamepad), NOT C
assert(/_crouchMode==='toggle'\) \? _crouchToggled : \(keys\[BINDS\.crouch\]\|\|\(BINDS\.crouch==='ControlLeft'&&keys\['ControlRight'\]\)\)\) \|\| padCrouch \|\| touchCrouch;/.test(src), 'crouch resolves from the crouch bind (Ctrl default, R-Ctrl alias) OR toggle (or gamepad/touch — builds 908/910), not C (build 527)');
assert(!/let _wantCrouch = \([^;]*KeyC/.test(src), 'C no longer triggers crouch');

// slide reads C (+ gamepad), NOT Ctrl
assert(/const _slideKey = \(keys\[BINDS\.slide\]\|\|padCrouch\);/.test(src) && /slide:'KeyC'/.test(src), 'slide is C (rebindable; or gamepad), not Ctrl');
assert(!/const _slideKey = \([^;]*ControlLeft/.test(src), 'Ctrl no longer triggers slide');

// slide is still an edge (tap), still gated on sprint + grounded + moving
assert(/const _slideEdge = _slideKey && !_prevSlideKey; _prevSlideKey = _slideKey;/.test(src), 'slide is edge-detected off the C key');
assert(/if\(!sliding && slideCD<=0 && _slideBufT>0 && _sprinting && player\.onGround && wish\.lengthSq\(\)>0\.01/.test(src), 'slide still requires sprint + grounded + moving (build 926: fired from the buffered tap)');

// the on-screen legend reflects the split
assert(/<b>CTRL<\/b> crouch/.test(page) && /<b>SPRINT\+C<\/b> slide/.test(page), 'controls legend shows Ctrl crouch + Sprint+C slide');
done();
