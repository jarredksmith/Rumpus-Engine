// (build 857) THE SKETCHFAB BADGE GETS ITS OWN ROW — appended inline to the meta line it wrapped
// mid-badge on narrow cards ("needs Sketchfab" / "token" split across two lines). It now renders as
// its own row under the meta line, with nowrap on the chip so it can never break internally.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 1351: this slice was capped at 9,500 characters and broke when the gallery row gained a report
// button, with every assertion below still true — the character-budget trap CLAUDE.md records under
// build 1149, now for the seventh time this session. The slice is ANCHORED at both ends (a named
// function on each side), so the budget was never doing anything except expiring.
const gal = src.match(/async function renderCommunity[\s\S]*?\nasync function _commLoad/)[0];   // build 970: gallery spans three functions
assert(/white-space:nowrap/.test(gal), 'the chip cannot wrap internally');
assert(/bd\.appendChild\(chip\)/.test(gal) && /if\(bd\) info\.appendChild\(bd\);/.test(gal), 'the badge is its own row under the meta line');
assert(!/meta\.appendChild\(bd\)/.test(gal), 'no longer appended inline to the meta line');
done('build 857: the Sketchfab badge sits on its own non-wrapping row');
