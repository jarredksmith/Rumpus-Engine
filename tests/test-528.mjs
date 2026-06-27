import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 682: a new signal trigger — when:'contact' — fires when another physical prop is touching this prop (a box
// on a pressure plate) or sitting inside it (an item in a bin). Authoritative-side, edge-triggered; the actions reuse
// the existing per-action broadcasts. Optional 'from' tag filters which object counts; 'contain' switches touch->inside.

// --- the single-signal applier was factored out and is shared ---
assert(/function _applySignalAction\(s, src\)\{/.test(src), '_applySignalAction exists (takes the source for the distinct-sender gate)');
const fs = extractFunction('fireSignals');
assert(/if\(s\.when !== when\) continue;/.test(fs) && /_applySignalAction\(s, o\);/.test(fs), 'fireSignals checks the when + delegates to _applySignalAction with the source');

// --- contact detection ---
const cp = extractFunction('_contactObjectPresent');
assert(/_cBoxA\.setFromObject\(detector\)/.test(cp), 'the detector AABB is computed');
assert(/if\(!c\.userData \|\| !c\.userData\.phys\) continue;/.test(cp), 'only physical (dynamic) props can be placed');
assert(/if\(from && c\.userData\.tag !== from\) continue;/.test(cp), 'an optional tag filters which object counts');
assert(/if\(s\.contain\)\{ _cBoxB\.getCenter\(_cCtr\); if\(_cBoxA\.containsPoint\(_cCtr\)\) return true; \}/.test(cp), '"inside" mode tests the object centre');
assert(/else if\(_cBoxA\.intersectsBox\(_cBoxB\)\) return true;/.test(cp), '"touching" mode tests AABB overlap');

// --- the tick: host/solo only, throttled, edge-triggered (fires once per placement, re-arms on clear) ---
const tk = extractFunction('tickContactSignals');
assert(/if\(typeof NET!=='undefined' && NET\.mode==='client'\) return;/.test(tk), 'clients skip it (host/solo authors the fire)');
assert(/_contactAcc -= dt; if\(_contactAcc>0\) return; _contactAcc = 0\.12;/.test(tk), 'throttled, not every frame');
assert(/if\(hit && !s\._active\)\{ s\._active=true;[\s\S]*?_applySignalAction\(s, o\);[\s\S]*?\}/.test(tk), 'fires once on the rising edge, passing the detector as the source');
assert(/else if\(!hit && s\._active\)\{ s\._active=false; \}/.test(tk), 're-arms when the object is removed');
assert(/tickContactSignals\(dt\)/.test(src), 'the tick runs in the main loop');

// --- editor: contact option + sub-fields ---
const panel = extractFunction('buildSignalsUI');   // build 688: the signals editor is a shared function now
assert(/\['contact','On object placed'\]/.test(panel), 'the When dropdown offers "On object placed"');
assert(/if\(s\.when==='contact'\)\{/.test(panel), 'contact sub-fields are shown');
assert(/if\(v\) s\.from=v; else delete s\.from;/.test(panel), 'the object-tag filter is editable');
assert(/if\(mi\.value\) s\.contain=true; else delete s\.contain;/.test(panel), 'touching vs inside is editable');

// --- persistence (serialize + 3 restore paths) ---
assert(/if\(s\.from\) x\.f=s\.from; if\(s\.contain\) x\.ci=1;/.test(src), 'from/contain serialize');
assert((src.match(/if\(s\.f\) x\.from=s\.f; if\(s\.ci\) x\.contain=true;/g)||[]).length===3, 'from/contain restore in all three load paths');

done('build 682: contact / containment signal trigger (pressure plates, drop-in-bin)');
