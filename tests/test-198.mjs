import { gameSource, assert, done } from './harness.mjs';
// build 288: the wheel must not cycle weapons while a prop is held — scroll adjusts hold distance only.
const src = gameSource();
// the weapon-cycle wheel listener should bail out when holding a prop, before calling cycleWeapon
const m = src.match(/if\(heldProp\) return;[^\n]*\n\s*if\(typeof buildMode[^\n]*\n\s*if\(gameOn && !shopOpen && !invOpen\) cycleWeapon/);   // build 929: the build-mode guard sits between (the wheel rotates the ghost there)
assert(m, 'weapon-cycle wheel handler must early-return when heldProp is set');
// the held-prop distance handler still exists and is unchanged
assert(/if\(heldProp\)\{ heldDist=Math\.max\(HOLD_MIN, Math\.min\(HOLD_MAX, heldDist - e\.deltaY\*0\.003\)\); \}/.test(src), 'hold-distance wheel handler intact');
done();
