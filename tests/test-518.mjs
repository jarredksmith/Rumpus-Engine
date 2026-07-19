import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 670: connected players didn't see explosions. Two gaps fixed:
//  - grenades were never networked (only the thrower simulated them) -> now relayed like rockets, host-authoritative;
//  - only the rocket call-site broadcast a 'boom', so prop/hazard explosions never reached clients -> the host now
//    broadcasts the blast from inside explodeAt (covers everything that explodes via explodeAt).

// --- throwGrenade now tags + networks the throw ---
const tg = extractFunction('throwGrenade');
assert(/grenades\.push\(\{ mesh, vel: vel\.clone\(\), fuse: GRENADE\.fuse, by, auth \}\)/.test(tg), 'grenades carry a thrower id + auth flag');
assert(/const auth = !\(typeof NET!=='undefined' && NET\.mode==='client'\);/.test(tg), 'host + solo author damage; clients are visual-only');
assert(/const pk = \{ t:'nade', o:\[origin\.x,origin\.y,origin\.z\], v:\[vel\.x,vel\.y,vel\.z\], by:\(NET\.mode==='host'\?0:NET\.myId\) \};/.test(tg), 'the throw is packed for the network');
assert(/if\(NET\.mode==='client'\)\{ if\(NET\.conn\)\{ try\{ NET\.conn\.send\(pk\); \}/.test(tg), 'a client tells the host it threw');
assert(/else \{ for\(const id in NET\.conns\)\{ try\{ NET\.conns\[id\]\.send\(pk\); \}/.test(tg), 'the host broadcasts its throw to clients');

// --- a spawn helper for relayed grenades ---
assert(/function spawnNetGrenade\(o, v, by, auth\)\{/.test(src), 'spawnNetGrenade builds a relayed grenade');

// --- relay handlers: host simulates a client grenade (auth) + relays; clients show it (visual) ---
assert(/else if\(msg\.t==='nade'\)\{ spawnNetGrenade\(new THREE\.Vector3\(msg\.o\[0\],msg\.o\[1\],msg\.o\[2\]\), new THREE\.Vector3\(msg\.v\[0\],msg\.v\[1\],msg\.v\[2\]\), id, true\); for\(const cid in NET\.conns\)\{ if\(\+cid!==id\)/.test(src), 'host simulates a client grenade authoritatively + relays it');
assert(/else if\(msg\.t==='nade'\)\{ spawnNetGrenade\(new THREE\.Vector3\(msg\.o\[0\],msg\.o\[1\],msg\.o\[2\]\), new THREE\.Vector3\(msg\.v\[0\],msg\.v\[1\],msg\.v\[2\]\), msg\.by, false\); \}/.test(src), 'clients render another player’s grenade (visual only)');

// --- explodeGrenade is visual-only on clients (host authors damage via its own sim) ---
const eg = extractFunction('explodeGrenade');
assert(/if\(typeof NET!=='undefined' && NET\.mode==='client'\)\{ scene\.remove\(g\.mesh\); return; \}/.test(eg), 'clients render the blast, remove the spent grenade prop (build 1015: it used to linger forever), and skip the damage');
assert(/for\(const en of enemies\.slice\(\)\)\{/.test(eg), 'the host still applies AoE damage');

// --- explodeAt broadcasts every blast (rockets, props, hazards) ---
const ea = extractFunction('explodeAt');
assert(/if\(NET\.mode==='host'\)\{ for\(const id in NET\.conns\)\{ try\{ NET\.conns\[id\]\.send\(\{t:'boom', p:\[pos\.x,pos\.y,pos\.z\], r:R\}\); \}[\s\S]*?if\(NET\.mode==='client'\) return;/.test(ea), 'host broadcasts the boom, then clients return after the visual');

// --- the rocket call-site no longer double-broadcasts (explodeAt owns it now) ---
const ur = extractFunction('updateRockets');
assert(/if\(rk\.auth\)\{ explodeAt\(p\.clone\(\), rk\.R, rk\.dmg, rk\.by\); \}/.test(ur), 'the rocket just calls explodeAt (no separate boom send)');

done('build 670: grenades networked + every explosion reaches clients');
