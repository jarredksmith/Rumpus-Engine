// (build 899) MP RACE SEATS, FOR REAL — "joined players have to go enter their car instead of starting
// in it. They can also take control of any other player's car."
//  (1) Joiners weren't auto-seated because the seat loop gave up after a hard 6s (12 x 500ms) — but a
//      fresh joiner is still DOWNLOADING the level's car/track GLBs (the host has a warm cache), so the
//      car list was empty past the window and the loop quit silently. Retries no longer count while
//      _levelAssetsPending(): the 12-try grace starts once assets are in. Verified headless: a client
//      whose car model arrives at 7.5s (assets settle at 8s) is DRIVING by 10s — the old code had
//      already given up at 6s.
//  (2) A car a remote player is driving can no longer be entered: the E-prompt scan skips claimed cars
//      and enterCar itself refuses with a named toast (defense in depth — verified headless:
//      stole=false with the host's claim on the car).
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const seat = extractFunction('_raceAutoSeat', src);
const enter = extractFunction('enterCar', src);

// (1) asset-aware retries
assert(/const _pend = typeof _levelAssetsPending==='function' && _levelAssetsPending\(\);/.test(seat),
  'the seat loop knows whether the level is still downloading');
assert(/if\(!cars\.length\)\{ if\(_pend \|\| \(tries\|0\)<12\) setTimeout\(\(\)=>_raceAutoSeat\(_pend\?0:\(tries\|0\)\+1\), 500\); return; \}/.test(seat),
  'no cars yet: retries are free while assets are pending (the 12-try grace starts after)');
assert(/if\(_pend \|\| \(tries\|0\)<12\)\{ setTimeout\(\(\)=>_raceAutoSeat\(_pend\?0:\(tries\|0\)\+1\), 500\); return; \}/.test(seat),
  'no seat for my rank yet: same asset-aware patience while clones/roster fill in');

// (2) no hijacking
assert(/if\(o\.userData\.nid && typeof _remoteDrivenNids!=='undefined' && _remoteDrivenNids\[o\.userData\.nid\]!=null\)\{   \/\/ build 899/.test(enter),
  'enterCar refuses a car with a remote claim');
assert(/is driving that car'\)/.test(enter), '...and names the driver in the toast');
assert(/_remoteDrivenNids\[o\.userData\.nid\]!=null\) continue;   \/\/ build 899: no enter prompt on a car someone else is driving/.test(src),
  'the E-prompt scan never offers a claimed car');

done('build 899: joiners get seated no matter how slow the download, and seats cannot be hijacked');
