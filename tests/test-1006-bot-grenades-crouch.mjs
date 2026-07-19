// (build 1006) BOT GRENADES + CROUCH-AT-COVER + PvP BLAST DAMAGE.
// - explodeGrenade only ever damaged co-op `enemies`: in a PvP match a grenade hurt NOBODY.
//   Now bots, remote players and the host take falloff damage credited to the thrower; the
//   thrower + team-mates are immune, and your own blast stays a damage-free grenade-jump.
// - Bots carry 2 grenades per life. The signature move: the target breaks contact behind cover
//   (fresh last-known position, no LOS) -> lob onto that spot to flush it out; plus a rare
//   direct lob at range. Same g=30 ballistic solver as the player's cursor throw (build 891).
// - A retreating bot now HOLDS its cover crouched for a recovery beat instead of sprinting
//   straight past it (the old exit condition fired the instant cover broke LOS).
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the ballistic lob lands ON the requested point ----
const fnText = extractFunction('_botThrowGrenade', src);
const sent = [], grenades = [];
const mk = new Function('THREE','GRENADE','makeGrenadeMesh','scene','grenades','NET','performance',
  fnText + '\nreturn _botThrowGrenade;');
const GRENADE = { throwForce: 26, fuse: 2.2 };
const NETm = { conns: { 5: { send: (m)=>sent.push(m) } } };
const _botThrowGrenade = mk(THREE, GRENADE, ()=>new THREE.Object3D(), {add(){}}, grenades, NETm, {now:()=>1000});
{
  const b = { id: 9001, pos: new THREE.Vector3(2, 0, -3), nades: 2, _nadeCd: 0 };
  const ok = _botThrowGrenade(b, 14, 6, 0);
  assert(ok===true, 'in-range lob throws');
  eq(b.nades, 1, 'consumes one grenade');
  assert(b._nadeCd>=9 && b._nadeCd<=15, 'long cooldown armed');
  eq(b._evt.slot, 'throw', 'plays the throw clip over locomotion');
  eq(grenades.length, 1, 'a live host-simulated grenade exists');
  assert(grenades[0].auth===true && grenades[0].by===9001, 'authoritative + credited to the bot');
  eq(sent.length, 1, 'clients get the visual relay');
  assert(sent[0].t==='nade' && sent[0].by===9001, 'relay carries the thrower id');
  // integrate the arc (g=30, same as updateGrenades) and check the landing point
  const p = new THREE.Vector3().fromArray(sent[0].o), v = new THREE.Vector3().fromArray(sent[0].v);
  let landed = null;
  for(let t=0; t<8; t+=0.001){ v.y -= 30*0.001; p.addScaledVector(v, 0.001); if(v.y<0 && p.y<=0){ landed=p.clone(); break; } }
  assert(landed, 'the arc comes back down');
  near(landed.x, 14, 0.25, 'lands on the target x');
  near(landed.z, 6, 0.25, 'lands on the target z');
}
{
  const b = { id: 9002, pos: new THREE.Vector3(0,0,0), nades: 2, _nadeCd: 0 };
  assert(_botThrowGrenade(b, 60, 0, 0)===false && b.nades===2, 'out of range: no throw, grenade kept');
  near(b._nadeCd, 0.6, 1e-9, '...just a brief re-check delay');
  b._nadeCd = 0;
  assert(_botThrowGrenade(b, 2, 0, 0)===false && b.nades===2, 'danger-close: never lobs at its own feet');
}

// ---- wiring: when bots throw ----
const ub = extractFunction('updateBots', src);
assert(/if\(!hasLOS && b\.lkpFresh>0 && b\.lkpFresh<2\.2 && b\.lkp\) _botThrowGrenade\(b, b\.lkp\.x, b\.lkp\.z, b\.pos\.y\);/.test(ub),
  'the flush-out: target just broke contact -> lob onto its last-known spot');
