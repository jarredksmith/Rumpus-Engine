// (build 842) SKETCHFAB TOKEN DEDUPE — the token input + Save + how-to hint rendered at the top of EVERY
// Sketchfab search box (props, enemies, pickups, chests, coins, turrets, attachments, inventory…). Now the
// full input shows only while NO token is saved (the first-run affordance); once one is saved it collapses
// to a one-line "Token saved · change" link that re-reveals the field on demand.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const fn = extractFunction('renderSketchfabSearch');

assert(/if\(sfGetToken\(\)\)\{/.test(fn), 'the collapse is gated on a saved token');
assert(/tRow\.style\.display='none'; tHint\.style\.display='none';/.test(fn), 'the input row + hint hide once a token exists');
assert(/Sketchfab token saved (?:·|\\u00b7) <a href="#"/.test(fn), 'a compact one-liner replaces them');
assert(/mini\.remove\(\); tRow\.style\.display='flex'; tHint\.style\.display='block'; tk\.focus\(\);/.test(fn), '"change" re-reveals the field and focuses it');
// the first-run path is intact: with no token the full input renders as before
assert(/tk\.placeholder='Sketchfab API token';/.test(fn) && /tb\.onclick=\(\)=>\{ sfSetToken\(tk\.value\);/.test(fn), 'first-run token entry unchanged');

done('build 842: the Sketchfab token field collapses to one line everywhere once saved');
