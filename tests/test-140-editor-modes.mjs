import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// the five-mode switch that gates the editor panel
assert(/const EDITOR_MODES = \['build','scene','player','enemies','rules','kit','files'\];/.test(src), 'seven editor modes defined (Player became its own area in build 652)');
// Enemies is its own mode now, not under Rules; Weapons mode carries the gun-model import (the Object section)
assert(/enemies: \['enemies','gizmo','object','transform','boltfx'\]/.test(src), 'Enemies mode carries its section plus the spawn picker/fields/gizmo (spawns moved here in build 334) + enemy gunfire FX (build 647)');
assert(/rules:\s*\['game','pickups','loot','invitems'\]/.test(src), 'Gameplay tab: game + pickups + loot + invitems');
assert(/kit:\s*\['object','transform','impactfx','tracerfx','crosshair'\]/.test(src), 'Weapons mode = object + transform + impact/streak FX + crosshair (enemy gunfire moved to Enemies in build 647)');
assert(/const MODE_COLOR = \{/.test(src), 'per-mode accent colours defined');
assert(!/label: '\uD83D\uDCE6 Extract'/.test(src) && /label: 'Extract'/.test(src), 'Extract tab icon removed');
assert(/function applyEditorMode\(\)/.test(src), 'applyEditorMode exists (show/hide by mode)');
assert(/function setEditorMode\(mode, fromSelection\)/.test(src), 'setEditorMode exists');
assert(/function syncModeToActive\(\)/.test(src), 'syncModeToActive exists (scene-click hops to the owning mode)');

// every section key built in the panel must belong to exactly one mode (nothing orphaned/hidden forever)
const secKeys = [...src.matchAll(/sec\('[^']*', '([a-z]+)',/g)].map(m=>m[1]);
assert(secKeys.length>=10, 'found the panel sections ('+secKeys.length+')');
const ms = src.match(/const MODE_SECTIONS = \{([\s\S]*?)\};/)[1];
for(const k of secKeys){ assert(ms.includes("'"+k+"'"), 'section "'+k+'" is assigned to a mode'); }

// every editor target tab belongs to exactly one mode
const mt = src.match(/const MODE_TARGETS = \{([\s\S]*?)\};/)[1];
for(const t of ['gun','aim','station','player','props','lights','spawns','extract','grenade']){
  assert(mt.includes("'"+t+"'"), 'target "'+t+'" is assigned to a mode');
}

// the panel renders a mode row and the scene-click path hops modes
assert(/<div class="edModes" id="edModes"><\/div>/.test(src), 'panel has the mode-switch row');
assert((src.match(/editorActive='props'; syncModeToActive\(\); renderEditorFields\(\);/g)||[]).length===1, 'scene-pick of a prop syncs the mode');

// contextual sections + props reorder + library hidden
assert(/function applyContextualSections\(\)/.test(src), 'contextual section hide exists');
assert(/const matOn = matInMode && !!\(selObj && isShapePrimitive/.test(src) && /matSec\.style\.display = matOn/.test(src), 'Material section self-hides unless a primitive is selected AND the Build tab is active (build 361)');
assert(/xfSec\) xfSec\.style\.display = \(xfInMode && tgt\.fields && tgt\.fields\.length\)/.test(src), 'Transform section hides when the target has no fields (Extract)');
assert(/<div id="edShapes"><\/div><div id="edModels"><\/div><div id="edUrl"><\/div>/.test(src), 'props object hosts reordered: shapes + search on top');
assert(/const SHOW_MODEL_LIBRARY = false;/.test(src), 'hardcoded model library hidden behind a flag');
assert(/editorActive==='props' && !!editorTargets\.props\.obj\(\)/.test(src), 'gizmo only shows with an actual selection');

assert(/const MODE_ICON = \{/.test(src) && /edModeLbl/.test(src), 'mode tabs have SVG icons + labels');
assert(/b\.style\.opacity\s*=\s*on \? '1' : '0\.5'/.test(src), 'inactive tabs dimmed');
// Add-shape primitives: icons + plus, Props-only
assert(/const PRIM_ICON = \{/.test(src), 'primitive icons defined');
assert(/b\.innerHTML=\(PRIM_ICON\[src\]\|\|''\)\+'<span>\+ '\+label/.test(src), 'shape buttons show icon + "+ Label"');
assert(/shapesHost\.innerHTML='';\s*\n\s*if\(tgt\.addable && tgt\.urlField\)/.test(src), 'Add-shape limited to Props (addable + urlField)');
// Scene world split + sounds relocation
assert(/const subSec = \(title, key, collapsedDefault\)/.test(src), 'Scene world split into collapsible sub-sections');
assert(/subSec\('Movement'/.test(src) && /subSec\('Floor'/.test(src) && /subSec\('Audio'/.test(src), 'Scene has Movement/Floor/Audio sub-sections');
assert(/tgt===editorTargets\.gun\)\{   \/\/ per-weapon shoot sound/.test(src), 'per-weapon shoot sound on the weapon');
assert(/function renderFreesoundBrowser\(host, refresh, directTarget\)/.test(src), 'freesound browser supports a direct target');
done('editor mode switch');
