// (build 978) PRO INSPECTOR — the editor read like a manual taped to a control panel; now it reads
// like a tool. Three moves, borrowed from Unity/Unreal/Blender:
// 1. TOOLTIPS: one styled #edTip serves every [data-tip]; native title= attributes are absorbed.
// 2. AUTO-TIPIFY: a MutationObserver folds helper prose as panels render — "<b>Label</b> — long
//    explanation" keeps the label + gains an (i) dot; long plain paragraphs clamp to one dim line
//    (full text on hover). A topbar (i) toggle restores inline prose (persisted).
// 3. SETTINGS SEARCH: an Unreal-style filter — matching sections open, the rest hide, matches in
//    OTHER tabs surface as "Also in:" chips that jump there.
// Plus a flat CSS reskin: thin uppercase section separators, one UI font, consistent controls.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

// ---- tooltip engine ----
assert(/function _edTipEl\(doc\)/.test(src) && /function _edTipShowFor\(el\)/.test(src), 'the tooltip engine exists');
assert(/setTimeout\(\(\)=>\{ if\(_edTipTarget===el\) _edTipShowFor\(el\); \}, 350\)/.test(src), '350ms hover delay');
assert(/Math\.min\(Math\.max\(8, r\.left\), w\.innerWidth-tw-8\)/.test(src), 'viewport-clamped placement');
assert(/if\(y\+th > w\.innerHeight-8\) y=r\.top-th-8;/.test(src), 'flips above when there is no room below');
assert(/e\.pointerType==='touch'/.test(src) && /_edTipShowFor\(dot\); setTimeout/.test(src), 'touch taps an (i) to toggle it');

// ---- auto-tipify ----
const tip = src.match(/function _edTipify\(root\)\{[\s\S]*?\nlet _edTipifyQueued/)[0];   // raw slice: the regex literal inside trips the brace-matcher
assert(/querySelectorAll\('\[title\]'\)/.test(tip) && /removeAttribute\('title'\)/.test(tip),
  'native title= attributes become styled tooltips');
assert(/querySelector\('button,input,select,a,textarea,label'\)/.test(tip), 'interactive hints are left untouched');
assert(/<b>'\+m\[1\]\+'<\/b><span class="tipDot" data-tip="/.test(tip), 'label hints keep the label and gain an (i) dot');
assert(/tipFull/.test(tip), 'the folded prose is kept inline for the inline-help mode');
assert(/text\.length>52/.test(tip) && /hintClamp/.test(tip), 'long plain hints clamp to one line with a tooltip');
assert(/new MutationObserver\(\(\)=>_edTipifySoon\(\)\)\.observe\(p, \{ childList:true, subtree:true \}\)/.test(src),
  'every future panel render is tipified automatically');

// ---- inline-help toggle ----
assert(/id="edHelpTxt"/.test(src) && /breach_editor_helptext/.test(src), 'the topbar (i) toggle exists and persists');
assert(/body\.edHelpFull #editor \.hintClamp \{ white-space: normal;/.test(html), 'inline mode unclamps the hints');
assert(/body\.edHelpFull #editor \.tipDot \{ display: none; \}/.test(html), '...and swaps dots back to prose');

// ---- settings search ----
assert(/id="edSearch" type="search" placeholder="Search settings/.test(src), 'the search box sits under the mode tabs');
assert(/applyEditorMode\(\);   \/\/ reset this mode's section visibility first/.test(src), 'each query starts from the mode baseline');
assert(/if\(!hit\)\{ sx\.style\.display='none'; \}/.test(src)
  && /else if\(sx\.classList\.contains\('collapsed'\)\)\{ sx\.classList\.remove\('collapsed'\); opened\.add\(sx\); \}/.test(src),
  'misses hide, hits force-open (and remember what to re-collapse)');
assert(/elsewhere\.add\(mkey\)/.test(src) && /'Also in:'/.test(src) && /setEditorMode\(mkey\); window\._edSearchApply\(\);/.test(src),
  'matches in other tabs become jump chips');
assert(/e\.key==='Escape'/.test(src) && /q\.blur\(\)/.test(src), 'Escape clears and leaves the box');

// ---- the mode hint stays fresh across mode switches ----
assert(/hint\.classList\.add\('hintClamp','tipped'\); hint\.setAttribute\('data-tip', \(hint\.textContent\|\|''\)\.trim\(\)\)/.test(src),
  'the mode one-liner re-tips itself on every mode change');

// ---- reskin tokens ----
assert(/#editor \{ font: 12px\/1\.45 var\(--ui-font\), system-ui, sans-serif;/.test(html), 'the panel drops monospace for the UI font');
assert(/#editor \.edSection \{ border: none; border-top: 1px solid rgba\(140,180,168,0\.10\); border-radius: 0;/.test(html),
  'sections are a flat details list (thin separators, no boxes)');
assert(/#editor \.edSecHead \{ background: transparent;[^}]*text-transform: uppercase;/.test(html), 'thin uppercase headers');
assert(/#editor::-webkit-scrollbar \{ width: 9px; \}/.test(html), 'a slim styled scrollbar');
assert(/#edTip \{ position: fixed; z-index: 200;/.test(html), 'the tooltip is styled, not native');
assert(/LEVEL EDITOR<\/h3>/.test(src) && !/LEVEL \/ TRANSFORM EDITOR/.test(src), 'the panel title reads like a product, not a debug view');

done('build 978: pro inspector — tooltips everywhere, one-line hints, settings search, flat reskin');
