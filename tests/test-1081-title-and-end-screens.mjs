// (builds 1081 + 1082) THE GAME'S OWN LOOK — title screen visual controls, and end screens that match.
// The title screen had five knobs (title, tagline, one accent, one captured backdrop, hide-multiplayer) and
// a wall of hardcoded CSS. Everything an author would reasonably reach for — the font, the text colour, where
// the block sits, how hard the backdrop reads, a logo, what the buttons say — was fixed engine chrome. And it
// was the ONLY brandable surface: a creator shipped a beautiful title screen, hit Play, won, and got a screen
// saying MISSION COMPLETE in the engine's font. 1081 opens up the title screen; 1082 gives the endings the
// same treatment, so a game looks like itself from the first frame to the last.
// Every default is EXACTLY the value that used to be hardcoded, so a level saved before these builds renders
// unchanged and an author only pays for what they deliberately touch.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const GLUE = "const HUD_FONTS=['Orbitron','Rajdhani','Bungee'];\n";
const SAN = GLUE + extractFunction('_hpImg', src) + '\n' + extractFunction('_hpHex', src) + '\n'
  + extractFunction('_hpNum', src) + '\n' + extractFunction('_hpScreen', src) + '\n'
  + extractFunction('_sanitizeHomepage', src);
const run = new Function('h', SAN + '\nreturn _sanitizeHomepage(h);');

// ---------------------------------------------------------------- nothing changes until you change it
{
  const d = run(null);
  eq(d.font, '', 'no font override');
  eq(d.tcol, '', 'no title colour');
  eq(d.scol, '', 'no tagline colour');
  eq(d.bgCol, '', 'no background colour');
  eq(d.align, 'c', 'centred, as it always was');
  eq(d.vpos, 0, 'no vertical nudge');
  eq(d.bgOp, 55, 'the backdrop strength the stylesheet already used');
  eq(d.scrim, 100, 'the full vignette it already used');
  eq(d.bgFit, 'cover', 'and cover, which is what it did');
  eq(d.logo, '', 'no logo');
  eq(d.logoH, 16, '...at the default height when there is one');
  eq(d.playLbl, '', 'no custom Play label');
  eq(d.mpLbl, '', 'no custom Multiplayer label');
  eq(d.win.title + '|' + d.win.col + '|' + d.win.bg, '||', 'and the endings are untouched');
  eq(d.lose.title + '|' + d.lose.col + '|' + d.lose.bg, '||', '...both of them');
}

