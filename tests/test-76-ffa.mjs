// (build 111) Free-for-all: the duel PvP engine generalized to N players via pvpMode(), plus a live
// scoreboard, an FFA lobby option, and mode-aware HUD/result text. Duel behavior is unchanged.
import { gameSource, html, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// shared pvp gate
const pm = extractFunction('pvpMode');
assert(/NET\.gameMode==='duel' \|\| NET\.gameMode==='ffa'/.test(pm), 'pvpMode covers duel + ffa');
assert(/function pvpLabel/.test(src), 'pvpLabel exists');

// the duel gates now use pvpMode (sample the key ones)
assert(/const duelMode = pvpMode\(\);/.test(src), 'shoot/loop use pvpMode');
assert(/if\(pvpMode\(\) && duelDead\)\{ wish\.set\(0,0,0\)/.test(src), 'movement freeze uses pvpMode');
assert(/if\(!editorOpen && pvpMode\(\)\)\{/.test(src), 'editor lockout uses pvpMode');
assert(/if\(pvpMode\(\)\) credits = 150;/.test(src), 'starting stipend uses pvpMode');
assert(/if\(pvpMode\(\)\)\{\n    \/\/ PvP \(duel \/ free-for-all\)/.test(src), 'deploy block uses pvpMode');
assert(/if\(pvpMode\(\)\) NET\.duelScore\[conn\._pid\]/.test(src), 'host inits score for pvp joiners');
assert(/if\(pvpMode\(\)\) broadcastDuelScore\(\);/.test(src), 'host broadcasts score for pvp joiners');

// scoreboard
const sb = extractFunction('renderScoreboard');
assert(/if\(!pvpMode\(\) \|\| !gameOn\)/.test(sb), 'scoreboard only shows in a live pvp match');
assert(/rows\.sort\(\(a,b\)=> b\.k-a\.k/.test(extractFunction('_sbRows')), 'sorted by kills (build 1005: row collection factored into _sbRows, shared with the result ceremony)');
assert(/const rows=_sbRows\(\);/.test(sb), 'the scoreboard renders the shared ranked rows');
assert(/if\(sig===_sbSig\)/.test(sb), 'cached so it does not rebuild every frame');
assert(/renderScoreboard\(\);/.test(extractFunction('duelHUD')), 'duelHUD drives the scoreboard');

// ffa hud + result text
assert(/wn\.textContent='FFA  '\+me\+'  \/'\+NET\.killTarget;/.test(src), 'ffa HUD line');
assert(/pvpLabel\(\)\+' TO '\+NET\.killTarget\+' KILLS'/.test(src), 'result subtitle is mode-aware');

// lobby
assert(/id="mpFFA"/.test(html), 'FFA host button in the modal');
assert(/id="mpFFAKills"/.test(html), 'FFA kill-target input');
assert(/id="scoreboard"/.test(html), 'scoreboard element exists');
assert(/#scoreboard \{ display:none; position:fixed; top:206px; left:18px;/.test(html), 'scoreboard sits top-left under the minimap (clear of the top-right HUD)');
const ff = extractFunction('startFFA');
assert(/hostStart\(genRoomCode\(\), 'ffa', n\)/.test(ff), 'startFFA hosts an ffa room');
assert(/fb\.onclick=startFFA/.test(src), 'FFA button wired');
done('free-for-all + scoreboard');
