import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 511: the wave-upgrade cards and the mobile action buttons use outlined SVG icons (editor-tab style,
// 24x24 currentColor stroke) instead of emoji, which render inconsistently across devices.

// ---- a gameplay icon set in the editor-tab language ----
assert(/const GAME_ICON = \(\(\)=>\{[\s\S]*?viewBox="0 0 24 24" fill="none" stroke="currentColor"/.test(src), 'GAME_ICON builds outlined currentColor SVGs');
for(const k of ['dmg','rof','hp','speed','leech','coin','regen','nade','weapon','reload'])
  assert(new RegExp(k+':\\s*s\\(').test(src), 'GAME_ICON defines '+k);

// ---- the 8 upgrades reference SVG icons, no emoji ----
assert(/icon:GAME_ICON\.dmg/.test(src) && /icon:GAME_ICON\.nade/.test(src), 'upgrades use SVG icons');
assert(!/icon:'[^']*[\uD800-\uDBFF]/.test(src), 'no surrogate-pair emoji left in any upgrade icon');
assert(/c\.innerHTML = '<div class="upIcon">'\+u\.icon/.test(src), 'the upgrade card renders the icon in a sized SVG container');

// ---- mobile action buttons get clean icons; no emoji glyph in the static markup ----
assert(/_b\('tNade', GAME_ICON\.nade\); _b\('tWeapon', GAME_ICON\.weapon\); _b\('tReload', GAME_ICON\.reload\);/.test(src),
  'grenade / weapon-swap / reload buttons are populated with SVG icons');
assert(/<button class="tBtn" id="tNade"[^>]*><\/button>/.test(html) && /<button class="tBtn" id="tWeapon"[^>]*><\/button>/.test(html),
  'the static touch buttons no longer carry an emoji glyph');

// ---- the icons are sized by CSS in both contexts ----
assert(/\.tBtn svg \{ width:48%; height:48%; display:block; \}/.test(html), 'touch-button icons are sized');
assert(/#upgrade \.upIcon svg \{ width:100%; height:100%; \}/.test(html), 'upgrade-card icons are sized');

done();
