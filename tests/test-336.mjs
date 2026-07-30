import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const page = html;
// build 445: theming extended to the canvas-drawn HUD (minimap) + DOM elements built in JS, and many more fonts.

// JS-side accent globals for the 2D canvas (CSS vars can't reach a canvas)
assert(/let UI_ACCENT = '#38f5b5', UI_ACCENT_RGB = '56,245,181';/.test(src), 'JS accent globals exist for canvas use');
const ap = extractFunction('applyUiTheme');
assert(/UI_ACCENT = uiTheme\.accent\|\|UI_THEME_DEFAULT\.accent;/.test(ap) && /UI_ACCENT_RGB = _hexToRgbTriplet\(UI_ACCENT\);/.test(ap), 'theme updates the canvas accent globals too');

// minimap (canvas) reads the themed accent — build 669: per-level HUD accent (minimap tint > HUD accent > global)
assert(/const _mAcc = \(typeof hudCfg!=='undefined' && hudCfg && hudCfg\.el && hudCfg\.el\.minimap && hudCfg\.el\.minimap\.accent\) \? hudCfg\.el\.minimap\.accent/.test(src), 'minimap accent derives from the per-level HUD config');
assert(/ctx\.strokeStyle = 'rgba\('\+_mAccRgb\+',0\.12\)';/.test(src), 'minimap range rings use the per-level accent');
assert(/blip\(extractPos\.x, extractPos\.z, _mAcc/.test(src), 'minimap objective blips use the per-level accent');

// :root stays a real color (not circular) so the whole var system resolves
assert(/:root\{ color-scheme: dark; --accent:#38f5b5;/.test(page), ':root accent is a concrete color (not self-referential)');
// the JS-built DOM now leans on the CSS var broadly
assert(page.split('var(--accent)').length - 1 >= 90, 'the accent variable now drives ~all of the DOM UI');
// world/gameplay colors (THREE 0x38f5b5) were intentionally left alone
assert(page.split('0x38f5b5').length - 1 >= 15, 'gameplay/world colors (powerups, particles, FX) are left untouched');

// expanded font library is imported + offered
for(const fam of ['Audiowide','Teko','Exo\\+2','Saira\\+Condensed','Aldrich','Syncopate','VT323','Michroma','Russo\\+One','Bungee','Space\\+Mono','JetBrains\\+Mono']){
  assert(new RegExp('family='+fam).test(page), 'font imported: '+fam.replace('\\\\+',' '));
}
assert(/'Audiowide'/.test(src) && /'VT323'/.test(src) && /'Teko'/.test(src), 'new fonts offered in the choice lists');
done();
