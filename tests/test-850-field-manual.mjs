// (build 850) THE FIELD MANUAL EXISTS — breach-help.html had been a dead link since the first upload
// (the game always pointed at it, the file was never committed). Rebuilt as a full standalone reference:
//  - breach-help.html ships at the repo root (same directory as the game, relative link) and documents
//    every editor tab, the object folds, racing, vehicles, signals, pickups, objectives, cutscenes, MP;
//  - the home-menu Field manual button gets its own id (manualBtn) — it used to DUPLICATE id="helpBtn"
//    with Help & tutorials, so getElementById wired BOTH handlers to the first button and the real
//    Help & tutorials button was dead;
//  - the Help modal links to the manual ("Full field manual") so the deep reference is discoverable;
//  - wrong-key documentation fixed everywhere: top view is T (not V), the gizmo is 1/2/3 (not W/E/R).
import { gameSource, html, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// the manual ships and is substantial
assert(manual.length > 20000, 'breach-help.html is a real manual, not a stub');
assert(/<title>RUMPUS ENGINE — Field Manual<\/title>/.test(manual), 'titled (Rumpus Engine since build 952)');
for(const id of ['start','controls','editor','tab-build','folds','tab-world','tab-player','tab-enemies',
                 'tab-gameplay','tab-weapons','tab-hud','tab-save','racing','vehicles','signals',
                 'pickups','objectives','cutscenes','multiplayer','sharing','faq'])
  assert(new RegExp('id="'+id+'"').test(manual), 'section #'+id+' exists');
assert(/href="breach\.html"/.test(manual), 'links back to the game (relative — works on any host)');
assert(!/jarredksmith\.github\.io/.test(manual), 'no absolute self-URLs inside the manual');

// it documents the current systems, not a stale snapshot
for(const s of ['Close loop','Ghost lap','Rival pace','Bank L','Cornering grip','Waypoint path',
                'On object placed','Set checkpoint','Consume key on unlock','Rack focus','KING OF THE HILL'])
  assert(manual.toLowerCase().includes(s.toLowerCase()), 'manual covers: '+s);
// ...and teaches the REAL keys
assert(/<kbd>T<\/kbd>/.test(manual) && /Top-down view/i.test(manual), 'T = top view documented');
assert(!/W\/E\/R/.test(manual), 'the never-true W/E/R gizmo claim is gone');

// game wiring: unique ids, both buttons live
assert((html.match(/id="helpBtn"/g)||[]).length === 1, 'exactly ONE id="helpBtn" (the duplicate is gone)');
assert((html.match(/id="manualBtn"/g)||[]).length === 1, 'the Field manual button has its own id');
assert(/manualBtn'\); if\(hb\) hb\.onclick=\(\)=>\{ try\{ window\.open\('breach-help\.html','_blank'\)/.test(src), 'Field manual button opens the manual');
assert(/const hlb=document\.getElementById\('helpBtn'\); if\(hlb\) hlb\.onclick=openHelp;/.test(src), 'Help & tutorials keeps its own handler');
assert(/Full field manual/.test(src) && /window\.open\('breach-help\.html','_blank'\)/.test(src), 'the Help modal links to the manual too');

// in-game key text is truthful now
assert(/<code>T<\/code> top-down view/.test(src), 'editor tour: T for top view');
assert(/<code>1\/2\/3<\/code> move\/rotate\/scale gizmo/.test(src), 'editor tour: 1/2/3 for the gizmo');
assert(!/<code>V<\/code> top-down view/.test(src) && !/press <code>V<\/code> for top-down/.test(src), 'no stale V-for-top-view claims');
assert(/top view<\/b> \(T\)/.test(src), 'track-builder header teaches T');

done('build 850: field manual rebuilt (breach-help.html) — dead link fixed, duplicate helpBtn id fixed, key docs truthful');
