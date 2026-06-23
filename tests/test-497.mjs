import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 645: placeable ladders — a vertical climb volume. W up / S down / jump off; at the top you step off in the
// ladder's facing. Authored in the editor (Scene > Ladders), serialized, and drives the ladder climb animations.

// --- data + detection ---
assert(/let ladders = \(savedLevel && Array\.isArray\(savedLevel\.ladders\)\)/.test(src), 'ladders load from the saved level');
assert(/function ladderAt\(x, z, feetY\)\{/.test(src), 'a ladderAt() volume test exists');
const ladderAt = new Function('ladders', extractFunction('ladderAt') + '; return ladderAt;')([{ x:0, z:0, r:1, y:0, h:4 }]);
assert(ladderAt(0, 0, 2), 'inside the column at mid-height -> on the ladder');
assert(ladderAt(0.5, 0, 0), 'within the radius at the base -> on the ladder');
assert(!ladderAt(3, 0, 2), 'outside the radius -> not on the ladder');
assert(!ladderAt(0, 0, 9), 'above the top of the climb -> not on the ladder');

// --- climbing wiring ---
assert(/else if\(_onLadder && _ladder\)\{/.test(src), 'the movement loop has a ladder-climb branch');
assert(/_climbAnim = climb>0\?'ladderUp':\(climb<0\?'ladderDown':'ladderIdle'\);/.test(src), 'W/S drive the ladder up/down/idle animations');
assert(/player\.pos\.y \+= climb\*CLIMB_SPEED\*dt;/.test(src), 'you move vertically at CLIMB_SPEED');
assert(/if\(_jPressed\)\{ player\.vel\.y=JUMP\*0\.7;[\s\S]*?_onLadder=false;/.test(src), 'jump hops you off the ladder');
assert(/_fy>=top-0\.05\)\{[\s\S]*?player\.onGround=true; _onLadder=false/.test(src), 'reaching the top steps you off onto the ledge');

// --- editor + persistence ---
assert(/function addLadder\(\)/.test(src) && /function renderLaddersPanel\(\)/.test(src), 'editor add + panel');
assert(/sec\('Zones', 'zones',/.test(src) && /id="edLadders" class="zoneHost" data-zone="ladders"/.test(src), 'Ladders host registered under the grouped Zones section (build 649)');
assert(/scene:   \['world','generate','zones'\]/.test(src), 'the grouped Zones section (incl. ladders) shows in Scene mode');
assert(/ladders: ladders\.map\(L=>\(\{ x:\+L\.x, z:\+L\.z, r:\(\+L\.r\|\|1\), y:\(\+L\.y\|\|0\), h:\(L\.h!=null\?\+L\.h:4\), face:\(\+L\.face\|\|0\) \}\)\)/.test(src), 'serialized with the level');
assert((src.match(/ladders = Array\.isArray\(level\.ladders\) \? level\.ladders\.map\(_migrateLadder\) : \[\]/g)||[]).length===2, 'restored in both load paths');
assert(/editorActive==='ladders'\){ return \(selLadder>=0/.test(src), 'the move gizmo targets the selected ladder');

done('placeable ladders: climb volume + editor + serialize + climb animations (build 645)');
