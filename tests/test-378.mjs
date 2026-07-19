import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 502: bots now broadcast their hit direction (hd) + a per-hit sequence (hs), and the host keeps a
// dead-but-dying bot in the snapshot (hp:0 + hd/hs) for its death-anim window. Clients already ingest hd/hs
// for every P entry and netInterpolate already turns them into a directional flinch / death (build 497), so
// remote clients now see the same directional bot reactions the host does — then the bot prunes on respawn.

// ---- host records the hit bearing on the bot (killing blow always; survival flinch in lockstep w/ cooldown) ----
const bh = extractFunction('botHurt');
assert(/if\(b\.hp<=0\)\{ if\(_dn\)\{ b\._netHitDir=_code; b\._netHitSeq=\(\(b\._netHitSeq\|\|0\)\+1\)&255; \} botDie\(b, sx, sz\); return true; \}/.test(bh), 'the killing blow records the death direction + bumps the sequence');
assert(/b\._evt = \{ slot:'hit'\+_dn, until:now\+220 \}; b\._evtCd=now\+300;\s*b\._netHitDir=_code; b\._netHitSeq=\(\(b\._netHitSeq\|\|0\)\+1\)&255;/.test(bh), 'a survived hit bumps hd/hs in lockstep with the cooldown-gated local flinch');

// ---- the snapshot carries bots (incl. dead-but-dying) with hd/hs ----
assert(/for\(const b of bots\)\{ if\(b\.dead && !b\._dying\) continue; P\.push\(\{ id:b\.id, p:\[b\.pos\.x,EYE,b\.pos\.z\], y:b\.yaw, pi:0, w:\(b\.wep\|\|'rifle'\), hp:\(b\.dead\?0:b\.hp\), hd:b\._netHitDir\|\|0, hs:b\._netHitSeq\|\|0, n:b\.name \}\); \}/.test(src),
  'dead-but-dying bots stay in the snapshot with hp:0 + hd/hs');

// ---- the client side is already wired: every P entry stores hd/hs, and absent ids prune ----
assert(/rp\.crouch=!!pl\.cr; rp\.hd=pl\.hd\|\|0; rp\.hs=pl\.hs\|\|0;/.test(src), 'the client ingest (shared by bot P-entries) stores hd/hs');
assert(/for\(const id in NET\.players\)\{ if\(!seen\.has\(\+id\)\) removeRemotePlayer\(\+id\); \}/.test(src), 'a bot pruned from the snapshot is removed on the client (cleanup after the death anim)');

// ---- executable: the hd code lines up with the resolver's flinch/death tables ----
function hitCode(sx, sz, px, pz, yaw){
  const dx=sx-px, dz=sz-pz;
  const fx=-Math.sin(yaw), fz=-Math.cos(yaw), rx=Math.cos(yaw), rz=-Math.sin(yaw);
  const f=dx*fx+dz*fz, r=dx*rx+dz*rz;
  const dir = (Math.abs(f)>=Math.abs(r)) ? (f>=0?'Front':'Back') : (r>0?'Right':'Left');
  return dir==='Front'?0:dir==='Back'?1:dir==='Left'?2:3;
}
const flinch=['hitFront','hitBack','hitLeft','hitRight'];
const deathOf=c=>c===0?'dieBack':c===1?'dieFront':'die';
{ const c=hitCode(0,-5,0,0,0); assert(c===0 && flinch[c]==='hitFront' && deathOf(c)==='dieBack', 'bot shot from the front: hitFront -> dieBack'); }
{ const c=hitCode(0, 5,0,0,0); assert(c===1 && flinch[c]==='hitBack' && deathOf(c)==='dieFront', 'bot shot from behind: hitBack -> dieFront'); }
{ const c=hitCode(5, 0,0,0,0); assert(c===3 && flinch[c]==='hitRight' && deathOf(c)==='die', 'bot shot from the right: hitRight -> flat die'); }

done();
