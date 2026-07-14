// (build 967) The pause menu loses its Appearance section (accent / UI font / Title font /
// Reset) — the editor's HUD options own styling now — and the DEFAULT fonts become Rajdhani
// for both the UI and display faces (was Chakra Petch / Major Mono Display). Saved themes
// keep working: the old defaults moved into the lazy-load pack, and every theme-picker JS
// bind was already if(el)-guarded, so removing the markup is safe.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

// defaults are Rajdhani everywhere a default lives
assert(/--ui-font:'Rajdhani', sans-serif; --display-font:'Rajdhani', sans-serif;/.test(html), ':root defaults');
assert(/UI_THEME_DEFAULT = \{ accent:'#38f5b5', uiFont:"'Rajdhani', sans-serif", displayFont:"'Rajdhani', sans-serif" \}/.test(src), 'theme default');
assert(/DEFAULT_HUD = \{ accent:'#38f5b5', health:'#ff4d6d', score:'#ffd166', uiFont:'Rajdhani', displayFont:'Rajdhani',/.test(src), 'HUD default');

// boot loads ONLY Rajdhani; the old defaults lazy-load so saved themes still render
assert(/@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Rajdhani:wght@500;600;700&display=swap'\);/.test(html), 'boot import is Rajdhani only');
assert(/function _fontNeedsLoad\(f\)\{ return f && f!=='Rajdhani'; \}/.test(src), 'only Rajdhani skips the lazy pack');
assert(/l\.href='https:\/\/fonts\.googleapis\.com\/css2\?family=Chakra\+Petch:wght@400;600;700&family=Major\+Mono\+Display&family=Orbitron/.test(src),
  'the old defaults ride the lazy pack');

// the pause-menu appearance section is gone; its guarded binds remain harmless
assert(!/id="pauseTheme"/.test(html), 'pause appearance section removed');
assert(!/id="uiAccent"/.test(html) && !/id="uiFontSel"/.test(html) && !/id="uiDispSel"/.test(html), 'its pickers are gone from the markup');
assert(/getElementById\('uiAccent'\); if\(ac\)/.test(src), 'the old binds stay if(el)-guarded (no crash)');

done('build 967: Rajdhani defaults + pause menu sheds the appearance section');
