// (build 983) SAVE TAB OVERHAUL — the raw-JSON textarea (#edOut) and its "Copy code" button were a
// project-genesis holdover; removed (share links + Export .json + Publish replace it). The community
// publish, previously a plain button buried mid-list, is now a prominent accent CTA card at the top
// of the Save tab.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

// the JSON dump is gone
assert(!/id="edOut"/.test(src) && !/<textarea id="edOut"/.test(src), 'the raw-JSON textarea is removed');
assert(!/id="edCopy"/.test(src), 'the "Copy code" button is removed');
assert(!/function copyEditorCode/.test(src), 'the dead copyEditorCode function is removed');

// publish is a prominent CTA card at the top of the section
assert(/<div class="edPublishCard">'\s*\n?\s*\+\s*'<button id="edSubmitComm" class="edCTA">'/.test(src),
  'Publish is the first thing in the Save tab, inside a highlighted card');
assert(/#editor button\.edCTA \{ width:100%; background:linear-gradient\([^)]*rgba\(var\(--accent-rgb\)/.test(html),
  'the CTA is a filled accent button (unmissable)');
assert(/Publish to community/.test(src), 'clearer verb than "Submit to community library"');
assert(/No account needed/.test(src), 'the reassuring one-liner survives');

// the utilitarian buttons stay, just reorganized; share relabelled
assert(/id="edSave">'\+_icn\('save'\)\+'Save<\/button><button id="edShare">'\+_icn\('link'\)\+'Share link/.test(src),
  'Save + Share sit together on the first row');
assert(/id="edExport">/.test(src) && /id="edImport">/.test(src) && /id="edClear">/.test(src) && /id="edWipe"/.test(src),
  'export / import / clear / wipe are all still present');

// the share fallback no longer needs the removed textarea
assert(!/editorEl\.querySelector\('#edOut'\)/.test(src), 'nothing references the removed #edOut anymore');
assert(/uiPromptForm\('Your share link'/.test(src), 'a clipboard-blocked share link falls back to a selectable modal field');

done('build 983: Save tab — JSON dump gone, Publish is a prominent CTA');
