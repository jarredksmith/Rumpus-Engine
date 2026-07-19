// (build 1002) AAA LOBBY. The lobby leaves the little modal card and becomes a full-screen match
// screen: hero title + big ROOM CODE chip, a responsive grid of PLAYER CARDS with each player's
// actual character portrait and glowing ready states, and the two-step bar restyled as bottom
// CTAs. Presentation + a richer renderLobby only — every id, handler, tag class, count string and
// network message is byte-identical to before (test-420/436/900 pins all still pass untouched).
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- CSS: full-screen scoped overrides (order-independent via #lobby specificity) ----
assert(/#lobby \.modalCard \{ max-width:none; max-height:none; width:100%; height:100%; border-radius:0;/.test(html),
  'the lobby card fills the screen');
assert(/#lobby \.lobbyCode \{[^}]*letter-spacing:6px;/.test(html), 'the room code is a big hero chip (it IS the share artifact)');
assert(/#lobby #lobbyPlayers \{[^}]*grid-template-columns:repeat\(auto-fill,minmax\(132px,1fr\)\);/.test(html),
  'players render as a responsive card grid');
assert(/#lobby \.lobbyRow\.ready \{ border-color:var\(--accent\); box-shadow:0 0 12px rgba\(var\(--accent-rgb\),\.25\); \}/.test(html),
  'ready players glow in the accent');
assert(/\.lobbyPortrait \{ width:84px; height:84px;/.test(html), 'portrait square on every card');
assert(/#lobby #lobbyReady, #lobby #lobbyStart \{ background:linear-gradient\(180deg, rgba\(var\(--accent-rgb\),\.95\)/.test(html),
  'READY/START are proper CTAs');
assert(/#lobby \.modalCard \{[^}]*env\(safe-area-inset-top\)/.test(html), 'safe-area padded for phones');

// ---- executable: renderLobby builds portrait cards; tags/count/START logic unchanged ----
const rl = extractFunction('renderLobby');
const mkEl = () => ({ children: [], style: {}, className: '', textContent: '',
  set innerHTML(v){ this.children.length = 0; }, get innerHTML(){ return ''; },
  appendChild(c){ this.children.push(c); } });
const wrap = mkEl(), cnt = mkEl(), sb = mkEl();
const thumbCalls = [];
const env = {
  document: { getElementById: id => id === 'lobbyPlayers' ? wrap : id === 'lobbyCount' ? cnt : id === 'lobbyStart' ? sb : null,
              createElement: () => mkEl() },
  NET: { myId: 1, mode: 'host', charById: { 2: { url: 'https://h/scout.glb' } } },
  TEAM_COLOR: [0xff0000, 0x0000ff],
  myCharCfg: () => ({ url: 'https://h/me.glb' }),
  _renderCharThumb: (cfg) => thumbCalls.push(cfg.url),
  _lobbyReadyState: r => ({ all: r.every(p => p.ready || p.host), waiting: r.filter(p => !p.ready && !p.host).length }),
};
const roster = [ { id: 1, name: 'Me', host: true, tint: 0x39d3a8 }, { id: 2, name: 'Scout', ready: true }, { id: 3, name: 'Newbie', ready: false } ];
new Function(...Object.keys(env), 'roster', rl + '\nrenderLobby(roster);')(...Object.values(env), roster);

eq(wrap.children.length, 3, 'one card per player');
eq(thumbCalls.length, 2, 'real character portraits render for me + the player with a known model');
assert(thumbCalls.includes('https://h/me.glb') && thumbCalls.includes('https://h/scout.glb'),
  'my card uses myCharCfg, theirs uses NET.charById');
assert(wrap.children[0].className.includes('ready') && wrap.children[1].className.includes('ready') && !wrap.children[2].className.includes('ready'),
  'host + ready players glow; the picking player does not');
eq(cnt.textContent, '3 in lobby · 1/3 ready', 'the N/M ready count is unchanged');
assert(/START · 1 not ready/.test(sb.textContent), 'the host START still reflects who is not ready');
// each card leads with its portrait
assert(wrap.children.every(card => card.children[0] && card.children[0].className === 'lobbyPortrait'),
  'every card leads with the portrait square');

done('build 1002: AAA lobby — portrait player cards, hero room code, CTA bar; logic untouched');
