// (build 817) Font loading: the boot @import pulled 18 Google font families (a large blocking first-paint cost) when only
// 2 are defaults. The critical path now imports just Chakra Petch + Major Mono Display; the other 16 HUD-picker families
// lazy-load via _ensureHudFonts when a picker opens or a saved theme / loaded level actually uses one.
import { gameSource, html, assert, eq, done } from './harness.mjs';
const src = gameSource();

// critical path = 2 families
{
  const imp = html.match(/@import url\('https:\/\/fonts\.googleapis\.com[^']*'\)/);
  assert(imp, 'the boot @import exists');
  const fams = (imp[0].match(/family=/g)||[]).length;
  eq(fams, 1, 'only the default family loads at boot (Rajdhani since build 967)');
  assert(/Rajdhani/.test(imp[0]), 'and it is the default');
}

// the lazy loader carries the other 16
{
  const el = src.match(/l\.href='https:\/\/fonts\.googleapis\.com[^']*'/);
  assert(el, 'the lazy pack href exists');
  eq((el[0].match(/family=/g)||[]).length, 17, 'the lazy pack carries the 17 optional families (build 967: the old defaults moved here)');
  assert(/display=swap/.test(el[0]), 'display=swap keeps text visible while they arrive');
}
assert(/let _extraFontsReq=false;/.test(src) && /if\(_extraFontsReq\) return; _extraFontsReq=true;/.test(src), 'the pack loads at most once');

// triggers: pickers + actual use
assert(/function renderHudPanel\(\)\{\s*\n\s*if\(typeof _ensureHudFonts==='function'\) _ensureHudFonts\(\);/.test(src), 'opening the HUD font picker loads the pack');
assert(/uiFontSel'\); if\(typeof _ensureHudFonts==='function'\) _ensureHudFonts\(\);/.test(src), 'opening the pause appearance picker loads the pack');
assert(/_fontNeedsLoad\(c\.uiFont\) \|\| _fontNeedsLoad\(c\.displayFont\) \|\| \(c\.el && Object\.keys\(c\.el\)\.some\(k=>_fontNeedsLoad\(c\.el\[k\] && c\.el\[k\]\.font\)\)\)/.test(src), 'a level/HUD config that USES a non-default font loads the pack');
assert(/function _fontNeedsLoad\(f\)\{ return f && f!=='Rajdhani'; \}/.test(src), 'the default never triggers a load');

done('build 817: 2 fonts at boot, 16 lazy — big first-paint win, zero visual change');
