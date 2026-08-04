// (build 1354) A WAY TO POINT AT YOUR OWN BROKER — and PeerJS vendored beside the game.
//
// Every `new Peer(...)` passed only `{config:{iceServers}}`, so signalling ALWAYS went to the public
// PeerJS cloud broker. `breach_ice`, `breach_comm_api`, `breach_lobby_db` and `breach_plays_db` each have a
// self-hoster override; the broker — the single point of failure the whole multiplayer feature depends on
// — had none. "Deploy your own PeerServer" was not merely undocumented, it was IMPOSSIBLE: there was no
// way to tell the game about it even if one were already running. That is why this is a prerequisite for
// the infrastructure work rather than a nicety.
//
// And PeerJS itself was three CDNs and nothing else, while Rapier and fflate have been vendored for
// builds — so a self-hoster, an air-gapped classroom or an offline session had no multiplayer at all.
//
// Verified live (tools/probe/peer-selfhost.mjs): unset -> no server key and ICE intact; configured ->
// host/port/path/secure present and ICE intact; five kinds of rubbish -> null, i.e. the cloud broker;
// clamps at 200 chars / 65535; local script first in the loader and actually served (92,863 bytes).
import { gameSource, extractFunction, html, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the override reads like every other self-hoster knob ----
{
  const f = extractFunction('_peerServer', src);
  assert(/localStorage\.getItem\('breach_peer'\)/.test(f), 'it is a localStorage override, like breach_ice');
  assert(/if\(!o \|\| typeof o !== 'object' \|\| !o\.host\) return null;/.test(f),
    'no host means NO OVERRIDE — anything malformed falls straight through to the cloud broker, which is ' +
    'what someone who has configured nothing must keep getting');
  assert(/catch\(e\)\{ return null; \}/.test(f), '...and unparseable JSON does too, rather than throwing');
  assert(/out\.secure = \(o\.secure !== false\)/.test(f),
    'TLS by default: a broker is a websocket carrying room codes, so plaintext has to be asked for');
  assert(/Math\.max\(1, Math\.min\(65535/.test(f), 'the port is clamped to a real port');
  assert(/String\(o\.host\)\.slice\(0, 200\)/.test(f), 'and every string is capped');
}

// ---- it reaches all four `new Peer` sites without any of them knowing ----
{
  const f = extractFunction('_peerOpts', src);
  assert(/const sv = _peerServer\(\); if\(sv\) Object\.assign\(o, sv\);/.test(f),
    'merged into the options object every call site already builds — so host, client, and both migration ' +
    'sites inherit it with no fifth place to keep in step');
  assert(/config:\{ iceServers:_peerIce\(\) \}/.test(f), '...and ICE is untouched');
  // count CONSTRUCTIONS, not prose — the comment above _peerServer contains the words "new Peer(...)"
  const sites = (src.match(/new Peer\([^)]*\)/g) || []).filter(x => !/\.\.\./.test(x));
  eq(sites.length, 4, 'there are still exactly four Peer construction sites');
  const bare = sites.filter(x => !/_peerOpts\(\)/.test(x));
  eq(bare.length, 0, 'and every one of them goes through _peerOpts — a site that built its own options ' +
    'would silently ignore the override');
}

// ---- vendored, local first, and deliberately unhashed ----
{
  const f = extractFunction('ensurePeerJS', src);
  const list = f.match(/const cdns=\[([^\]]*)\]/)[1].split(',').map(x => x.replace(/'/g, '').trim());
  eq(list[0], 'peerjs.min.js', 'the local copy is tried FIRST');
  eq(list.length, 4, '...and the three CDNs remain as fallbacks');
  assert(/_local=\(_u\.indexOf\(':\/\/'\)<0\)/.test(f), 'local is detected by having no scheme');
  assert(/if\(!_local\)\{ s\.crossOrigin='anonymous'; s\.integrity=/.test(f),
    'the CDNs keep their SRI hash — that is where the risk is — and the LOCAL copy deliberately carries ' +
    'none: SRI detects a mirror serving something other than what you asked for, and a file you host ' +
    'yourself is one you control. Pinning your own copy only means a legitimate update stops loading');
  assert(/build 1332/.test(f), 'and 1332’s reasoning is still attached to the CDN entries');
}

// ---- the CSP must know about a self-hosted broker, or the block switch kills multiplayer ----
{
  const csp = html.match(/if\(localStorage\.getItem\('breach_tpblock'\)[\s\S]{0,1800}?window\.__TP_BLOCKED = true;/);
  assert(csp, 'the parse-time CSP injector exists');
  assert(/breach_peer/.test(csp[0]),
    'it reads the SAME setting _peerServer does — a policy that omitted the broker would silently kill ' +
    'multiplayer for exactly the people who took the trouble to run their own infrastructure');
  assert(/\/\^\[a-zA-Z0-9\.-\]\+\$\//.test(csp[0]),
    'and only a hostname is admitted: this string goes into a security policy, so anything carrying a ' +
    'space, a quote or a semicolon is DROPPED rather than escaped');
  assert(/peerHost = ' https:\/\/' \+ pv\.host \+ ' wss:\/\/' \+ pv\.host/.test(csp[0]),
    'both schemes are allowed — signalling is https then a websocket upgrade');
  assert(/connect-src " \+ ok \+ [^\n]*peerHost/.test(csp[0]), '...and it lands in connect-src');
}

done('build 1354: PeerJS ships beside the game, and a self-hoster can finally name their own broker');
