import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 516: player-facing pictographic emoji replaced with outlined SVG icons (editor-tab style) so the
// main menu, multiplayer modal, pause/settings, boss bar, and challenge button render consistently across
// devices. Crisp monochrome symbols (checks, arrows, star, music note) are kept; the level editor's
// creator-facing glyphs are a separate follow-up.

// ---- a sized inline-icon class + a JS icon set for dynamic labels ----
assert(/\.eico \{ width:1\.05em; height:1\.05em;/.test(html), 'an inline-icon sizing class exists');
assert(/const UI_ICON = \(\(\)=>\{[\s\S]*?gamepad:s\([\s\S]*?fullscreen:s\([\s\S]*?trophy:s\(/.test(src), 'UI_ICON provides the JS-set icons');

// ---- the player-facing emoji are gone, replaced by eico SVGs ----
for(const e of ['🎖','🌐','🛠','📂','❔','📖','🤝','⚔','🟥','🟦','🔊','🔫','🎨','🔤','🅰'])
  assert(!html.includes(e), 'menu/MP/pause emoji removed: '+e);
assert(!/🎯 FREE-FOR-ALL/.test(html), 'FFA title no longer uses an emoji');
assert(!/☠ BOSS<\/div>/.test(html), 'boss bar no longer uses an emoji');

// ---- representative buttons/labels now carry an eico SVG ----
assert(/id="campaignBtn" class="secBtn"><svg class="eico"[^>]*>[\s\S]*?<\/svg>Play campaign/.test(html), 'campaign button has an icon');
assert(/data-pane="ffa"/.test(html) && /id="mpFFA"/.test(html), 'FFA lives in its mode pane (build 900: one host section, mode tabs)');
assert(/<label class="paLbl"><svg class="eico"[^>]*>[\s\S]*?<\/svg>Master/.test(html), 'the Master volume label has an icon');
assert(/<div id="bossBarName"><svg class="eico"/.test(html), 'the boss bar has an icon');

// ---- JS-set labels use the icon set ----
assert(/cb\.innerHTML=UI_ICON\.gamepad \+ 'Controls: '/.test(src), 'the Controls button label uses the gamepad icon');
assert(/b\.innerHTML = UI_ICON\.fullscreen \+ \(fsElement\(\)/.test(src), 'the Fullscreen button uses the fullscreen icon');
assert(/cb\.innerHTML=UI_ICON\.trophy\+'Challenge a friend'/.test(src), 'the challenge button uses the trophy icon');

done();