// ---------------------------------------------------------------- the sanitizer is the security boundary
{
  eq(run({ font: 'Bungee' }).font, 'Bungee', 'a font from the library passes');
  eq(run({ font: 'Comic Sans MS' }).font, '', '...and one that is not in it is dropped, not injected into a CSS rule');
  eq(run({ font: 42 }).font, '', '...as is a non-string');
  for (const k of ['tcol', 'scol', 'bgCol']) {
    eq(run({ [k]: '#AaBb12' })[k], '#AaBb12', k + ' takes six-hex');
    eq(run({ [k]: 'red' })[k], '', '...and rejects a colour keyword');
    eq(run({ [k]: '#fff' })[k], '', '...and short hex');
    eq(run({ [k]: '#12345g' })[k], '', '...and near-miss hex');
  }
  eq(run({ align: 'l' }).align, 'l', 'left aligns');
  eq(run({ align: 'r' }).align, 'r', 'right aligns');
  eq(run({ align: 'justify' }).align, 'c', 'anything else is centre');
  eq(run({ bgFit: 'contain' }).bgFit, 'contain', 'contain is offered');
  eq(run({ bgFit: 'fill' }).bgFit, 'cover', '...and only contain — a third value can never reach the CSS');
  eq(run({ playLbl: 'START<script>' }).playLbl, 'STARTscript', 'button labels strip angle brackets like every other authored string');
  eq(run({ playLbl: 'x'.repeat(99) }).playLbl.length, 20, '...and are bounded');
}
{ // numbers clamp rather than reaching the stylesheet raw
  eq(run({ vpos: 999 }).vpos, 40, 'the nudge clamps up');
  eq(run({ vpos: -999 }).vpos, -40, '...and down, so the block can never leave the screen');
  eq(run({ vpos: 'abc' }).vpos, 0, '...and junk falls back');
  eq(run({ bgOp: 240 }).bgOp, 100, 'opacity clamps');
  eq(run({ bgOp: -5 }).bgOp, 0, '...both ways');
  eq(run({ scrim: 50 }).scrim, 50, 'the vignette is a real dial');
  eq(run({ logoH: 400 }).logoH, 40, 'the logo height clamps');
  eq(run({ logoH: 1 }).logoH, 6, '...to something still visible');
  eq(run({ bgOp: 55.4 }).bgOp, 55, 'fractions round, so the CSS var is always a clean number');
}
{ // images: a capture, or something hosted
  const img = new Function(GLUE + extractFunction('_hpImg', src) + '\nreturn _hpImg;')();
  assert(img('data:image/png;base64,abc').length > 0, 'a captured PNG passes');
  assert(img('data:image/jpeg;base64,abc').length > 0, '...and JPEG');
  eq(img('data:image/png;base64,' + 'a'.repeat(160000)), '', 'an oversized capture is dropped — a share link has to stay a link');
  eq(img('data:text/html;base64,abc'), '', 'a non-image data URI is dropped');
  eq(img('javascript:alert(1)'), '', '...and a script URL certainly is');
  eq(img('https://x/key-art.png'), 'https://x/key-art.png', 'a hosted image passes, with no size cap and no level bloat');
  eq(img('http://x/a.png'), 'http://x/a.png', '...http too');
  eq(img('//x/a.png'), '', 'a protocol-relative URL is not accepted');
  eq(img('x'.repeat(500)), '', 'and a bare string is not a URL');
  assert(img('https://x/' + 'a'.repeat(500)).length <= 300, 'a hosted URL is bounded');
}
{ // the end screens
  const full = run({ win: { title: 'YOU LIVED<b>', col: '#ffcc00', bg: 'https://x/w.png' }, lose: { title: 'x'.repeat(99) } });
  eq(full.win.title, 'YOU LIVEDb', 'a victory heading is escaped and kept');
  eq(full.win.col, '#ffcc00', '...with its colour');
  eq(full.win.bg, 'https://x/w.png', '...and its backdrop');
  eq(full.lose.title.length, 32, 'a defeat heading is bounded');
  eq(run({ win: 'nope' }).win.title, '', 'a non-object screen block is not a crash');
  eq(run({ win: { junk: 1 } }).win.bg, '', 'unknown fields inside it do not survive either');
}