assert(/else if\(hasLOS && tgtDist>9 && tgtDist<24 && Math\.random\(\)<dt\*0\.15\) _botThrowGrenade\(/.test(ub),
  'rare direct lob at medium-long range (per-second chance, not per-frame spam)');
assert(/\(b\.nades\|\|0\)>0 && \(b\._nadeCd\|\|0\)<=0 && tgt && !\(typeof matchWarmup!=='undefined' && matchWarmup>0\) && !\(b\._reactT>0\)/.test(ub),
  'gated on stock, cooldown, warmup and the human reaction beat');
assert(/nades:\(MP_RULES\.nades===0\?0:2\), _nadeCd:4\+Math\.random\(\)\*5/.test(src), 'bots spawn with 2 grenades (none when the host disables them, build 1014), staggered first use');
assert(/b\.nades=\(MP_RULES\.nades===0\?0:2\); b\._nadeCd=4\+Math\.random\(\)\*5; b\._crouch=false;/.test(ub), 'respawn refills the stock (rule-aware) and stands the bot up');

// ---- PvP blast damage in explodeGrenade ----
const eg = extractFunction('explodeGrenade', src);
assert(/if\(typeof pvpMode==='function' && pvpMode\(\)\)\{/.test(eg), 'PvP branch exists');
assert(/if\(bt\.dead \|\| bt\.id===by \|\| sameTeam\(by, bt\.id\)\) continue;/.test(eg), 'thrower + team-mates immune among bots');
assert(/if\(botHurt\(bt, GRENADE\.damage \* f, pos\.x, pos\.z\)\) registerDuelKill\(by, bt\.id\);/.test(eg), 'bot blast kills credit the thrower');
assert(/bt\.evx=\(bt\.evx\|\|0\)\+\(kx\/kh\)\*kb; bt\.evz=\(bt\.evz\|\|0\)\+\(kz\/kh\)\*kb;/.test(eg), 'bots take blast knockback too');
assert(/if\(d<R\) sendToPlayer\(\+id, \{t:'pvpHit', d:GRENADE\.damage\*\(1-d\/R\), from:by\}\);/.test(eg), 'remote players take falloff damage');
assert(/if\(\+id===by \|\| sameTeam\(by, \+id\)\) continue;/.test(eg), '...unless thrower or team-mate');
assert(/if\(by!==NET\.myId && !duelDead\)\{ const d=player\.pos\.distanceTo\(pos\); if\(d<R\) applyPvpDamage\(GRENADE\.damage\*\(1-d\/R\), by\);/.test(eg),
  'the host is hurt by OPPONENT grenades only (own stays a free grenade-jump)');
assert(/\} else \{\n  for\(const en of enemies\.slice\(\)\)\{/.test(eg), 'co-op keeps the original enemies AoE');

// ---- crouch-at-cover ----
assert(/if\(b\.aiState!=='retreat'\) b\._coverHold=1\.4\+Math\.random\(\)\*1\.2;/.test(ub), 'entering retreat arms a recovery beat');
assert(/else if\(b\._cover && _atCover\)\{ destX=b\._cover\.x; destZ=b\._cover\.z; b\._crouch=true; b\._coverHold=Math\.max\(0,\(b\._coverHold\|\|0\)-dt\); \}/.test(ub),
  'reaching cover HOLDS it crouched while the beat runs down (was: kept running past it)');
assert(/\(hpFrac > b\.bravery\+0\.18 \|\| \(!hasLOS && \(b\._coverHold\|\|0\)<=0\)\)/.test(ub),
  'retreat only ends after the hold expires (breaking LOS alone no longer ends it instantly)');
assert(/b\._cover=null; b\._crouch=false;/.test(ub), 'leaving retreat stands back up');
assert(/st=\(tier==='idle'\)\?\(b\._crouch\?'crouch':'idle'\)/.test(ub), 'a bot holding cover plays the crouch clip');

done('build 1006: bot grenades (flush-out + long lob), crouch-at-cover hold, PvP grenade damage');
