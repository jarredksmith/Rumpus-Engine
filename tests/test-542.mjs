import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 696: the interact prompt ("E Activate/Talk/Open…") and the grab hint are now editable HUD elements —
// size / position / opacity / font / tint + a show-hide toggle, like the other HUD elements.

// --- registered as HUD elements + toggles ---
assert(/\{ k:'prompt',    sel:'#prompt',    label:'Interact prompt', text:true \}/.test(src), 'the interact prompt is a HUD element');
assert(/\{ k:'grab',      sel:'#grabHint',  label:'Grab hint',       text:true \}/.test(src), 'the grab hint is a HUD element');
assert(/const HUD_TOGGLES = \['minimap','score','wave','ammo','health','crosshair','killfeed','prompt','grab'\];/.test(src), 'both have show/hide toggles');

// --- the CSS consumes the per-element transform/opacity/tint/font vars ---
assert(/#prompt \{[^}]*transform:translateX\(-50%\) translate\(var\(--el-prompt-dx,0px\),var\(--el-prompt-dy,0px\)\) scale\(var\(--el-prompt-s,1\)\)/.test(html), 'prompt position/size from its vars');
assert(/#prompt \{[^}]*opacity:var\(--el-prompt-op,1\)[^}]*color:var\(--el-tint,#ffd166\)/.test(html), 'prompt opacity + tint vars');
assert(/#grabHint \{[^}]*translate\(var\(--el-grab-dx,0px\),var\(--el-grab-dy,0px\)\) scale\(var\(--el-grab-s,1\)\)[^}]*opacity:var\(--el-grab-op,1\)/.test(html), 'grab hint position/size/opacity vars');
assert(/body\.hud-hide-prompt #prompt, body\.hud-hide-grab #grabHint \{ display: none !important; \}/.test(html), 'hide rules for both');

// --- applyHudCfg sets the vars ON the element too (grab hint lives outside #hud, so can't inherit) ---
const ah = extractFunction('applyHudCfg');
assert(/dom\.style\.setProperty\('--el-'\+e\.k\+'-dx', \(o\.dx\|\|0\)\+'px'\)/.test(ah), 'per-element transform vars set on the element');
assert(/dom\.style\.setProperty\('--el-tint', o\.accent\)/.test(ah), 'per-element tint set on the element');

// --- the HUD editor shows sample prompt/grab text so they can be dragged/sized live ---
const ae = extractFunction('applyEditorMode');
assert(/pe\.innerHTML='<b>E<\/b> Activate'; pe\.style\.display='block'/.test(ae), 'a sample prompt shows while theming the HUD');
assert(/ge\.textContent='\[G \/ MMB\] Grab'; ge\.style\.display='block'/.test(ae), 'a sample grab hint shows while theming the HUD');

done('build 696: interact prompt + grab hint are editable HUD elements');
