import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 653: the three weapon-FX panels (bullet impacts / tracer / crosshair) were three flat sections in
// Weapons mode. They're now grouped under ONE "Effects" section with a segmented type picker — the same
// treatment the placeable Zones got in build 649. The render functions + host divs are reused unchanged.

// --- one grouped section owns all three FX hosts ---
assert(/sec\('Effects', 'wepfx',/.test(src), 'a single Effects section is registered');
for(const id of ['edImpactFx','edTracerFx','edCrosshair'])
  assert(new RegExp('id="'+id+'" class="wepfxHost"').test(src), id+' host lives inside the grouped Effects section');
assert(/id="edWepFxPicker"/.test(src), 'the Effects section has a type picker host');

// --- Weapons mode lists object + transform + the grouped picker ---
assert(/kit:\s*\['object','transform','wepfx'\]/.test(src), 'Weapons mode collapsed 3 FX sections into 1');

// --- picker state + the two helpers, mirroring the Zones picker ---
assert(/const WEPFX_TYPES = \[\['impactfx'/.test(src), 'WEPFX_TYPES drives the segmented picker');
assert(/const WEPFX_HOST = \{ impactfx:'edImpactFx'/.test(src), 'WEPFX_HOST maps a type to its panel host');
assert(/let activeWepFx = 'impactfx';/.test(src), 'the active FX panel is tracked');
assert(/localStorage\.getItem\('breach_editor_wepfx'\)/.test(src), 'the choice persists across sessions');
assert(/function applyWepFxVisibility\(\)/.test(src), 'applyWepFxVisibility exists');
assert(/el\.style\.display = \(k===activeWepFx\)\?'':'none';/.test(src), 'only the active FX host is shown');
assert(/function renderWepFxPicker\(\)/.test(src), 'renderWepFxPicker builds the segmented control');
assert(/textContent=SEC_SUB\[activeWepFx\]/.test(src), 'the picker shows the active FX panel’s plain-language description');

// --- wired into the editor build ---
assert(/if\(typeof renderWepFxPicker==='function'\) renderWepFxPicker\(\);/.test(src), 'picker is rendered when the editor is built');
assert(/if\(typeof applyWepFxVisibility==='function'\) applyWepFxVisibility\(\);/.test(src), 'FX visibility is applied when the editor is built');

done('build 653: the 3 weapon-FX panels grouped under one Effects picker');
