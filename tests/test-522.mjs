import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 674: the radial build-menu editor gains (1) a per-slot Poly Pizza / Sketchfab model search (reusing the
// shared renderModelSearch browser) and (2) a click-to-pick icon palette (RADIAL_ICONS) instead of a bare text field.

// --- a prebuilt icon palette exists and parses to a set of glyphs ---
const m = src.match(/const RADIAL_ICONS = \[([\s\S]*?)\n\];/);
assert(!!m, 'RADIAL_ICONS palette is defined');
const ICONS = (new Function('return ['+m[1]+'];'))();
assert(Array.isArray(ICONS) && ICONS.length>=48, 'the palette has a large set of icons ('+ICONS.length+')');
assert(ICONS.every(g=>typeof g==='string' && g.length>0), 'every palette entry is a glyph');
// no raw surrogate-pair emoji left literally in the source block (must be \uXXXX-escaped like the rest of the file)
assert(!/[\uD800-\uDBFF]/.test(m[1]), 'the palette source uses escaped code units, not raw astral glyphs');

// --- the editor panel wires the per-slot model search + the icon picker ---
const panel = extractFunction('renderBuildMenuPanel');
assert(/Search Poly Pizza \/ Sketchfab/.test(panel), 'each custom-model slot has a search button');
assert(/renderModelSearch\(sBox, \(m,st\)=>\{[\s\S]*?s\.src=m\.glb; u\.value=m\.glb;/.test(panel), 'picking a search result sets the slot src + URL field');
assert(/for\(const g of RADIAL_ICONS\)\{/.test(panel), 'the icon palette grid is built from RADIAL_ICONS');
assert(/b\.onclick=\(\)=>\{ touch\(\); s\.icon=g; ic\.value=g; markIcons\(\); \}/.test(panel), 'clicking a palette icon sets the slot icon');
assert(/pickBtn\.onclick=\(\)=>\{ const open=grid\.style\.display!=='none';/.test(panel), 'an Icons button toggles the palette');

// --- the per-slot search reuses the shared model browser (Poly Pizza + Sketchfab via its source bar) ---
const rms = extractFunction('renderModelSearch');
assert(/_modelSourceBar\(host,/.test(rms) && /renderSketchfabSearch\(body, onPick\)/.test(rms) && /renderModelSearchPP\(body, onPick, opts\)/.test(rms),
  'renderModelSearch offers both Poly Pizza and Sketchfab');

done('build 674: radial editor — per-slot model search + icon palette');
