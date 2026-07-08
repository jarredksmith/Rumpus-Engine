// (build 912) iOS TEXT-SELECTION LOUPE — holding a touch button or sliding a settings slider raised
// the text-selection tool (only #touchUI and the layout-edit overlay were guarded). Selection, the
// touch callout and the gray tap flash are now dead GLOBALLY; typing fields alone re-enable
// selection (and keep their long-press menu for paste). Verified live on a touch profile: computed
// userSelect none on body/labels/sliders/buttons, text on chat + name inputs; synthetic contextmenu
// defaultPrevented on a button AND a slider, not on a text input.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

assert(/html, body \{ -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; \}/.test(html),
  'global guard: no selection, no touch callout, no tap flash');
assert(/input\[type=text\], input\[type=number\], input\[type=password\], input\[type=url\], input\[type=search\], input:not\(\[type\]\), textarea \{\n    -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; \}/.test(html),
  'typing fields get selection (and the callout) back');
assert(/if\(gameOn\)\{ e\.preventDefault\(\); return; \}/.test(src) &&
       /input\[type=text\], input\[type=number\], input\[type=password\], input\[type=url\], input\[type=search\], input:not\(\[type\]\), textarea'\)\)\) e\.preventDefault\(\)/.test(src),
  'touch long-press menu suppressed everywhere except typing fields (sliders included — plain `input` matched ranges too)');

done('build 912: no more iOS selection loupe on buttons and sliders');
