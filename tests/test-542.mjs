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
assert(/#prompt \{[^}]*opacity:var\(--el-prompt-op,1\)[^}]*color:var\(--el-tint, var\(--accent,#ffd166\)\)/.test(html), 'prompt opacity + tint vars');
assert(/#grabHint \{[^}]*translate\(var\(--el-grab-dx,0px\),var\(--el-grab-dy,0px\)\) scale\(var\(--el-grab-s,1\)\)[^}]*opacity:var\(--el-grab-op,1\)/.test(html), 'grab hint position/size/opacity vars');
assert(/body\.hud-hide-prompt #prompt, body\.hud-hide-grab #grabHint \{ display: none !important; \}/.test(html), 'hide rules for both');

// --- applyHudCfg sets the vars ON the element too (grab hint lives outside #hud, so can't inherit) ---
const ah = extractFunction('applyHudCfg');
assert(/dom\.style\.setProperty\('--el-'\+e\.k\+'-dx', \(o\.dx\|\|0\)\+'px'\)/.test(ah), 'per-element transform vars set on the element');
assert(/dom\.style\.setProperty\('--el-tint', o\.accent\)/.test(ah), 'per-element tint set on the element');

// --- the HUD editor shows sample prompt/grab text so they can be dragged/sized live ---
const ae = extractFunction('applyEditorMode');
assert(/pe\.innerHTML='<b>E<\/b> Activate';/.test(ae), 'a sample prompt is filled in while theming the HUD');
assert(/ge\.textContent='\[G \/ MMB\] Grab';/.test(ae), 'a sample grab hint is filled in while theming the HUD');
// build 698: CSS force-shows them in preview (their display is otherwise driven by proximity, which would hide them)
assert(/body\.hudPreview:not\(\.hud-hide-prompt\) #prompt, body\.hudPreview:not\(\.hud-hide-grab\) #grabHint \{\s*display: block !important; pointer-events: auto; cursor: move;/.test(html), 'the prompt + grab hint are force-shown + draggable in the HUD editor');

// --- build 697: the prompt + grab hint panel chrome now follows the HUD theme ---
assert(/#prompt \{[^}]*background:linear-gradient\(135deg, rgba\(8,18,22,calc\(\.88\*var\(--hud-panel-op,1\)\)\)/.test(html), 'prompt background honours the panel-opacity theme');
assert(/#prompt \{[^}]*border:1px solid rgba\(var\(--accent-rgb,255,209,102\),\.4\)/.test(html), 'prompt border tints with the accent');
assert(/#grabHint \{[^}]*background:rgba\(6,12,15,calc\(\.55\*var\(--hud-panel-op,1\)\)\)[^}]*border:1px solid rgba\(var\(--accent-rgb,120,200,180\),\.3\)/.test(html), 'grab hint follows the panel-opacity + accent theme');
assert(/body\.hud-shape-rounded #prompt, body\.hud-shape-square #prompt \{ clip-path: none !important; \}/.test(html), 'the prompt drops its angular clip for rounded/square shapes');
assert(/body\.hud-noborder #hud \.panel, body\.hud-noborder #prompt, body\.hud-noborder #grabHint \{ border-color: transparent !important; \}/.test(html), 'no-border theme removes the prompt borders');

done('build 696/697: interact prompt + grab hint are editable + themeable HUD elements');
