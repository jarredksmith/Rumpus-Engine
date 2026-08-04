import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 506: in-game menus fit landscape / small screens, and the MP kill list is movable + sizable.
// Menus: .pauseCard and #shop now cap height + scroll (the .modalCard family already did), plus a
// short-viewport media query compacts everything. Scoreboard: added to HUD_EDITABLE, capped on touch, and
// the MP match menu gains a "Customize controls" entry (touch) so players can actually reach the editor.

// ---- menus cap height + scroll so options can't be cut off in landscape ----
// build 1375 moved the SCROLL one level down: the card caps height and CLIPS, and the tab body
// (#pauseBody) scrolls inside it, so the footer (Resume / Exit) can never sit below a fold. The
// intent — options are never cut off in landscape — is unchanged; only the scrolling element moved.
{ const pc = html.match(/#pauseMenu \.pauseCard \{([\s\S]*?)\n  \}/);
  assert(pc && /box-shadow:0 20px 60px rgba\(0,0,0,\.5\);/.test(pc[1])
            && /max-height:calc\(88vh \/ var\(--uiS,1\)\); max-height:calc\(\(100dvh - 24px\) \/ var\(--uiS,1\)\); overflow:hidden;/.test(pc[1]),
    'the pause card caps height (the tab body scrolls inside it since build 1375)');
  assert(/#pauseBody \{[^}]*overflow-y:auto/.test(html), 'the pause tab body is the scrolling element'); }
assert(/z-index:72; max-height:92vh; max-height:calc\(100dvh - 16px\); overflow-y:auto;/.test(html), 'the shop caps height and scrolls');
assert(/@media \(max-height:560px\)\{[\s\S]*?#pauseMenu \.pauseCard\{ padding:14px 24px/.test(html), 'a short-viewport media query compacts the menus');
assert(/max-height:86vh; overflow:auto;/.test(html), 'the shared modal cards already scroll (unchanged)');

// ---- the MP kill list is constrained on touch and editable ----
assert(/body\.touch #scoreboard \{[^}]*max-width:46vw; max-height:40vh; overflow:hidden;/.test(html), 'the touch scoreboard is size-capped so a long roster cannot blanket the screen');
assert(/const HUD_EDITABLE = \['stats','ammoPanel','minimap','score','scoreboard','wavePanel','roomBadge'\]/.test(src), 'the scoreboard is now a movable/sizable HUD element (banner + badge joined in build 913)');

// ---- and the editor is reachable from the MP match menu on touch ----
assert(/if\(isTouch\) mk\('[\s\S]*?Customize controls',[\s\S]*?closeMatchMenu\(\); if\(typeof enterTouchEdit==='function'\) enterTouchEdit\(\)/.test(src),
  'the MP match menu offers Customize controls on touch, opening the HUD editor');

// ---- applyTouchLayout already handles any editable id generically (so scoreboard just works) ----
assert(/for\(const id of ALL_EDITABLE\)\{ const el=document\.getElementById\(id\); if\(!el\) continue; const o=touchLayout\[id\]\|\|\{\};/.test(src),
  'the layout engine positions every editable id generically (no per-element wiring needed)');

done();
