import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 701: the objective banner (#goalBanner) and the NPC dialogue box (#dialogue) are now full, separate HUD
// elements — size / position / opacity / tint / font + show-hide, and their panel chrome follows the HUD theme.

// --- registered as two separate HUD elements + toggles ---
assert(/\{ k:'goal',      sel:'#goalBanner',label:'Objective banner',text:true \}/.test(src), 'the objective banner is a HUD element');
assert(/\{ k:'dlg',       sel:'#dialogue',  label:'NPC dialogue',    text:true \}/.test(src), 'the NPC dialogue is a HUD element');
assert(/const HUD_TOGGLES = \['minimap','score','wave','ammo','health','crosshair','killfeed','prompt','grab','goal','dlg'\];/.test(src), 'both have show/hide toggles');
assert(/goal:'Objective banner', dlg:'NPC dialogue'/.test(src), 'both have toggle labels');

// --- CSS consumes the per-element transform/opacity/tint/font vars ---
assert(/#goalBanner \{[^}]*transform:translateX\(-50%\) translate\(var\(--el-goal-dx,0px\),var\(--el-goal-dy,0px\)\) scale\(var\(--el-goal-s,1\)\)/.test(html), 'objective position/size from its vars');
assert(/#goalBanner \{[^}]*opacity:calc\(var\(--el-goal-op,1\) \* var\(--goal-vis,0\)\)/.test(html), 'objective opacity = per-element op * the JS fade var');
assert(/#goalBanner \{[^}]*color:var\(--el-tint,#eafff7\)[^}]*font:600 18px var\(--el-font, var\(--hud-display-font/.test(html), 'objective tint + font vars');
assert(/#dialogue \{[^}]*transform:translateX\(-50%\) translate\(var\(--el-dlg-dx,0px\),var\(--el-dlg-dy,0px\)\) scale\(var\(--el-dlg-s,1\)\)[^}]*opacity:var\(--el-dlg-op,1\)/.test(html), 'dialogue position/size/opacity vars');
assert(/#dialogue \.dlgText \{ color:var\(--el-tint,#eafff7\)/.test(html), 'dialogue body text takes the element tint');

// --- panel chrome follows the theme (panel-opacity + accent border) ---
assert(/#goalBanner \{[^}]*background:rgba\(6,12,15,calc\(\.55\*var\(--hud-panel-op,1\)\)\)[^}]*border:1px solid rgba\(var\(--accent-rgb,120,200,180\),\.3\)/.test(html), 'objective bg honours panel-opacity + accent border');
assert(/#dialogue \{[^}]*background:rgba\(6,12,15,calc\(\.92\*var\(--hud-panel-op,1\)\)\)[^}]*border:1px solid rgba\(var\(--accent-rgb,120,200,180\),\.4\)/.test(html), 'dialogue bg honours panel-opacity + accent border');

// --- hide + shape + preview rules ---
assert(/body\.hud-hide-goal #goalBanner \{ opacity: 0 !important; \}/.test(html), 'objective hide rule (opacity, never reflows)');
assert(/body\.hud-hide-dlg #dialogue \{ display: none !important; \}/.test(html), 'dialogue hide rule');
assert(/body\.hudPreview:not\(\.hud-hide-goal\) #goalBanner \{ opacity: 1 !important; pointer-events: auto; cursor: move;/.test(html), 'objective force-shown + draggable while theming');
assert(/body\.hudPreview:not\(\.hud-hide-dlg\) #dialogue \{ display: block !important; pointer-events: auto; cursor: move;/.test(html), 'dialogue force-shown + draggable while theming');

// --- applyHudCfg mirrors panel-opacity + accent onto <body> so body-level panels theme ---
const ah = extractFunction('applyHudCfg');
assert(/body\.style\.setProperty\('--hud-panel-op', String\(c\.panelOp\)\)/.test(ah), 'panel-opacity propagated to <body>');
assert(/body\.style\.setProperty\('--accent-rgb', _hexToRgbTriplet\(c\.accent\)\)/.test(ah), 'accent-rgb propagated to <body>');

// --- the banner fade is var-driven (so per-element opacity can multiply it) ---
assert(/el\.style\.setProperty\('--goal-vis','1'\)/.test(extractFunction('showGoalBanner')), 'showGoalBanner raises the fade var');
assert(/el\.style\.setProperty\('--goal-vis','0'\)/.test(extractFunction('tickGoalBanner')), 'tickGoalBanner lowers the fade var');

// --- styling moved out of inline cssText into CSS (so theme vars actually apply) ---
assert(!/el\.style\.cssText=/.test(extractFunction('_ensureGoalBanner')), 'objective banner no longer hard-codes inline styles');
assert(!/el\.style\.cssText=/.test(extractFunction('_ensureDialogueEl')), 'dialogue box no longer hard-codes inline styles');
assert(/el\.innerHTML='<span class="goalLabel">OBJECTIVE<\/span><span class="goalText">/.test(extractFunction('showGoalBanner')), 'objective text uses themeable classes');
assert(/'<div class="dlgText">'\+_creditEsc\(n\.t\)\+'<\/div>'/.test(extractFunction('_renderDialogue')) && /<div class="dlgMore">/.test(extractFunction('_renderDialogue')),
  'dialogue text uses themeable classes');

// --- HUD editor fills sample objective + dialogue so they can be dragged/sized live ---
const ae = extractFunction('applyEditorMode');
assert(/_ensureGoalBanner==='function'\)\?_ensureGoalBanner\(\)/.test(ae), 'the objective banner is ensured present while theming');
assert(/class="goalLabel">OBJECTIVE<\/span><span class="goalText">Restore Water, Light, and Soil\./.test(ae), 'a sample objective is shown while theming');
assert(/class="dlgName">Mr\. Spikey<\/div>/.test(ae), 'a sample dialogue line is shown while theming');

done('build 701: objective banner + NPC dialogue are separate, themeable HUD elements');
