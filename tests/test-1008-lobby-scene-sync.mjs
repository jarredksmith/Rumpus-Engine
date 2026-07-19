// (build 1008) LOBBY ROUND 2 — field feedback from the 1007 facelift.
// - Picking a character while the lobby is open now updates the lobby card immediately: the two
//   select functions call _lobbyCharSync (host re-renders + rebroadcasts; a client re-renders its
//   local roster view), and both network char handlers refresh an open lobby.
// - The bust crop is TOP-anchored: the frame's top edge sits just above the head (hats/helmets
//   were clipping) and broad shoulders widen the frame instead of cropping arms.
// - The character-select avatar starts FACING the camera (avatars face -Z; it used to open on
//   the model's back until the turntable swung around).
// - The lobby is a scene now: perspective grid floor + accent glows + slow sweep behind the
//   content, plus a MATCH INFO side panel (mode/target/map/host/players) and rotating intel tips.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- character change updates the open lobby ----
const sync = extractFunction('_lobbyCharSync', src);
assert(/if\(NET\.phase!=='lobby'\) return;/.test(sync), 'sync is lobby-scoped');
assert(/if\(NET\.mode==='host'\)\{ if\(typeof refreshLobby==='function'\) refreshLobby\(\); \}/.test(sync)
  && /else if\(NET\.lobbyRoster\)\{ renderLobby\(NET\.lobbyRoster\); \}/.test(sync),
  'host rebroadcasts, client re-renders locally');
eq((src.match(/if\(typeof _lobbyCharSync==='function'\) _lobbyCharSync\(\); \}/g)||[]).length, 2,
  'BOTH select paths (roster models + color presets) trigger the sync');
assert(/NET\.conns\[cid\]\.send\(\{t:'char', from:id, cfg:msg\.cfg\}\); \}catch\(e\)\{\} \} \} if\(NET\.phase==='lobby'\) refreshLobby\(\); \}/.test(src),
  'host refreshes everyone when a CLIENT changes character mid-lobby');
assert(/applyRemoteChar\(msg\.from, msg\.cfg\); if\(NET\.phase==='lobby' && NET\.lobbyRoster\) renderLobby\(NET\.lobbyRoster\); \}/.test(src),
  'clients refresh when ANOTHER player changes character mid-lobby');

// ---- bust crop: executable check of the top-anchor math ----
const rt = extractFunction('_renderCharThumb', src);
assert(/const frameH=Math\.max\(0\.35, size\.y\*0\.42, size\.x\*0\.85\);/.test(rt)
  && /const focusY=size\.y\*0\.56 - frameH\*0\.5;/.test(rt), 'top-anchored crop wired');
const frame = (h, w) => { const frameH = Math.max(0.35, h*0.42, w*0.85); const focusY = h*0.56 - frameH*0.5;
  return { top: focusY + frameH/2, bottom: focusY - frameH/2, frameH }; };
{ const f = frame(2.0, 0.5);   // slim humanoid (A-pose)
  assert(f.top > 1.0, 'head top (y=+1.0 of a 2m model) sits INSIDE the frame with margin');
  assert(f.top - 1.0 < 0.25, '...but not so much margin the bust shrinks again');
  assert(f.bottom > -1.0, 'still a bust, not a full-body shot'); }
{ const f = frame(2.0, 1.8);   // T-pose / broad model: frame widens, showing more body
  assert(f.frameH >= 1.5, 'wide models get a wide frame (arms not amputated)');
  assert(f.top > 1.0, 'head margin holds even at T-pose width'); }

// ---- select screen faces the camera ----
assert(/_csRotY=Math\.PI\*0\.92, _csSpin=true/.test(src), 'initial yaw faces the camera (slight 3/4)');
assert(/_csSpin=true; _csRotY=Math\.PI\*0\.92;/.test(src), 'every preview swap resets to front-facing');

// ---- the hangar scene ----
assert(!/#lobby \.modalCard::before/.test(html) && !/lobGrid/.test(html),
  'the grid floor was removed on field feedback (build 1009) — no dead rules left behind');
assert(/#lobby \.modalCard::after \{[^}]*radial-gradient\(130% 100% at 50% 38%, transparent 58%, rgba\(0,0,0,\.5\)\)/.test(html), 'vignette layer');
assert(/#lobby \.modalCard > \* \{ position:relative; z-index:1; \}/.test(html), 'content rides above the scene layers');
assert(/@media \(prefers-reduced-motion:no-preference\)\{\s*\n\s*#lobby \.modalCard::after \{ animation:lobSweep/.test(html),
  'the sweep animates only for users who allow motion');
assert(/@keyframes lobSweep/.test(html), 'sweep animation defined');

// ---- side panel ----
assert(/<div id="lobbyMain"><div id="lobbyPlayers"><\/div><aside id="lobbySide">/.test(html), 'roster + side panel share the main row');
assert(/@media \(max-width:860px\), \(max-height:520px\) \{ #lobbySide \{ display:none; \} \}/.test(html), 'panel yields on small screens');
const side = extractFunction('_renderLobbySide', src);
assert(/pvpMode\(\)\?pvpLabel\(\):\(NET\.gameMode==='race'\?'RACE':'CO-OP'\)/.test(side), 'mode row covers pvp/race/co-op');
assert(/if\(pvpMode\(\) && NET\.killTarget>0\)/.test(side), 'target row only when the target is known (clients pre-welcome)');
assert(/homepageCfg\.title\) \|\| \(localStorage\.getItem\('breach_last_level_name'\)/.test(side), 'map name from title screen or last save');
assert(/_esc\(String\(v\)\)/.test(side), 'panel values escaped (player/level names are user text)');
assert(/if\(typeof _renderLobbySide==='function'\) _renderLobbySide\(roster\);/.test(extractFunction('renderLobby', src)),
  'every roster render refreshes the panel');

// ---- rotating tips ----
const tips = extractFunction('_startLobbyTips', src);
assert(/setInterval/.test(tips) && /lb\.classList\.contains\('hidden'\)/.test(tips) && /clearInterval\(_lsTipInt\)/.test(tips),
  'tips rotate on a timer that kills itself when the lobby closes');
assert(/refreshLobby\(\); _startLobbyTips\(\); announceRoom\(\);/.test(src), 'host lobby starts the ticker');
assert(/openModal\('lobby'\);\n  _startLobbyTips\(\);/.test(src), 'client lobby starts the ticker');
const tipsArr = src.match(/const LOBBY_TIPS=\[[\s\S]*?\];/)[0];
assert((tipsArr.match(/'/g)||[]).length >= 16, 'a real rotation pool (8+ tips)');

done('build 1008: live lobby portraits, top-anchored bust crop, front-facing select, hangar scene + match info panel');
