import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 579: the host's START is gated on lobby readiness, with a deliberate two-press "start anyway" so a match
// never begins out from under a still-loading player by accident — but an AFK/unready client can't trap the host.

// --- run the REAL pure readiness summary ---
const ready = new Function('return ('+extractFunction('_lobbyReadyState')+')')();
eq(JSON.stringify(ready([{ready:true},{ready:true}])), JSON.stringify({all:true,waiting:0}), 'everyone ready -> all, 0 waiting');
eq(JSON.stringify(ready([{ready:true},{ready:false},{ready:false}])), JSON.stringify({all:false,waiting:2}), 'counts who is not ready');
eq(JSON.stringify(ready([{host:true,ready:true}])), JSON.stringify({all:true,waiting:0}), 'host-only lobby is startable (host counts as ready)');
eq(ready([]).all, true, 'empty roster is vacuously ready');

// --- gate wiring in startMatch ---
const sm = extractFunction('startMatch');
assert(/const st=_lobbyReadyState\(lobbyRoster\(\)\)/.test(sm), 'startMatch checks readiness');
assert(/if\(!st\.all\)/.test(sm) && /_startArmedT/.test(sm) && /now-_startArmedT>3000/.test(sm), 'unready lobby requires a second press within 3s');
assert(/START ANYWAY\?/.test(sm), 'the button arms to an explicit override label');
assert(/NET\.conns\[id\]\.send\(\{t:'begin'\}\)/.test(sm) && /startGame\(\)/.test(sm), 'a confirmed start still begins the match for everyone');
// the gate is in front of the begin/startGame — i.e. an unready first press returns before broadcasting begin
const guardIdx = sm.indexOf('if(!st.all)'), beginIdx = sm.indexOf("t:'begin'");
assert(guardIdx>=0 && beginIdx>guardIdx, 'readiness guard precedes the begin broadcast');

// --- the START button reflects readiness in the lobby render ---
const rl = extractFunction('renderLobby');
assert(/_lobbyReadyState\(roster\)/.test(rl) && /not ready/.test(rl), 'lobby render shows how many players are still not ready');

done('host START gated on lobby readiness, with a two-press override so the host is never trapped (build 579)');
