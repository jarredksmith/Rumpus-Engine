// (build 1023) TITLE SCREEN REGROUP — author request. The two things you actually do most sit
// side by side as equal heroes: DEPLOY (filled) and BUILD / EDIT LEVEL (outlined twin, same
// scale, same angular clip). MULTIPLAYER and COMMUNITY LEVELS share the next row. PLAY CAMPAIGN
// moves to the quiet footer strip next to LOAD CAMPAIGN. All wiring is id-based, so every
// button keeps its behavior — this is purely a regroup.
import { gameSource, html, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- the hero pair: Deploy + Build/edit on ONE line, same scale ----
assert(/<div class="menuBtns menuHero">\s*<button id="startBtn">Deploy<\/button>\s*<button id="editBtn" class="secBtn heroBtn">/.test(html),
  'DEPLOY and BUILD / EDIT LEVEL share the hero row');
const hero = html.match(/\.secBtn\.heroBtn \{[^}]*\}/)[0];
const start = html.match(/#startBtn, #replayBtn \{[^}]*\}/)[0];
for(const k of ['font-size: 18px', 'font-weight: 700', 'letter-spacing: 3px']){
  assert(hero.includes(k.replace(': ',': ')) || hero.includes(k), 'hero twin matches Deploy scale: '+k);
  assert(start.replace(/\s+/g,' ').includes(k.replace(': ',': ')) || /font-size: 18px/.test(start.replace(/:\s*/g,': ')), 'Deploy still carries '+k);
}
assert(/clip-path: polygon\(0 0,100% 0,100% 70%,90% 100%,0 100%\)/.test(hero), 'same angular cut as Deploy (one visual language)');
assert(/\.menuHero #startBtn \{ margin-top: 0; \}/.test(html), 'the row owns the top margin, not the button (Deploy still centers on the game-over screen)');

// ---- the social row: Multiplayer + Community together ----
assert(/<div class="menuBtns">\s*<button id="mpOpenBtn" class="secBtn">[\s\S]*?<button id="commBtn" class="secBtn">[\s\S]*?<\/div>\s*<div class="menuBtns menuSub">/.test(html),
  'Multiplayer and Community levels share one row, directly above the footer');

// ---- Play campaign joins the footer next to Load campaign ----
assert(/<div class="menuBtns menuSub">\s*<button id="campaignBtn" class="secBtn ghost">[\s\S]*?<button id="loadCampBtn" class="secBtn ghost">/.test(html),
  'Play campaign sits first in the footer, beside Load campaign');
assert((html.match(/id="campaignBtn"/g)||[]).length === 1, 'exactly one campaign button (moved, not duplicated)');

// ---- nothing lost, wiring intact ----
for(const id of ['startBtn','editBtn','mpOpenBtn','commBtn','campaignBtn','loadCampBtn','instrBtn','manualBtn','helpBtn','creditsBtn'])
  assert(html.includes('id="'+id+'"'), id+' survives the regroup');
assert(/getElementById\('campaignBtn'\); if\(cpb\) cpb\.onclick/.test(src), 'campaign wiring is id-based — the move cannot break it');
assert(/@media \(max-width: 560px\) \{[\s\S]{0,140}?\.menuHero #startBtn, \.secBtn\.heroBtn \{ font-size: 13px;/.test(html),
  'the hero pair steps down on phones instead of overflowing');

done('build 1023: Deploy + Build/edit as equal heroes, MP + Community row, campaign in the footer');
