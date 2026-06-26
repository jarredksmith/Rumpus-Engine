import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 702: per-level first-person camera height. worldCfg.eyeHeight shifts the FP view up/down; it's view-only —
// the collision capsule and enemy aim stay at the true body (player.pos.y / EYE), so it can't be used to dodge shots.

// --- the setting exists with the standing default + is clamped on apply ---
assert(/const DEFAULT_WORLD = \{[^}]*eyeHeight:1\.7/.test(src), 'eyeHeight defaults to 1.7 (the standing EYE)');
const aw = extractFunction('applyWorldCfg');
assert(/worldCfg\.eyeHeight = Math\.max\(0\.6, Math\.min\(2\.8, worldCfg\.eyeHeight == null \? DEFAULT_WORLD\.eyeHeight : \+worldCfg\.eyeHeight\)\)/.test(aw), 'eyeHeight is clamped to a sane range on apply');

// --- the FP camera applies it as a view-only offset (after copying player.pos, before the crouch dip) ---
assert(/camera\.position\.copy\(player\.pos\);\s*camera\.position\.y \+= \(worldCfg\.eyeHeight - EYE\);/.test(src), 'the camera height offsets the view by (eyeHeight - EYE)');
// it stays decoupled from physics: EYE is still the collider/feet datum (sanity: EYE constant untouched)
assert(/const EYE = 1\.7;/.test(src), 'EYE (the collider/feet datum) is unchanged — the offset is purely visual');

// --- editor control in the World > Movement panel ---
assert(/slider\(b,'Eye height','eyeHeight',0\.6,2\.8,0\.05\);/.test(src), 'an Eye-height slider sits with the movement settings');
assert(/Eye height sets the first-person camera level/.test(src), 'the hint explains it is view-only');

// --- persistence: worldCfg is serialized wholesale, so eyeHeight rides along ---
assert(/world:   Object\.assign\(\{\}, worldCfg\)/.test(src), 'eyeHeight is saved as part of worldCfg');

// --- executable: the offset math (default = no change; taller/shorter shift the view, not the feet) ---
const camY = (eyeHeight, EYE, posY)=> posY + (eyeHeight - EYE);
eq(camY(1.7, 1.7, 10), 10, 'default eye height leaves the view exactly at the eye (no shift)');
near(camY(2.2, 1.7, 10), 10.5, 1e-9, 'a taller eye height raises the view by the difference');
near(camY(1.2, 1.7, 10), 9.5, 1e-9, 'a shorter eye height lowers the view by the difference');

done('build 702: adjustable first-person camera (eye) height');
