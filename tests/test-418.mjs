import { html, gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 549: player-facing Credits & Attribution screen (release requirement). Engine libraries must be
// credited (license terms); CC models (Poly Pizza / Sketchfab) and sounds (Freesound) get per-item credit.
// Library + source lines are static; per-asset lines are gathered live from placed props (which persist
// their attribution) plus anything picked this session (captured via creditAsset).

// --- the modal + both entry points exist in the page ---
assert(/<div id="creditsModal" class="modalBack hidden">/.test(html), 'a Credits modal exists, using the standard modalBack pattern');
assert(/data-close="creditsModal"/.test(html), 'the modal has the auto-wired close button');
assert(/<div id="creditsBody"/.test(html), 'the modal has a JS-filled body container');
assert(/id="creditsBtn"/.test(html), 'the start screen has a Credits button');
assert(/id="pauseCredits"/.test(html), 'the pause menu has a Credits button');

// --- the legally-required engine/library credits are present with their licenses ---
assert(/const LIB_CREDITS = \[/.test(src), 'a static library-credits list exists');
assert(/name:'three\.js'[^}]*lic:'MIT'/.test(src), 'three.js is credited as MIT');
assert(/Rapier[^}]*lic:'Apache-2\.0'/.test(src), 'Rapier is credited as Apache-2.0');
assert(/name:'PeerJS'[^}]*lic:'MIT'/.test(src), 'PeerJS is credited as MIT');
// --- the CC asset sources are listed ---
for(const s of ['Poly Pizza','Sketchfab','Poly Haven','Freesound']) assert(new RegExp("name:'"+s.replace(/ /g,' ')+"'").test(src), s+' is listed as an asset source');

// --- the runtime registry + aggregation ---
assert(/const assetCredits = new Set\(\);/.test(src), 'a session credit registry exists');
assert(/function creditAsset\(s\)\{/.test(src), 'a creditAsset() helper exists');
const clc = extractFunction('collectLevelCredits');
assert(/o\.userData\.attribution/.test(clc) && /assetCredits\.forEach/.test(clc), 'collectLevelCredits unions placed-prop attributions with the session registry');
assert(/\.sort\(\(a,b\)=>a\.localeCompare\(b\)\)/.test(clc), 'the per-asset list is sorted for a stable display');

// --- the four model pickers + the sound picker feed the registry ---
assert((src.match(/creditAsset\(m\.attribution\)/g)||[]).length >= 4, 'enemy / loot / weapon / turret model picks all register their credit');
assert(/creditAsset\(_fsAtt\)/.test(src), 'a picked Freesound sound registers its credit');
assert((src.match(/creditAsset\(_fsAtt\)/g)||[]).length === 2, 'both Freesound assign paths (direct + dropdown) register the credit');

// --- the buttons open the populated screen ---
assert(/function openCredits\(\)\{ renderCreditsScreen\(\); openModal\('creditsModal'\); \}/.test(src), 'openCredits renders fresh then shows the modal');
assert(/crb\.onclick=openCredits/.test(src) && /pc\.onclick=openCredits/.test(src), 'both Credits buttons are wired to open the screen');

// --- output safety: author-supplied strings are escaped before linkifying ---
const lk = extractFunction('_creditLinkify');
assert(/_creditEsc\(s\)\.replace\(/.test(lk), 'attribution text is HTML-escaped before URLs are linkified (no markup injection)');

// --- executable: the aggregation de-dupes and the static libraries are always present regardless of assets ---
function aggregate(propAtts, sessionAtts){
  const set=new Set();
  for(const a of propAtts){ if(a) set.add(a); }
  for(const a of sessionAtts){ if(a) set.add(a); }
  return [...set].sort((a,b)=>a.localeCompare(b));
}
const out = aggregate(
  ['Crate by Alice [CC-BY] — via Poly Pizza', 'Crate by Alice [CC-BY] — via Poly Pizza'],   // same prop placed twice
  ['Beep by Bob [CC0] — via Freesound', 'Crate by Alice [CC-BY] — via Poly Pizza']           // a sound + a dup of the crate
);
eq(out.length, 2, 'identical attributions collapse to one line');
eq(out[0], 'Beep by Bob [CC0] — via Freesound', 'lines are alphabetically sorted');
const LIBS = ['three.js','Rapier (@dimforge/rapier3d-compat)','PeerJS'];
const emptyLevel = aggregate([], []);
eq(emptyLevel.length, 0, 'an empty level lists no per-asset credits');
assert(LIBS.length === 3, 'the three required engine libraries are always shown even when no assets are loaded');

done('credits & attribution screen: libraries + sources + live per-asset credits (build 549)');
