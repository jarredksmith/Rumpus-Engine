// (build 116) Map powerups: host/solo-owned pickup pads (health/damage/speed/shield) that grant a buff
// on proximity and respawn after a cooldown. Mirrors coins; clients see them via the world snapshot.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/const POWERUP_KINDS = \{/.test(src) && /health:/.test(src) && /damage:/.test(src) && /speed:/.test(src) && /shield:/.test(src), 'four powerup kinds');
assert(/const POWERUP_COOLDOWN = 15;/.test(src), 'respawn cooldown');
assert(/function buildPowerupMesh/.test(src) && /function powerupLayout/.test(src), 'mesh + layout');

const up = extractFunction('updatePowerups');
assert(/const players = allPlayers\(\);/.test(up), 'checks all players (host + remotes)');
assert(/if\(!p\.ready\)\{ p\.cd -= dt; if\(p\.cd<=0\)\{ p\.ready=true;/.test(up), 'cooldown then respawn');
assert(/if\(near && nd < 2\.0 && !\(p\.interact && near\.id===NET\.myId\)\)\{ grantPowerup\(near, p\.kind, p\.item\); p\.ready=false; p\.cd=\(\(POWERUP_KINDS\[p\.kind\]&&POWERUP_KINDS\[p\.kind\]\.key\)\|\|p\.kind==='item'\)\?1e9:POWERUP_COOLDOWN;/.test(up), 'grant on proximity + start cooldown (keys/items one-shot)');

const gp = extractFunction('grantPowerup');
assert(/playerEntry\.id===NET\.myId\) applyPowerupLocal\(kind, item\)/.test(gp) && /sendToPlayer\(playerEntry\.id, \{ t:'power', k:kind, item:item \}\)/.test(gp), 'local apply vs remote grant');

const ap = extractFunction('applyPowerupLocal');
assert(/player\.hp = Math\.min\(player\.maxHp, player\.hp \+ 50\)/.test(ap), 'health heals +50');
assert(/applyDamage\(\)/.test(ap) && /applySpeed\(\)/.test(ap) && /applyShield\(\)/.test(ap), 'buffs routed to existing applies');

// sync
assert(/const PUall = powerups\.map/.test(src) && /const PU = full \? \(powerups\.length \? PUall : undefined\)/.test(src), 'powerups serialized in snapshot (changed-only between keyframes since 1197)');
assert(/return \{ t:'world', dl: full\?undefined:1, P, E, Ex, C, D, K, PU, O, wv:wave, en:_hostileAlive\(\) \};/.test(src), 'PU in world packet');   // build 1226: en became the hostile count
/* build 1327: the client no longer places the pad flat at y=0 — that put its disc in the floor and the
   z-fighting was the "pickups flash on the joiner" report. It uses _applyPickupXform, the host's own
   placement function, so the terrain lift and the authored y/rotation/scale all arrive. Same claim: the
   client builds the meshes; stronger: it builds them where the host has them. */
assert(/m=buildPowerupMesh\(pu\.k\); m\.userData\._puKind=pu\.k/.test(src), 'client builds pad meshes');
assert(/_applyPickupXform\(m, \{ x:pu\.p\[0\], z:pu\.p\[1\], y:\(pu\.y\|\|0\)/.test(src),
  '...and places them with the host’s own transform function');
assert(/else if\(msg\.t==='power'\)\{ applyPowerupLocal\(msg\.k, msg\.item\); \}/.test(src), 'client applies a granted powerup');

// lifecycle
assert(/if\(!isClient && !editorOpen\) updatePowerups\(dt\);/.test(src), 'host/solo ticks powerups in all combat modes');
assert(/if\(typeof spawnPowerups==='function'\) spawnPowerups\(\);/.test(src), 'powerups spawned on run start');
assert(/if\(NET\.mode==='client'\) return;/.test(extractFunction('spawnPowerups')), 'clients do not self-spawn pads');
done('map powerups');
