import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 497: the reactive set now travels to remote players. The victim broadcasts a hit-direction code (hd) +
// a per-hit sequence (hs); peers fire a directional flinch (hitFront/Back/Left/Right) on a fresh hs, drive
// directional locomotion from the interpolated travel + yaw (via _locoSlot), and pick a directional death
// (front hit -> dieBack) instead of a flat die.

// ---- hurtDir records the broadcast fields ----
const hd = extractFunction('hurtDir');
assert(/_netHitDir = \(dir==='Front'\)\?0:\(dir==='Back'\)\?1:\(dir==='Left'\)\?2:3;/.test(hd), 'hurtDir encodes the hit direction (0=front..3=right)');
assert(/_netHitSeq=\(_netHitSeq\+1\)&255;/.test(hd), 'hurtDir bumps the per-hit sequence');

// ---- hd/hs travel on every packet + ingest path ----
assert(/cr:crouching\?1:0, hd:_netHitDir, hs:_netHitSeq, n:NET\.name, mt:\(mountedTurret\?_turretIndexOf\(mountedTurret\):-1\), cl:_climbCode\(\), c:_packCar\(\) \}\); \}catch/.test(src), 'client state packet carries hd/hs');
assert(/cr:crouching\?1:0, hd:_netHitDir, hs:_netHitSeq, n:NET\.name\|\|'Host', mt:\(mountedTurret\?_turretIndexOf\(mountedTurret\):-1\), cl:_climbCode\(\), c:_packCar\(\) \}\];/.test(src), 'host own snapshot entry carries hd/hs');
assert(/cr:rp\.crouch\?1:0, hd:rp\.hd\|\|0, hs:rp\.hs\|\|0, n:rp\.name/.test(src), 'host relays each peer\u2019s hd/hs');
assert(/rp\.crouch = !!msg\.cr; rp\.hd = msg\.hd\|\|0; rp\.hs = msg\.hs\|\|0;/.test(src), 'host stores an incoming client\u2019s hd/hs');
assert(/rp\.crouch=!!pl\.cr; rp\.hd=pl\.hd\|\|0; rp\.hs=pl\.hs\|\|0;/.test(src), 'client stores the relayed hd/hs');

// ---- the remote resolver: directional loco + fresh-hit + directional death ----
const ni = extractFunction('netInterpolate');
assert(/_locoSlot\(_dx,_dz,rp\.yaw,tier,/.test(ni), 'remote locomotion is directional (fwd/back/strafe)');
assert(/_locoSlot\(_dx,_dz,rp\.yaw,'crouch',/.test(ni), 'remote crouch locomotion is directional');
assert(/rp\.hs!==rp\._lastHs.*rp\._hitT=performance\.now\(\)\+260; rp\._hitDir=\(rp\.hd\|0\)/.test(ni), 'a fresh hs starts a directional flinch one-shot');
assert(/\['hitFront','hitBack','hitLeft','hitRight'\]\[rp\._hitDir\|\|0\]/.test(ni), 'flinch slot taken from the hit direction');
assert(/rp\._hitDir===0\?'dieBack':rp\._hitDir===1\?'dieFront':'die'/.test(ni), 'directional death (front hit -> fall backward)');

// ---- executable: hit-direction code (mirror of hurtDir) lines up with the flinch + death slots ----
function hitCode(sx, sz, px, pz, yaw){
  const dx=sx-px, dz=sz-pz;
  const fx=-Math.sin(yaw), fz=-Math.cos(yaw), rx=Math.cos(yaw), rz=-Math.sin(yaw);
  const f=dx*fx+dz*fz, r=dx*rx+dz*rz;
  let dir; if(Math.abs(f)>=Math.abs(r)) dir = f>=0?'Front':'Back'; else dir = r>0?'Right':'Left';
  return (dir==='Front')?0:(dir==='Back')?1:(dir==='Left')?2:3;
}
const flinch = ['hitFront','hitBack','hitLeft','hitRight'];
const deathOf = c => c===0?'dieBack':c===1?'dieFront':'die';
// facing -Z (yaw 0)
{ const c=hitCode(0,-5, 0,0, 0); assert(c===0 && flinch[c]==='hitFront' && deathOf(c)==='dieBack', 'shot from the front: hitFront + fall backward'); }
{ const c=hitCode(0, 5, 0,0, 0); assert(c===1 && flinch[c]==='hitBack' && deathOf(c)==='dieFront', 'shot from behind: hitBack + fall forward'); }
{ const c=hitCode(5, 0, 0,0, 0); assert(c===3 && flinch[c]==='hitRight' && deathOf(c)==='die', 'shot from the right: hitRight + flat die'); }
{ const c=hitCode(-5,0, 0,0, 0); assert(c===2 && flinch[c]==='hitLeft', 'shot from the left: hitLeft'); }

// ---- executable: fresh-hit sequence detection ----
function freshHit(rp){ if(rp.hs!=null && rp.hs!==rp._lastHs){ rp._lastHs=rp.hs; return true; } return false; }
{
  const rp={ hs:0, _lastHs:undefined };
  assert(freshHit(rp)===true, 'first hs seen -> fresh hit');
  assert(freshHit(rp)===false, 'same hs -> not a new hit');
  rp.hs=1; assert(freshHit(rp)===true, 'incremented hs -> fresh hit');
}

done();
