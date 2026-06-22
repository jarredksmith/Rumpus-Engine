import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 588: testing helpers for the credit economy (console giveCredits + a dev-gated in-loadout button).
assert(/window\.giveCredits = function\(n\)\{/.test(src) && /credits = Math\.max\(0, credits \+ n\)/.test(src), 'giveCredits adds to credits (clamped >= 0)');
assert(/if\(typeof updateHUD==='function'\) updateHUD\(\)/.test(src.slice(src.indexOf('window.giveCredits'))), 'giveCredits refreshes the HUD');
assert(/window\.devMode = function\(on\)\{/.test(src) && /localStorage\.setItem\('breach_dev','1'\)/.test(src), 'devMode toggles + persists the dev flag');
assert(/localStorage\.getItem\('breach_dev'\)==='1'/.test(src), 'the loadout reads the dev flag');
assert(/id="devGive"/.test(src) && /\+1000 test/.test(src), 'a +1000 test button exists, only rendered when dev mode is on');
assert(/_devOn\?'<button id="devGive"/.test(src), 'the test button is gated behind the dev flag (hidden from players)');
done('credit testing helpers: giveCredits() console fn + dev-gated +1000 button (build 588)');
