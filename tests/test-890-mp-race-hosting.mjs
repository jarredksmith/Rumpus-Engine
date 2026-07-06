// (build 890) MULTIPLAYER RACE HOSTING — "an option in multiplayer for hosting a race" + per-player
// auto-gridding. (1) The MP menu gains a Host race button that validates the loaded level FIRST
// (objective Race, a start line, at least one car) before opening the co-op room. (2) _raceAutoSeat
// loses its solo-only guard: in co-op races every authored car grids to a staggered slot (the same
// deterministic computation on every client), and each player seats into cars[their rank] by sorted
// participant id (host = 0). More players than cars -> retry while the roster fills, then spectate.
// Verified headless: host->car 0, client rank 2->car 2 with the full field gridded, overflow on foot,
// and the wrong-objective rejection message.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const seat = extractFunction('_raceAutoSeat', src);
const hostRace = extractFunction('startHostRace', src);

// ---- the menu option ----
assert(/<button id="mpHostRace" class="mpBtn coop"[^>]*>Host race<\/button>/.test(html), 'Host race button beside Host co-op');
assert(/const hr=document\.getElementById\('mpHostRace'\); if\(hr\) hr\.onclick=startHostRace;/.test(src), '...and wired');

// ---- validation before hosting ----
assert(/gameCfg\.objective==='race'/.test(hostRace), 'checks the objective');
assert(/TRACK_PIECES\[p\.userData\.src\] && TRACK_PIECES\[p\.userData\.src\]\.start/.test(hostRace), 'checks for a start line');
assert(/p\.userData\.vehicle && !p\.userData\.runtime/.test(hostRace), 'checks for a drivable car');
assert(/netStatus\('Not a race level yet/.test(hostRace), 'explains exactly what is missing instead of hosting a dud room');
assert(/carN===1[\s\S]{0,120}one car per racer/.test(hostRace), 'nudges toward one car per racer');
assert(/startHost\(\);\s*\n\}/.test(hostRace), 'a valid level hosts the normal co-op room (joiners get the level automatically)');

// ---- per-player gridding + seating ----
assert(/if\(mp && NET\.gameMode!=='coop'\) return;/.test(seat), 'duel/FFA rooms never auto-seat');
assert(/const pose=_racePathAt\(_racePath\.total-4-6\*Math\.floor\(i\/2\), \(i%2\)\?-2\.7:2\.7\);/.test(seat),
  'cars grid two-abreast in staggered rows — identical math on every client, so the field is consistent');
assert(/const ids=\[0, \+NET\.myId\]; for\(const k in NET\.players\) ids\.push\(\+k\);/.test(seat) && /const uniq=\[\.\.\.new Set\(ids\)\]\.sort\(\(a,b\)=>a-b\);/.test(seat),
  'participant order = sorted ids (host 0 first) — the same ranking everywhere');
assert(/const idx=uniq\.indexOf\(\+NET\.myId\);/.test(seat) && /car=cars\[idx\];/.test(seat), 'each player takes the car at their rank');
assert(/if\(idx>=cars\.length\)\{[\s\S]{0,300}setTimeout\(\(\)=>_raceAutoSeat\(\(tries\|0\)\+1\), 500\)/.test(seat),
  'a fresh joiner retries while the roster fills before declaring the grid full');
assert(/toast\('Grid full \\u2014 add more cars to the level to race more players'\)/.test(seat), 'grid-full players are told why they are on foot');
// solo behaviour unchanged: first car, same seat flow
assert(/let car=cars\[0\];/.test(seat), 'solo still takes the (pole-gridded) first car');
assert(/c\.userData\.carSpeed=0; c\.userData\.carVelY=0; c\.userData\.carPitch=0; c\.userData\.carRoll=0;/.test(seat), 'gridded cars start settled');

done('build 890: Host race validates then hosts; co-op races grid every player into their own car');
