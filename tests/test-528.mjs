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
assert(/if\(!c\.userData \|\| !\(c\.userData\.phys \|\| \(c\.userData\.xa && c\.userData\.xa\.on\)\)\) continue;/.test(cp), 'a placed dynamic prop OR a moving animated prop counts as the toucher (build 714)');
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

// --- build 735: "Needs N" on a contact detector counts N DISTINCT touchers (drop all 3 potions on the plate to win) ---
assert(/const need = Math\.max\(1, \+o\.userData\.sigNeed\|\|0\)\|\|1;|const need = Math\.max\(1, \+o\.userData\.sigNeed\|\|1\);/.test(tk), 'the detector\'s "Needs N" is read');
assert(/if\(need<=1\)\{/.test(tk), 'single-toucher path keeps the old edge-triggered behaviour');
const ct = extractFunction('_contactTouchers');
assert(/if\(from && c\.userData\.tag !== from\) continue;/.test(ct) && /if\(touch\) out\.push\(c\.userData\.nid \|\| c\.uuid\);/.test(ct), '_contactTouchers collects the distinct keys of all matching touchers');
assert(/const acc = s\._touchers \|\| \(s\._touchers = new Set\(\)\);/.test(tk) && /for\(const k of keys\) acc\.add\(k\);/.test(tk), 'distinct touchers accumulate in a Set (the same object placed twice still counts once)');
assert(/if\(acc\.size >= need\)\{ s\._fired=true;[\s\S]*?_applySignalAction\(s, o\);/.test(tk), 'fires only once N DIFFERENT objects have been placed, then latches');

// executable: 1 potion does not fire, 3 distinct potions do (and a re-touch of the same one does not advance)
{ const need=3; const acc=new Set(); const fire=keys=>{ for(const k of keys) acc.add(k); return acc.size>=need; };
  assert(fire(['p1'])===false, 'one potion is not enough');
  assert(fire(['p1'])===false, 'the same potion touching again does not advance the count');
  assert(fire(['p2'])===false, 'two distinct potions still not enough');
  assert(fire(['p3'])===true, 'the third distinct potion fires it'); }

// --- editor: contact option + sub-fields ---
const panel = extractFunction('buildSignalsUI');   // build 688: the signals editor is a shared function now
assert(/\['contact','On object placed'\]/.test(panel), 'the When dropdown offers "On object placed"');
assert(/if\(s\.when==='contact'\)\{/.test(panel), 'contact sub-fields are shown');
assert(/if\(v\) s\.from=v; else delete s\.from;/.test(panel), 'the object-tag filter is editable');
assert(/if\(mi\.value\) s\.contain=true; else delete s\.contain;/.test(panel), 'touching vs inside is editable');

// --- persistence (serialize + 3 restore paths) ---
assert(/if\(s\.from\) x\.f=s\.from; if\(s\.contain\) x\.ci=1;/.test(src), 'from/contain serialize');
assert((src.match(/if\(s\.f\) x\.from=s\.f; if\(s\.ci\) x\.contain=true;/g)||[]).length===3, 'from/contain restore in all three load paths');

// --- build 740: "Consume it" — the placed object vanishes when it lands on/in the detector ---
const cn = extractFunction('_consumeTouchers');
assert(/if\(touch\)\{ keys\.push\(c\.userData\.nid \|\| c\.uuid\); rm\.push\(i\); \}/.test(cn), '_consumeTouchers collects matching touchers + their keys');
assert(/for\(let j=rm\.length-1;j>=0;j--\)\{ try\{ if\(typeof removeProp==='function'\) removeProp\(rm\[j\]\); \}catch/.test(cn), 'it removes them high->low (indices stay valid) so they disappear');
assert(/if\(s\.consume\)\{ const keys=_consumeTouchers\(o, s\); if\(keys\.length\)\{ try\{ _applySignalAction\(s, o\);/.test(tk), 'single-toucher + Consume: each placement is removed and fires');
assert(/const keys = s\.consume \? _consumeTouchers\(o, s\) : _contactTouchers\(o, s\);/.test(tk), 'multi-toucher + Consume: distinct placements are consumed as they count toward N');
assert(/cc\.appendChild\(document\.createTextNode\('Consume it \(the placed object vanishes when it lands\)'\)\)/.test(panel), 'the editor exposes a Consume checkbox on contact signals');
assert(/if\(s\.consume\) x\.cn=1;/.test(src), 'consume serializes');
assert((src.match(/if\(s\.cn\) x\.consume=true;/g)||[]).length===3, 'consume restores in all three load paths');

done('build 682/735/740: contact signal trigger + Needs-N distinct touchers + Consume (vanish on placement)');
