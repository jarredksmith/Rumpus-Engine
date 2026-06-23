import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 665: per-level HUD customization — a new "HUD" editor mode lets creators theme the HUD (accent + health
// + score colours, UI/display fonts, panel shape & background opacity, border) and toggle which elements show in
// play (minimap, score, wave, ammo, health, crosshair, kill feed). Serialized with the level; applied scoped to
// #hud so it never restyles the editor or menus.

// --- config + sanitize (executable) ---
const _sanitizeHud = new Function('HUD_TOGGLES','HUD_FONTS','DEFAULT_HUD', extractFunction('_sanitizeHud') + '; return _sanitizeHud;')(
  ['minimap','score','wave','ammo','health','crosshair','killfeed'],
  ['Chakra Petch','Orbitron','VT323'],
  { accent:'#38f5b5', health:'#ff4d6d', score:'#ffd166', uiFont:'Chakra Petch', displayFont:'Chakra Petch', shape:'angular', panelOp:1, border:true, hide:{} }
);
{
  const d = _sanitizeHud(undefined);
  eq(d.accent,'#38f5b5','blank -> default accent'); eq(d.shape,'angular','default shape'); eq(d.border,true,'border on by default'); eq(d.panelOp,1,'opacity full by default');
  for(const k of ['minimap','score','wave','ammo','health','crosshair','killfeed']) eq(d.hide[k],false,'everything visible by default: '+k);
  eq(_sanitizeHud({accent:'not-a-color'}).accent,'#38f5b5','bad colour falls back');
  eq(_sanitizeHud({accent:'#abcdef'}).accent,'#abcdef','valid colour kept');
  eq(_sanitizeHud({uiFont:'Comic Sans'}).uiFont,'Chakra Petch','unknown font falls back to a loaded one');
  eq(_sanitizeHud({uiFont:'Orbitron'}).uiFont,'Orbitron','a loaded font is kept');
  eq(_sanitizeHud({shape:'bogus'}).shape,'angular','unknown shape falls back');
  eq(_sanitizeHud({shape:'rounded'}).shape,'rounded','a valid shape is kept');
  eq(_sanitizeHud({panelOp:5}).panelOp,1,'opacity clamped high'); eq(_sanitizeHud({panelOp:-2}).panelOp,0,'opacity clamped low'); eq(_sanitizeHud({panelOp:0}).panelOp,0,'zero opacity kept');
  eq(_sanitizeHud({border:false}).border,false,'border can be turned off');
  eq(_sanitizeHud({hide:{minimap:true}}).hide.minimap,true,'a hidden element round-trips');
}

// --- apply wiring (scoped to #hud + body classes) ---
const ah = extractFunction('applyHudCfg');
assert(/hud\.style\.setProperty\('--accent', c\.accent\)/.test(ah) && /hud\.style\.setProperty\('--accent-rgb', _hexToRgbTriplet\(c\.accent\)\)/.test(ah), 'accent drives the #hud accent vars (scoped, not global)');
assert(/hud\.style\.setProperty\('--hud-health', c\.health\)/.test(ah) && /hud\.style\.setProperty\('--hud-score', c\.score\)/.test(ah), 'health + score colours applied');
assert(/hud\.style\.setProperty\('--hud-font'/.test(ah) && /hud\.style\.setProperty\('--hud-display-font'/.test(ah), 'fonts applied');
assert(/body\.classList\.toggle\('hud-shape-'\+s, c\.shape===s\)/.test(ah), 'panel shape via a body class');
assert(/body\.classList\.toggle\('hud-noborder', !c\.border\)/.test(ah), 'border toggle via a body class');
assert(/body\.classList\.toggle\('hud-hide-'\+k, !!\(c\.hide && c\.hide\[k\]\)\)/.test(ah), 'per-element visibility via body classes');

// --- CSS hooks exist (in the markup/style) ---
assert(/body\.hud-hide-minimap #minimap, body\.hud-hide-score #score/.test(html), 'visibility CSS hides the chosen elements');
assert(/body\.hud-shape-rounded #hud \.panel \{ border-radius: 12px; \}/.test(html), 'rounded shape restyles the panels');
assert(/rgba\(8,18,22,calc\(\.82\*var\(--hud-panel-op,1\)\)\)/.test(html), 'panel background opacity is var-driven');
assert(/#hud #hpFill \{ background: var\(--hud-health/.test(html), 'health colour recolours the integrity bar');
assert(/#hud \{ font-family: var\(--hud-font/.test(html), 'HUD font is scoped to #hud');

// --- editor mode integration ---
assert(/const EDITOR_MODES = \['build','scene','player','enemies','rules','kit','hud','files'\];/.test(src), 'HUD is its own editor mode');
assert(/hud:'HUD'/.test(src) && /hud:'#5eead4'/.test(src), 'it has a label + accent');
assert(/MODE_SECTIONS = \{[\s\S]*?hud:     \['hud'\]/.test(src), 'the HUD mode owns the hud section');
assert(/sec\('HUD', 'hud', '<div id="edHud"><\/div>'\)/.test(src), 'the HUD section is registered');
assert(/function renderHudPanel\(\)\{/.test(src), 'the HUD editor panel renderer exists');
assert(/document\.body\.classList\.toggle\('hudPreview', editorMode==='hud'\)/.test(src), 'entering HUD mode live-previews the real HUD');

// --- serialize + restore (both load paths) ---
assert(/hud: _sanitizeHud\(hudCfg\)/.test(src), 'serialized with the level');
assert((src.match(/hudCfg = _sanitizeHud\(level\.hud\); if\(typeof applyHudCfg==='function'\) applyHudCfg\(\)/g)||[]).length===2, 'restored + applied in both load paths');

done('build 665: per-level HUD customization (theme + visibility)');
