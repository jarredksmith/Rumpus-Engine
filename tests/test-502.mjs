import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 652: "Player" is its own editor area. The player avatar + the player-start point (target tabs) and the
// character roster (section) were buried in Build mode next to boxes and lights; they now have their own mode.

// --- the new mode is registered everywhere a mode must be ---
assert(/const EDITOR_MODES = \['build','scene','player','enemies','rules','kit','hud','files'\];/.test(src), 'player is a top-level mode (after World)');
assert(/player:'Player'/.test(src), 'it has a user-facing label');
assert(/player:'#[0-9a-fA-F]{6}'/.test(src), 'it has a distinct accent colour');
assert(/MODE_ICON = \{[\s\S]*?player:\s*_svgIcon/.test(src), 'it has a mode icon');
assert(/MODE_HINT = \{[\s\S]*?player:\s*'Who you play/.test(src), 'it has a mode-aware hint');

// --- it owns the player avatar + start tabs, and the character roster section ---
assert(/player:\s*\['player','pstart'\]/.test(src), 'MODE_TARGETS.player = avatar + start');
assert(/player:\s*\['gizmo','object','transform','characters'\]/.test(src), 'MODE_SECTIONS.player carries the roster + transform tooling');

// --- and they are no longer in Build ---
assert(/build:   \['props','lights','station','extract','turrets'\]/.test(src), 'Build no longer lists player/pstart targets');
assert(/build:\s*\['gizmo','object','material','transform','prefabs'\]/.test(src), 'Build no longer lists the characters section');

// --- the roster section itself is unchanged, just reassigned ---
assert(/sec\('Characters', 'characters'/.test(src), 'the Characters section still exists');

done('build 652: Player is its own editor area');