// ---------------------------------------------------------------- the CSS is all defaulted vars
{
  assert(/#gameHome \{[^}]*align-items:var\(--hp-align,center\)/.test(html), 'alignment is a var defaulted to what it was');
  assert(/#gameHome \{[^}]*background:var\(--hp-bgcol, radial-gradient\(circle at 50% 40%, #0a1412, #04070a\)\)/.test(html),
    'the background colour falls back to the exact gradient it used to hardcode');
  assert(/#gameHome \.hpBg \{[^}]*opacity:var\(--hp-bgop,\.55\)/.test(html), 'backdrop strength defaults to .55');
  assert(/#gameHome \.hpScrim \{[^}]*opacity:var\(--hp-scrim,1\)/.test(html), 'the vignette defaults to full');
  assert(/#gameHome \.hpIn \{[^}]*transform:translateY\(var\(--hp-vpos,0px\)\)/.test(html), 'the nudge is a transform, so it never reflows the layout');
  assert(/#gameHome \.hpTitle \{ font-family:var\(--hp-font, var\(--display-font\)\), sans-serif;/.test(html), 'the title font falls back to the engine face');
  assert(/#gameHome \.hpTitle \{[^}]*color:var\(--hp-tcol,#eafff7\)/.test(html), '...and its colour to the old near-white');
  assert(/#gameHome \.hpTag \{ color:var\(--hp-scol,#c2ddd4\)/.test(html), '...and the tagline to the old grey');
  assert(/#gameHome \.hpPlay \{ font-family:var\(--hp-font/.test(html) && /#gameHome \.hpSec \{ font-family:var\(--hp-font/.test(html),
    'the buttons take the chosen face too — a title in one font over buttons in another looks like a bug');
  assert(/#gameHome \.hpLogo \{ display:none;[^}]*height:var\(--hp-logoh,16vh\); object-fit:contain/.test(html),
    'the logo is hidden until set, height-driven, and never distorted');
}

// ---------------------------------------------------------------- applying it
{
  const fn = extractFunction('_hpPopulate', src);
  assert(/const v=\(k,val\)=>\{ if\(val==='' \|\| val==null\) d\.style\.removeProperty\(k\); else d\.style\.setProperty\(k, val\); \};/.test(fn),
    'an untouched field REMOVES its var rather than writing a copy of the default — there is no second copy to drift');
  assert(/v\('--hp-bgop',   h\.bgOp===55 \? '' : \(h\.bgOp\/100\)\);/.test(fn), '...including the numeric ones, compared against the stylesheet value');
  assert(/v\('--hp-align',  h\.align==='c' \? '' : _HP_ALIGN\[h\.align\]\);/.test(fn), '...and the mapped ones');
  assert(/if\(h\.font && typeof _ensureHudFonts==='function'[\s\S]{0,120}_ensureHudFonts\(\);/.test(fn),
    'a chosen face is fetched on demand — the 18-font library is not a boot cost for a game that uses none of it');
  assert(/play\.textContent = h\.playLbl \|\| 'PLAY';/.test(fn), 'the Play label falls back to PLAY');
  assert(/mp\.textContent = h\.mpLbl \|\| 'MULTIPLAYER';/.test(fn), '...and Multiplayer to MULTIPLAYER');
  assert(/ti\.style\.display = \(h\.logo && !h\.title\) \? 'none' : '';/.test(fn),
    'a logo with no title text shows the logo ALONE — which is what a wordmark is for');
}
{
  const m = src.match(/const _HP_ALIGN=\{[^}]*\};/)[0];
  assert(/c:'center', l:'flex-start', r:'flex-end'/.test(m), 'alignment maps to flex values');
  assert(/c:'center', l:'left', r:'right'/.test(src.match(/const _HP_TALIGN=\{[^}]*\};/)[0]), '...and text-align separately, since they are different keywords');
}

// ---------------------------------------------------------------- the end screens (build 1082)
{
  assert(/#endBg \{ position:fixed; inset:0; z-index:19;/.test(html), 'the end backdrop is its own layer...');
  assert(/#endBg \{[^}]*pointer-events:none/.test(html), '...that never eats a click meant for the buttons');
  assert(/#overlay\.branded \{ background:var\(--end-bgcol, rgba\(2,3,5,\.35\)\); -webkit-backdrop-filter:none; backdrop-filter:none; \}/.test(html),
    'a branded ending drops the 32px scene blur, or the creator\'s artwork would be smeared by it');
  assert(/#overlay\.branded h1 \{ font-family:var\(--end-font, 'Kaph', var\(--display-font\)\), sans-serif;/.test(html),
    'and the heading takes the game\'s face, falling back to the engine\'s');
}
{
  const fn = extractFunction('_endBrand', src);
  assert(/const live=!!\(sc && \(sc\.title \|\| sc\.col \|\| sc\.bg \|\| homepageCfg\.font\)\);/.test(fn),
    'a game that set nothing is not "branded" — the engine ending is left completely alone');
  assert(/ov\.classList\.remove\('branded'\)[\s\S]{0,200}return null;/.test(fn), '...and every var is cleared on the way out');
  assert(/if\(sc\.bg\)\{ im\.src=sc\.bg; im\.style\.display=''; bgl\.classList\.add\('on'\); \}/.test(fn), 'a backdrop image shows');
  assert(/else \{ im\.removeAttribute\('src'\); im\.style\.display='none'; bgl\.classList\.remove\('on'\); \}/.test(fn), '...and is properly torn down when there is none');
  assert(/if\(sc\.bg\) ov\.setProperty|if\(sc\.bg\) ov\.style\.setProperty\('--end-bgcol','rgba\(2,3,5,\.28\)'\)/.test(fn),
    'with artwork behind it the overlay tint lightens, so the image is actually visible');
  assert(/_ensureHudFonts\(\);/.test(fn), 'the chosen face is fetched here too');
}
{
  const w = extractFunction('gameWon', src), l = extractFunction('endGame', src);
  assert(/const _br=\(typeof _endBrand==='function'\) \? _endBrand\('win'\) : null;/.test(w), 'the win screen asks for its brand');
  assert(/const _br=\(typeof _endBrand==='function'\) \? _endBrand\('lose'\) : null;/.test(l), '...and the lose screen for its own');
  assert(/_creditEsc\(_br\.title\)/.test(w) && /_creditEsc\(_br\.title\)/.test(l),
    'a creator heading is escaped before it lands in innerHTML — a shared level cannot inject markup through it');
  assert(/\(_campaignComplete\?'CAMPAIGN COMPLETE':'MISSION COMPLETE'\)/.test(w), 'and with no heading set the engine wording is untouched');
  assert(/'RACE LOST' : 'TERMINATED'/.test(l), '...including the race-specific defeat wording');
}
assert(/if\(menuUp && typeof _endBrand==='function'\) _endBrand\(null\);/.test(extractFunction('_syncGameHome', src)),
  'the real menu is never left dressed as an ending — the overlay is shared, so the branding has to be cleared when it comes back');
{
  // Caught in the browser: a MutationObserver watches #overlay's class to keep the title screen in step.
  // Clearing the branding unconditionally rewrote that class, which re-fired the observer, which cleared
  // again — an infinite loop that froze the tab the moment the menu came back from an ending.
  const fn = extractFunction('_endBrand', src);
  assert(/if\(!_endBranded\) return null;/.test(fn),
    'clearing is a NO-OP when nothing is branded — otherwise the observer that calls it re-triggers itself forever');
  assert(/_endBranded=false;/.test(fn) && /_endBranded=true;/.test(fn), '...tracked by one flag, set on both paths');
  const i = fn.indexOf('if(!_endBranded) return null;'), j = fn.indexOf("classList.remove('branded')");
  assert(i >= 0 && j > i, '...and the guard comes BEFORE the first DOM write, which is the whole point');
}

// ---------------------------------------------------------------- the panel
{
  const fn = extractFunction('_renderHomeLook', src);
  assert(/edFold\(host, 'hpLook', 'Look', false,/.test(fn), 'the controls are folded away by default — a title and a backdrop should not require scrolling past twelve of them');
  assert(/const touch = \(\)=>\{ dirty\(\); _hpLive\(\); \};/.test(fn), 'every control repaints the live layer...');
  assert(/for\(const o of e\.options\)\{ if\(o\.value\) o\.style\.fontFamily="'"\+o\.value\+"'"; \}/.test(fn), 'the font list previews each face in that face');
  assert(/x\.disabled=!cur;/.test(fn), 'a colour that was never set cannot be "reset"');
  assert(/row\('Darken', rng\(h\.scrim,0,100/.test(fn), 'the vignette is exposed as Darken, not as "scrim"');
  assert(/Logo only \\u2014 the title text is hidden\./.test(fn), 'and the panel says what a logo-with-no-title actually does');
  assert(/for\(const \[key, label, ph, defCol\] of \[\['win','Victory','MISSION COMPLETE',_winDef\], \['lose','Defeat','TERMINATED','#ff2d55'\]\]\)\{/.test(fn),
    'both endings are authored in the same fold, each showing the engine wording it replaces');
  assert(/const _winDef=\(typeof UI_THEME_DEFAULT!=='undefined' && UI_THEME_DEFAULT\.accent\)/.test(fn),
    '...and the default swatch is read from the theme source of truth, not a copied literal');
  assert(/even with the title screen switched off/.test(fn),
    'the panel says the font reaches the endings even without a custom title screen — otherwise nobody would find it');
}
{
  const fn = extractFunction('_endPreview', src);
  assert(/if\(_endPvSaved===null\) _endPvSaved=\{ html:ov\.innerHTML, hidden:ov\.classList\.contains\('hidden'\) \};/.test(fn),
    'previewing an ending saves the overlay it is standing on...');
  assert(/const sc=_endBrand\(kind\);/.test(fn), '...paints it with the REAL painter, not a mock-up that could drift');
  assert(/ov\.style\.zIndex='56';/.test(fn), '...above the editor panel, under modals — the same rule the title preview follows');
  const c = extractFunction('_endPreviewClose', src);
  assert(/_endBrand\(null\);/.test(c) && /ov\.innerHTML=_endPvSaved\.html;/.test(c) && /_endPvSaved=null;/.test(c),
    'and closing puts everything back exactly as it was');
  assert(/if\(typeof bindMenu==='function'\) try\{ bindMenu\(\); \}catch\(e\)\{\}/.test(c),
    '...including re-binding the menu buttons the restored markup carries');
}
assert(/renderUploadRow\(r, 'texture', \(url\)=>\{ homepageCfg\.bg=_hpImg\(url\); dirty\(\); renderHomePanel\(\); _hpLive\(\); \}\);/.test(src),
  'the backdrop can be UPLOADED now, not only captured from the scene — key art is not a screenshot');
assert(/function _hpBgNote\(h\)\{/.test(src) && /Backdrop image \\u2713/.test(src), 'and the note says which kind is in place');

done('builds 1081+1082: a game can look like itself from the title screen to the last frame');
