// (build 1004) LOBBY KEYBOARD FLOW + platform hints — the piece deferred from the 1002 reskin
// (hints were withheld until the keys were real). Enter = READY (client) / START (host), Esc =
// leave behind a confirm; the hint line states exactly that, and only on keyboard platforms.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

assert(/<div id="lobbyKeys" class="mpHint"/.test(html), 'the hint line lives under the actions (pinned step markup untouched)');
assert(/function _lobbyKeysHint\(\)\{/.test(src), 'one shared hint helper');
assert(/\(typeof isTouch!=='undefined' && isTouch\) \? '' :/.test(src),
  'touch shows NO hint — its buttons are the interface (never hints for keys that are not there)');
assert(/NET\.mode==='host' \? 'Enter \\u2014 start \\u00b7 Esc \\u2014 leave' : 'Enter \\u2014 ready \\u00b7 Esc \\u2014 leave'/.test(src),
  'host and client hints match what Enter actually does for each');
// the handler: active only while the lobby shows, with the three guards
assert(/const lb=document\.getElementById\('lobby'\); if\(!lb \|\| lb\.classList\.contains\('hidden'\)\) return;/.test(src),
  'keys only act while the lobby is open');
assert(/const cs=document\.getElementById\('charSelect'\); if\(cs && cs\.classList\.contains\('open'\)\) return;/.test(src),
  'the character select above the lobby owns its own keys');
assert(/const ae=document\.activeElement; if\(ae && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(ae\.tagName\)\) return;/.test(src),
  'typing in the bot-count field never triggers ready/start');
assert(/if\(NET\.mode==='host'\)\{ if\(typeof startMatch==='function'\) startMatch\(\); \}\s*\n\s*else if\(typeof setReady==='function'\) setReady\(!_imReady\);/.test(src),
  'Enter starts (host) or toggles ready (client) — the same functions the buttons call');
assert(/uiConfirm\('Leave the lobby\?', \(\)=>\{ unannounceRoom\(\); location\.reload\(\); \}, 'Leave'\);/.test(src),
  'Esc leaves behind a confirm, through the same path as the Leave button');
assert(/updateCharBtnLabel\(\); _lobbyKeysHint\(\); _applyLobbyBg\(lobbyBgUrl\); openModal\('lobby'\); refreshLobby\(\);/.test(src)
    && /updateCharBtnLabel\(\); _lobbyKeysHint\(\);\s*\n\s*openModal\('lobby'\);/.test(src),
  'both lobby entries (host + client) refresh the hint for their role');

done('build 1004: lobby keyboard flow — Enter ready/start, Esc leave, honest platform hints');
