// (build 1000) AAA CHARACTER SELECT. The small thumbnail modal became a full-screen select in the
// reference style: a LARGE live 3D model preview (slow turntable, drag to rotate, plays the
// model's idle clip when it ships one), display-type name, a horizontal card strip (roster
// characters + colors), and a SELECT bar. Touch/mouse/keyboard. Verified live in the browser
// harness (opens full-screen from the menu button, cards render, arrow-keys browse, Esc closes).
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- the layer + its art direction ----
assert(/#charSelect \{ position:fixed; inset:0; z-index:90; display:none; flex-direction:column;/.test(html),
  'a full-screen layer replaces the small modal');
assert(/#csName \{ font-family:var\(--display-font\); font-size:clamp\(26px,5vw,44px\);/.test(html),
  'the character name is big display type (responsive clamp)');
assert(/#csCards \{ display:flex; gap:10px; overflow-x:auto;/.test(html) && /-webkit-overflow-scrolling:touch;/.test(html),
  'a horizontal card strip, touch-scrollable');
assert(/\.csCard\.sel \{ border-color:var\(--accent\); box-shadow:0 0 14px rgba\(var\(--accent-rgb\),\.35\); \}/.test(html),
  'the selected card glows in the RUMPUS accent (reference layout, our identity)');
assert(/#csBar \{[^}]*calc\(14px \+ env\(safe-area-inset-bottom\)\)/.test(html), 'the select bar clears phone home-bars');
assert(/#csHold \{[^}]*touch-action:none;/.test(html), 'the model viewport owns its touch gestures (drag-rotate on phones)');

// ---- one shared GL context: the inspector's renderer is factored, not duplicated ----
assert(/function _ensureInspectR\(\)\{/.test(src), 'the inspector renderer init is a shared factory');
eq((src.match(/_invR=new THREE\.WebGLRenderer/g) || []).length, 1, 'exactly ONE place creates that renderer (no extra GL context)');
const oi = extractFunction('openInspect');
assert(/_ensureInspectR\(\);/.test(oi), 'the inventory inspector uses the factory');
assert(/if\(typeof closeInspect==='function' && typeof _inspEl!=='undefined' && _inspEl && _inspEl\.style\.display!=='none'\) closeInspect\(\);/.test(src),
  'opening the character select closes the inspector (they share the renderer)');

// ---- entries: roster characters + colors, selection semantics unchanged ----
const ce = extractFunction('_csEntries');
assert(/kind:'roster', i:-1, name:'Default'/.test(ce) && /charRoster\.forEach/.test(ce) && /CHARACTERS\.forEach/.test(ce),
  'the strip lists Default + roster characters + colors');
assert(/if\(e\.kind==='roster'\) selectRosterChar\(e\.i\); else selectChar\(e\.i\);/.test(src),
  'card taps run the SAME selection functions (MP broadcast + READY gating intact)');

// ---- the live preview: real model, auto-fit, idle clip, capsule fallback for colors ----
const cp = extractFunction('_csPreview');
assert(/THREE\.cloneSkinned \? THREE\.cloneSkinned\(gltf\.scene\)/.test(cp), 'skinned models clone safely');
assert(/const md=Math\.max\(s\.x,s\.y,s\.z\)\|\|1, k=2\.4\/md;/.test(cp), 'the model auto-fits the viewport');
assert(/clips\.find\(cl=>\/idle\/i\.test\(cl\.name\|\|''\)\)\|\|clips\[0\]/.test(cp), 'plays the idle clip when the model ships one');
assert(/new THREE\.CapsuleGeometry\(0\.5,1\.2,6,18\)/.test(cp), 'color characters preview as their tinted capsule');
assert(/if\(_csGrp!==grp\) return;/.test(cp), 'a stale async load can never clobber a newer preview');

// ---- input: turntable + drag + keys ----
assert(/if\(_csSpin\) _csRotY\+=0\.35\*dt;/.test(src), 'slow turntable until the user grabs it');
assert(/if\(_csMixer\) try\{ _csMixer\.update\(dt\); \}/.test(src), 'the idle animation advances with the preview clock');
assert(/e\.code==='Escape'\|\|e\.code==='Enter'/.test(src) && /e\.code!=='ArrowLeft' && e\.code!=='ArrowRight'/.test(src),
  'Esc/Enter close, arrows browse');
assert(/removeEventListener\('keydown', _csKeyH\)/.test(src), 'the key handler unbinds on close');
assert(/if\(_csRAF\)\{ cancelAnimationFrame\(_csRAF\); _csRAF=0; \}/.test(src), 'the preview loop stops when the screen closes');

// ---- entry points unchanged: menu + lobby buttons + the lobby auto-open all still hit openCharPicker ----
assert(/function openCharPicker\(\)\{/.test(src), 'openCharPicker is still the single entry point');
assert(/const cb=document\.getElementById\('charBtn'\); if\(cb\) cb\.onclick=openCharPicker;/.test(src), 'menu button wired');

done('build 1000: AAA character select — big live model, card strip, select bar');
