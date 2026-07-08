import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// state + DOM + keybind
assert(/let chatOpen=false;/.test(src), 'chatOpen state missing');
assert(/<div id="chatBox"><div id="chatLog"><\/div><input id="chatInput"/.test(html), 'chat DOM missing');
assert(/if\(e\.code===BINDS\.chat && NET\.mode!=='off' && gameOn/.test(src) && /chat:'KeyT'/.test(src), 'T keybind (rebindable) wired + gated to multiplayer + play');

// pause guard: releasing the lock for chat must NOT open the pause menu
assert(/&& !choosingUpgrade && !paused && !chatOpen && !mapOpen && !invOpen\) openPause\(\);/.test(src), 'pointerlock pause not guarded by chatOpen');

// send routing: host broadcasts to all conns; client sends to the host; always shows locally
const send = extractFunction('sendChat');
assert(/addChatLine\(nm, text, true\)/.test(send), 'sender does not echo its own line');
assert(/NET\.mode==='host'/.test(send) && /NET\.conns\[id\]\.send\(\{t:'chat', name:nm, text\}\)/.test(send), 'host does not broadcast chat');
assert(/NET\.mode==='client' && NET\.conn/.test(send) && /NET\.conn\.send\(\{t:'chat', text\}\)/.test(send), 'client does not send chat to host');

// open/close: releases + re-acquires pointer lock, clears held movement, focuses input
const open = extractFunction('openChat');
assert(/safeExitPointerLock\(\)/.test(open) && /clearMovementInput/.test(open) && /classList\.add\('chatOpen'\)/.test(open), 'openChat wiring incomplete');
const close = extractFunction('closeChat');
assert(/if\(send && txt\) sendChat\(txt\)/.test(close) && /tryPointerLock\(\)/.test(close), 'closeChat wiring incomplete');

// XSS-safety: message rendered via textContent, never innerHTML
const add = extractFunction('addChatLine');
assert(/tx\.textContent=/.test(add) && !/innerHTML/.test(add), 'chat text must be set via textContent, not innerHTML');
assert(/while\(log\.children\.length>8\)/.test(add), 'chat log not capped');

// dispatch both directions, with host relaying to the other clients
assert(/else if\(msg\.t==='chat'\)\{ const nm=\(NET\.players\[id\]&&NET\.players\[id\]\.name\)/.test(src), 'host chat dispatch/relay missing');
assert(/else if\(msg\.t==='chat'\)\{ addChatLine\(msg\.name\|\|'\?'/.test(src), 'client chat dispatch missing');
done();
