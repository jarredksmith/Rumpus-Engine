// (build 857) THE SKETCHFAB BADGE GETS ITS OWN ROW — appended inline to the meta line it wrapped
// mid-badge on narrow cards ("needs Sketchfab" / "token" split across two lines). It now renders as
// its own row under the meta line, with nowrap on the chip so it can never break internally.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
const gal = src.match(/async function renderCommunity[\s\S]{0,7000}/)[0];
assert(/white-space:nowrap/.test(gal), 'the chip cannot wrap internally');
assert(/bd\.appendChild\(chip\)/.test(gal) && /if\(bd\) info\.appendChild\(bd\);/.test(gal), 'the badge is its own row under the meta line');
assert(!/meta\.appendChild\(bd\)/.test(gal), 'no longer appended inline to the meta line');
done('build 857: the Sketchfab badge sits on its own non-wrapping row');
