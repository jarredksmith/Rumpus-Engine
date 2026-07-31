import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 433: a player's third-person weapon placement (tpGunGrips) was local-only — remote players rendered the
// gun with the VIEWER's grip (or defaults), so it sat wrong on the body. Now the current weapon's grip is synced
// over the network and applied per-remote-player.

// pack/unpack helpers
const pk = extractFunction('_packGrip');
assert(/activeCharGrip\(wk\)\|\|tpGunGrip\(wk\)/.test(pk) && /\.toFixed\(3\)/.test(pk), 'packs the current weapon grip as a compact array (char grip wins, build 524)');
const up = extractFunction('_unpackGrip');
assert(/a\.length>=7[\s\S]*?\{ x:\+a\[0\], y:\+a\[1\], z:\+a\[2\], yaw:\+a\[3\], pitch:\+a\[4\], roll:\+a\[5\], scale:\+a\[6\] \}/.test(up), 'unpacks the array back into a grip');

// sent on every state path
assert(/\{ id:NET\.myId, p:\[player\.pos\.x,player\.pos\.y,player\.pos\.z\], y:player\.yaw, pi:player\.pitch, w:curWep, g:_packGrip\(\)/.test(src), 'host snapshot sends the host grip (weapon key, build 520; id is NET.myId since 1201 — 0 for an original host, the kept id for a promoted one)');
assert(/t:'st', p:\[player\.pos\.x,player\.pos\.y,player\.pos\.z\], y:player\.yaw, pi:player\.pitch, w:curWep, g:_packGrip\(\)/.test(src), 'client state sends its grip (weapon key, build 520)');
assert(/g:\(rp\.grip\?\[rp\.grip\.x,rp\.grip\.y,rp\.grip\.z,rp\.grip\.yaw,rp\.grip\.pitch,rp\.grip\.roll,rp\.grip\.scale\]:null\)/.test(src), 'host re-broadcasts each peer grip');

// stored on the remote player on both receive paths
assert(/if\(msg\.g\) rp\.grip=_unpackGrip\(msg\.g\);/.test(src), 'per-state handler stores the grip');
assert(/if\(pl\.g\) rp\.grip=_unpackGrip\(pl\.g\);/.test(src), 'snapshot consumer stores the grip');

// applied to the remote avatar's gun (override beats local tpGunGrip)
assert(/attachAvatarGun\(rp\.mesh, rp\.wep\|\|'rifle', rp\.grip\|\|null\)/.test(src), 'remote avatar attaches its gun with the synced grip');
const aag = extractFunction('attachAvatarGun');
assert(/g\.userData\.gripOverride = gripOverride \|\| null;/.test(aag), 'override stored on the avatar group');
assert(/if\(g\.userData\._gripSig !== ngr\)\{[\s\S]*?_applyGunGripToHand\(g\.userData\.gun, g\.userData\.gunBone, weaponKey, gripOverride\)/.test(aag), 'grip re-applies when it changes even if the weapon did not');
const gth = extractFunction('_applyGunGripToHand');
assert(/const gr = gripOverride \|\| tpGunGrip\(weaponKey\);/.test(gth), 'hand apply prefers the override');

// executable: pack -> unpack round-trips
function pack(g){ return [ +(+g.x).toFixed(3), +(+g.y).toFixed(3), +(+g.z).toFixed(3), +(+g.yaw).toFixed(3), +(+g.pitch).toFixed(3), +(+g.roll).toFixed(3), +((g.scale==null?1:+g.scale)).toFixed(3) ]; }
function unpack(a){ return (a&&a.length>=7)?{x:+a[0],y:+a[1],z:+a[2],yaw:+a[3],pitch:+a[4],roll:+a[5],scale:+a[6]}:null; }
const g0={x:0.31,y:1.22,z:-0.4,yaw:0.12,pitch:-0.05,roll:0,scale:1.3};
const r=unpack(pack(g0));
for(const k of Object.keys(g0)) assert(Math.abs(r[k]-g0[k])<0.001, 'grip field '+k+' survives the round-trip');
assert(unpack(null)===null && unpack([1,2])===null, 'bad grip payloads unpack to null (fall back to local)');
done();
