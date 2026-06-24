// (build 150) Rocket launcher: a 4th weapon firing a projectile that detonates on impact via explodeAt
// (AoE, falloff, chain-detonates propane). Host/solo author the damage; a client's rocket is simulated on
// the host, and everyone sees the rocket fly (rocket msg) + the blast (boom msg). Sold in co-op; in duel loadout.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/launcher:\{ name:'ROCKET',.*projectile:true, blastRadius:7, loud:1\.2 \}/.test(src), 'launcher weapon defined');
assert(/owned=\['rifle','smg','shotgun','sniper','launcher','crowbar'\]/.test(src), 'launcher in the duel loadout');
assert(/id:'launcher', name:'ROCKET LAUNCHER'.*giveWeapon\('launcher'\), oneTime:true/.test(src), 'launcher sold in the co-op shop');
assert(/if\(w\.projectile\)\{ fireRocketShot\(\); firingLatch=true; return; \}/.test(src), 'launcher fires a projectile instead of hitscan');

assert(/function fireRocketShot\(\)/.test(src) && /function fireRocket\(o, dir, by, auth, R, dmg\)/.test(src) && /function updateRockets\(dt\)/.test(src), 'rocket fns');
const fs2 = extractFunction('fireRocketShot');
assert(/NET\.mode==='client'.*fireRocket\(o,d,NET\.myId,false,R,0\); if\(NET\.conn\).*NET\.conn\.send\(\{t:'rocket'/.test(fs2), 'client fires a visual rocket + asks the host');
assert(/fireRocket\(o,d,NET\.myId,true,R,dmg\)/.test(fs2), 'host/solo fires an authoritative rocket');

const ur = extractFunction('updateRockets');
assert(/if\(rk\.auth\)\{ explodeAt\(p\.clone\(\), rk\.R, rk\.dmg, rk\.by\)/.test(ur), 'authoritative rocket detonates via explodeAt');
// build 670: the boom broadcast moved INTO explodeAt (so prop blasts + hazards reach clients too, not just rockets)
assert(/NET\.conns\[id\]\.send\(\{t:'boom', p:\[pos\.x,pos\.y,pos\.z\], r:R\}\)/.test(extractFunction('explodeAt')), 'host broadcasts every blast from explodeAt');
assert(/for\(const en of enemies\).*distanceTo\(p\)<1\.0/.test(ur), 'co-op: rocket impacts on enemies');
assert(/!sameTeam\(rk\.by,NET\.myId\)/.test(ur) && /\+id!==rk\.by/.test(ur), 'rocket passes through the shooter + teammates');

assert(/else if\(msg\.t==='rocket'\)\{ const o=new THREE\.Vector3\(msg\.o\[0\].*fireRocket\(o,d,id,true,msg\.r\|\|7,WEAPONS\.launcher\.dmg\)/.test(src), 'host simulates a client rocket authoritatively');
assert(/else if\(msg\.t==='rocket'\)\{ fireRocket\(new THREE\.Vector3.*false, msg\.r\|\|7, 0\); \}/.test(src), 'clients show other rockets as visual');
assert(/else if\(msg\.t==='boom'\)\{ explodeAt\(new THREE\.Vector3.*0, null\); \}/.test(src), 'clients render the blast on boom');
assert(/updateRockets\(dt\);/.test(src), 'loop ticks rockets');
done('rocket launcher');
