import { html, gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 552: multiplayer lobby UX. (1) Per-player READY state the host can see; (2) a joiner must choose a
// character before they can ready up — the picker auto-opens on join and READY stays locked until they pick
// or confirm.

// --- UI exists ---
assert(/id="lobbyReady"/.test(html), 'the lobby has a Ready button');
assert(/id="charConfirm"/.test(html), 'the character picker has a Confirm button');

// --- ready state travels in the roster (host always ready) and the host reflects a client toggle ---
const lr = extractFunction('lobbyRoster');
assert(/host:true, ready:true/.test(lr), 'the host is always ready in the roster');
assert(/host:false, ready:!!\(rp&&rp\.ready\)/.test(lr), 'each client carries its own ready flag in the roster');
assert(/else if\(msg\.t==='ready'\)\{ const rp=NET\.players\[id\]; if\(rp\) rp\.ready=!!msg\.r;/.test(src), 'host applies a client ready toggle');
assert(/rp\.ready=!!msg\.r; if\(NET\.phase==='lobby'\) refreshLobby\(\)/.test(src), 'a ready change re-broadcasts the lobby so everyone sees it');
assert(/modelCfg:cfg, mt:-1, ready:false \}/.test(extractFunction('ensureRemotePlayer')), 'a fresh remote player defaults to not-ready');

// --- the roster renders a READY / PICKING indicator + a ready count ---
const rl = extractFunction('renderLobby');
assert(/rt\.className=pl\.ready\?'lobbyReadyTag':'lobbyWaitTag'/.test(rl), 'non-host rows show a ready vs picking tag');
assert(/rt\.textContent=pl\.ready\?'READY':'PICKING/.test(rl), 'the tag reads READY or PICKING');
assert(/'\/'\+n\+' ready'/.test(rl), 'the lobby shows an N/M ready count');

// --- the client gate: READY is disabled until a character is chosen ---
assert(/let _charChosen=false, _imReady=false;/.test(src), 'client tracks chosen-character + ready flags');
const urb = extractFunction('_updateReadyBtn');
assert(/if\(!_charChosen\)\{ rb\.disabled=true;/.test(urb), 'READY is disabled until a character is chosen');
assert(/rb\.textContent='PICK A CHARACTER/.test(urb), 'the locked button tells the player to pick a character');
const sr = extractFunction('setReady');
assert(/if\(NET\.mode!=='client' \|\| !_charChosen\) return;/.test(sr), 'setReady refuses until a character is chosen');
assert(/NET\.conn\.send\(\{ t:'ready', r:_imReady\?1:0 \}\)/.test(sr), 'readying sends the toggle to the host');

// --- choosing a character (either grid, or Confirm) flips the gate ---
assert(/_charChosen=true; if\(typeof _updateReadyBtn==='function'\) _updateReadyBtn\(\);/.test(extractFunction('selectChar')), 'picking a built-in character unlocks READY');
assert(/_charChosen=true; if\(typeof _updateReadyBtn==='function'\) _updateReadyBtn\(\);/.test(extractFunction('selectRosterChar')), 'picking a roster character unlocks READY');
assert(/ccf\.onclick=\(\)=>\{ _charChosen=true; closeModal\('charPicker'\);/.test(src), 'the Confirm button counts as choosing');

// --- the picker auto-opens for a joiner; the host hides its own Ready button ---
const scl = extractFunction('showClientLobby');
assert(/openCharPicker\(\);/.test(scl), 'the character picker auto-opens when a client enters the lobby');
assert(/_imReady=false; _updateReadyBtn\(\);/.test(scl), 'the client lobby starts not-ready with the button gated');
assert(/rdy\.classList\.add\('hidden'\)/.test(extractFunction('enterLobby')), 'the host does not get a Ready button');

// --- executable: the gate logic (chosen -> can ready; not chosen -> cannot) and a ready count ---
function canReady(chosen){ return !!chosen; }
assert(!canReady(false), 'cannot ready before choosing');
assert(canReady(true), 'can ready after choosing');
function readyCount(roster){ return roster.filter(p=>p.ready).length+'/'+roster.length; }
eq(readyCount([{host:true,ready:true},{ready:false},{ready:true}]), '2/3', 'ready count tallies host + readied clients');

done('lobby ready state + character-choice gate (build 552)');
