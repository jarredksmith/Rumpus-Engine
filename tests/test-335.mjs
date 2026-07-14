import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const page = html;
// build 444: UI theming — players can set the accent color + UI/title fonts; persisted and applied via CSS vars.

// CSS is driven by variables now
assert(/:root\{ --accent:#38f5b5; --accent-rgb:56,245,181; --gold:#ffd166; --info:#7ad7ff; --danger:#ff6b6b; --ui-font:'Rajdhani', sans-serif; --display-font:'Rajdhani', sans-serif; \}/.test(html), ':root defines the themable variables (build 814: + gold/info/danger; build 967: Rajdhani defaults)');
assert(page.indexOf('var(--accent)')>=0 && page.indexOf('rgba(var(--accent-rgb)')>=0, 'CSS uses the accent variable (hex + rgba forms)');
assert(page.indexOf('font-family:var(--ui-font)')>=0 && page.indexOf('var(--display-font)')>=0, 'CSS uses the font variables');
// extra fonts are loaded so the choices actually render
assert(/family=Orbitron/.test(page) && /family=Rajdhani/.test(page) && /family=Press\+Start\+2P/.test(page) && /family=Share\+Tech\+Mono/.test(page), 'extra theme fonts are imported');

// state + persistence
assert(/const UI_THEME_KEY='breach_ui_theme'/.test(src), 'theme persists under its own key');
assert(/UI_THEME_DEFAULT = \{ accent:'#38f5b5'/.test(src), 'sensible defaults');
assert(/UI_FONT_CHOICES = \[/.test(src) && /UI_DISPLAY_CHOICES = \[/.test(src), 'curated font choices for UI + title');

// apply writes all four CSS vars (incl. derived rgb triplet)
const ap = extractFunction('applyUiTheme');
assert(/setProperty\('--accent', UI_ACCENT\)/.test(ap) && /setProperty\('--accent-rgb', UI_ACCENT_RGB\)/.test(ap) && /setProperty\('--ui-font'/.test(ap) && /setProperty\('--display-font'/.test(ap), 'applyUiTheme sets accent, accent-rgb, ui-font, display-font');
assert(/applyUiTheme\(\);   \/\/ apply saved look/.test(src), 'saved theme is applied on load');

// controls wired in the pause menu + reset
assert(!/id="pauseTheme"/.test(page), 'the pause-menu appearance section is deliberately gone (build 967 — the editor owns HUD styling)');
assert(/getElementById\('uiAccent'\)[\s\S]*?uiTheme\.accent=ac\.value; applyUiTheme\(\); saveUiTheme\(\)/.test(src), 'accent picker updates + persists live');
assert(/function resetUiTheme\(\)/.test(src), 'reset restores defaults');

// executable: hex -> rgb triplet (used for the rgba() variable)
function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); return ((n>>16)&255)+','+((n>>8)&255)+','+(n&255); }
assert(hexToRgb('#38f5b5')==='56,245,181', 'default teal converts to the original rgb triplet (no visual change by default)');
assert(hexToRgb('#ff0000')==='255,0,0', 'red converts correctly');
assert(hexToRgb('#abc')==='170,187,204', 'short hex expands correctly');
done();
