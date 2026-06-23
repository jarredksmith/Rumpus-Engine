import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 648: editor declutter — every section header gets a plain-language one-line subtitle so a first-time
// user knows what it does, and a few jargon titles were renamed. Subtitles live in a SEC_SUB map keyed by the
// section's data-sec key (so renaming a display title can't desync them) and are injected under each header.

// --- the subtitle map exists and covers the confusable sections ---
const m = src.match(/const SEC_SUB = \{([\s\S]*?)\};/);
assert(m, 'SEC_SUB map is declared');
const body = m[1];
for(const k of ['gizmo','object','material','transform','world','generate','enemies','boltfx','game','pickups','loot','invitems','audiozones','deathzones','jumppads','ladders','firezones','impactfx','tracerfx','crosshair','characters','levelfile','campaign']){
  assert(new RegExp('\\b'+k+':').test(body), 'SEC_SUB has a subtitle for "'+k+'"');
}
// the three lookalike sections each get a disambiguating subtitle
assert(/pickups:\s*'Pads that grant/.test(body), 'Pickups subtitle distinguishes it');
assert(/loot:\s*'What enemies and crates drop/.test(body), 'Loot subtitle distinguishes it');
assert(/invitems:\s*'Define carryable items/.test(body), 'Inventory-items subtitle distinguishes it');

// --- the subtitle is injected as a sibling before the render hosts (so renders don't wipe it) ---
assert(/const subTxt = SEC_SUB\[k\];/.test(src), 'subtitle text pulled from the map by section key');
assert(/body\.insertBefore\(sub, body\.firstChild\)/.test(src), 'subtitle prepended into the section body');
assert(/!body\.querySelector\('\.edSecSub'\)/.test(src), 'guarded so it is only injected once');
assert(/#editor \.edSecSub \{/.test(html), 'edSecSub has its own muted style');

// --- jargon titles renamed (these titles are not pinned elsewhere) ---
assert(/sec\('Handles', 'gizmo'/.test(src), 'Gizmo -> Handles');
assert(/sec\('Environment', 'world'/.test(src), 'World section -> Environment (no longer clashes with the World mode)');
assert(/sec\('Waves &amp; objectives', 'game'/.test(src), 'Game / waves -> Waves & objectives');
// build 653: Impact/Tracer/Crosshair were regrouped under one Effects picker, so their plain-language
// descriptions now live in the picker (via SEC_SUB) rather than standalone section titles.
assert(/sec\('Effects', 'wepfx'/.test(src), 'the three weapon-FX panels are grouped under one Effects section');

// the World MODE label is untouched (only the section title changed)
assert(/scene:'World'/.test(src), 'the World mode label is unchanged');

done('build 648: per-section subtitles + plain-language titles');
