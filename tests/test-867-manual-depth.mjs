// (build 867) THE MANUAL GOES DEEP — from a section-level map to a per-control reference. Sourced from a
// fresh sweep of the editor's own authored hint strings + the implementation:
//  - vehicle tuning explains the THREE separate handling systems (braking in driveStep, the latG cap +
//    traction circle, grip/drift/breakaway) and documents every field with defaults;
//  - per-enemy-type combat guide (sapper detonates even when killed, shieldbearer frontal soak, charger
//    wind-up), full weapon stats + the whole economy (attachments w/ costs, upgrade cards, shop);
//  - object folds control-by-control (incl. trailer towing via Joint), signals' advanced gates (sender
//    count, item gates, contact filters), inventory Use actions incl. place-in-the-world puzzles;
//  - cutscene shot table, Save-tab issues-panel validation list, MP mode rules + real bot-diff numbers;
//  - water/waterfall/weather/lighting tables shipped in part 1.
import { assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
const man = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// the handling truth is documented, not hand-waved
for(const s of ['three separate systems', 'traction circle', 'never drops below 35%', 'ABS-like ease-off',
                'counter-steering recovers grip'])
  assert(man.includes(s), 'handling deep-dive covers: '+s);

// per-enemy tactics from the actual AI
for(const s of ['detonates</b>', 'also when killed', '~18% damage', 'telegraphs a wind-up', 'strafing sideways'])
  assert(man.toLowerCase().includes(s.toLowerCase()), 'enemy guide covers: '+s);

// economy: attachments with costs, upgrade cards, shop
for(const s of ['Drum ◆340', 'Vampiric Rounds', 'Overshield ◆100', '95 ms auto'])
  assert(man.includes(s), 'economy covers: '+s);

// folds + signals gates + inventory use actions
for(const s of ['towed trailers', 'Trailer tracking', 'different senders', 'Needs item', 'Place in the world',
                'fetch-and-place puzzles', 'chain-reacts nearby explosives'])
  assert(man.toLowerCase().includes(s.toLowerCase()), 'folds/signals/inventory cover: '+s);

// per-objective fine print + MP truth
for(const s of ['pauses</i> while nobody stands in it', 'First to 5 kills', 'holding the zone', 'Elite'])
  assert(man.includes(s), 'objectives/MP cover: '+s);

// save-tab validation list + cutscene shot table
for(const s of ['orphaned keys', 'fewer than 2 waypoints', 'Rack focus', 'hold + duration + hold'])
  assert(man.includes(s), 'save/cutscenes cover: '+s);

// depth metric: the manual is now a real reference (tables + size)
assert((man.match(/<table>/g)||[]).length >= 20, 'at least 20 reference tables (got '+(man.match(/<table>/g)||[]).length+')');
assert(man.length > 60000, 'the manual is a deep reference, not a pamphlet ('+man.length+' bytes)');

done('build 867: the manual documents every control — what it is, how to use it — from source-of-truth hints');
