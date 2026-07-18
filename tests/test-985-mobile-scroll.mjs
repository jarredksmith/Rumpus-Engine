// (build 985) MOBILE EDITOR SCROLL + FIRST-RUN MODAL REMOVED.
// The 982 Blender rail nested a flex-scroll inside the panel (#editor overflow:hidden, #edMain
// overflow-y:auto). On phones the inner column never got a bounded height, so it grew to fit its
// content and had nothing to scroll — half the panel was unreachable. Build 985 makes the PANEL
// itself the native scroll container again (proven touch-safe pre-982) and pins the rail + header
// with position:sticky so they never scroll away. Also: the first-run instructions modal is gone.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

// ---- the panel scrolls natively (touch-safe), not a clipped flex shell ----
assert(/#editor \{[^}]*display: block; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;/.test(html),
  'the panel is the native scroll container with momentum + contained overscroll');
assert(!/#editor \{[^}]*overflow: hidden;/.test(html), 'the panel no longer clips its own overflow (that stranded the content on mobile)');
assert(/#editor \{[^}]*height: 100dvh; max-height: 100dvh;/.test(html), 'the panel is bounded to the dynamic viewport height');

// ---- the header + rail are pinned with sticky so they survive the scroll ----
assert(/#editor #edTopBar \{ position: sticky; top: 0; z-index: 3;/.test(html), 'the header stays pinned at the top while the panel scrolls');
assert(/#edModes\.edModes \{ position: sticky; top: 46px;[^}]*z-index: 2;/.test(html), 'the mode rail is pinned below the header (never scrolls away)');
assert(/#edModes\.edModes \{[^}]*max-height: calc\(100dvh - 46px\); overflow-y: auto;/.test(html), 'the rail scrolls internally if the 8 tabs ever exceed the viewport');

// ---- #edMain no longer owns a scroll (the panel does) + has bottom clearance for browser chrome ----
assert(/#edMain \{ flex: 1 1 auto; min-width: 0; padding: 8px 12px 40px; \}/.test(html),
  'the content column has no own scroll and pads the bottom so the last row clears mobile chrome');

// ---- the first-run instructions modal is removed (standard controls) ----
assert(/try\{ localStorage\.setItem\('breach_seen','1'\); \}catch\(e\)\{\}/.test(src),
  'boot writes the seen flag but opens no modal');
assert(!/!localStorage\.getItem\('breach_seen'\) && !_sharedArrival/.test(src),
  'the old first-run auto-open condition is gone');
assert(!/const _sharedArrival =/.test(src), 'the _sharedArrival guard (only needed by the auto-open) is gone too');
// the modal markup + the manual Instructions button both remain — only the auto-open was dropped
assert(/ib\.onclick=\(\)=>\{ syncInstrControls\(\); openModal\('instrModal'\); \};/.test(src),
  'Menu > Instructions still opens the modal on demand');

done('build 985: native panel scroll (mobile fix) + first-run modal removed');
