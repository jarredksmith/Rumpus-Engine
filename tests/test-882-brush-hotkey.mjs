// (build 882) B TOGGLES THE TERRAIN BRUSH — "Can you make a toggle for the brush tool? Maybe 'b'?"
// Editor-only, mirroring the F/T view-key pattern: guarded against typing in text fields, consumed so
// it can't double as movement, and driving's B-handbrake is untouched (the editor exits the car).
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

const block = src.match(/if\(editorOpen && !e\.repeat && e\.code==='KeyB' && !e\.ctrlKey && !e\.metaKey && !e\.altKey && !e\.shiftKey\)\{[\s\S]{0,700}?\n  \}/);
assert(!!block, 'the B keybind exists, editor-gated with the same modifier guards as F/T');
const b = block ? block[0] : '';
assert(/const tag = \(e\.target && e\.target\.tagName\) \|\| '';\s*\n\s*if\(tag!=='INPUT' && tag!=='TEXTAREA'\)\{/.test(b), 'typing a B into a name/search field never toggles the brush');
assert(/terrainBrush\.on = !terrainBrush\.on;/.test(b), 'it toggles the brush');
assert(/renderEditorFields\(\)/.test(b), 'the panel re-renders so the checkbox + controls follow');
assert(/toast\(terrainBrush\.on \? \('Brush on \\u2014 '\+terrainBrush\.mode\+' \(B toggles\)'\) : 'Brush off'\)/.test(b), 'a toast confirms, naming the active mode');
assert(/keys\['KeyB'\]=false;/.test(b) && /e\.preventDefault\(\);/.test(b), 'the keypress is consumed');
// placement: inside the editor-key section of the keydown handler, adjacent to F/T
const ftAt = src.indexOf("(e.code==='KeyF' || e.code==='KeyT')");
const bAt = src.indexOf("e.code==='KeyB' && !e.ctrlKey");
assert(ftAt > -1 && bAt > ftAt && bAt - ftAt < 2500, 'lives beside the other editor view keys');
// the handbrake binding is untouched
assert(/keys\[BINDS\.jump\]\|\|keys\['KeyB'\]/.test(src), "driving's B-handbrake still works in play (jump bind, build 910)");
// the panel label teaches the key
assert(/drag the floor \\u00b7 B toggles/.test(src), 'the checkbox label mentions the hotkey');

done('build 882: B toggles the terrain brush in the editor — guarded, consumed, discoverable');
