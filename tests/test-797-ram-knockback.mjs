// (build 797) Ramming an actor with a vehicle sends it FLYING, not just damaged. The ram uses the existing launch channel
// (evx/evz horizontal knockback + vy pop + grounded=false so the AI stops fighting and it tumbles). The fling is mostly the
// car's travel direction plus a radial nudge (off-centre hits throw sideways), scaled by speed; a lethal ram ragdolls the
// corpse away from the car (car position is passed to the hurt call). Rival players are flung via the pvpHit message.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const cra = extractFunction('_carRamActors');

// --- the fling is derived from the car's travel direction + speed ---
assert(/const _tvy=\(o\.userData\.carVelYaw!=null\?o\.userData\.carVelYaw:\(o\.userData\.carYaw\|\|0\)\);/.test(cra), 'fling uses the car travel heading');
assert(/const _kbMag=Math\.min\(8 \+ _sp\*0\.85, 44\), _upMag=Math\.min\(3\.5 \+ _sp\*0\.16, 11\);/.test(cra), 'knockback + pop scale with car speed (capped)');

// --- enemies get horizontal knockback + a pop + go airborne, then take damage from the car position ---
assert(/en\.evx=\(en\.evx\|\|0\)\+F\.kx; en\.evz=\(en\.evz\|\|0\)\+F\.kz; en\.vy=Math\.max\(en\.vy\|\|0,F\.ky\); en\.grounded=false;/.test(cra), 'enemies are launched (evx/evz/vy + airborne)');
assert(/enemyHurt\(en, dmg, o\.position\.x, o\.position\.z\)/.test(cra), 'a lethal ram ragdolls the corpse away from the car');
assert(/b\.evx=\(b\.evx\|\|0\)\+F\.kx; b\.evz=\(b\.evz\|\|0\)\+F\.kz; b\.vy=Math\.max\(b\.vy\|\|0,F\.ky\); b\.grounded=false;/.test(cra), 'bots are launched too');

// --- rival players are flung via the network message, applied on their own client ---
assert(/sendToPlayer\(\+id, \{t:'pvpHit', d:dmg, kx:F\.kx, kz:F\.kz, ky:F\.ky, from:NET\.myId\}\)/.test(cra), 'the ram sends a knock vector to the rival');
assert(/msg\.t==='pvpHit'\)\{ applyPvpDamage\(msg\.d, msg\.from\); if\(msg\.kx!=null\)\{ player\.extVel\.x\+=msg\.kx; player\.extVel\.z\+=msg\.kz; player\.vel\.y=Math\.max\(player\.vel\.y,msg\.ky\|\|0\); player\.onGround=false; \}/.test(src), 'the receiver applies the fling to its own player');

// --- executable: the fling direction math (forward-biased, radial nudge, unit-scaled to the magnitude) ---
{
  const fling = (dfx,dfz, opx,opz, px,pz, kb,up) => {
    const rx=px-opx, rz=pz-opz, rl=Math.hypot(rx,rz)||1;
    let bx=dfx*0.82 + (rx/rl)*0.5, bz=dfz*0.82 + (rz/rl)*0.5; const bl=Math.hypot(bx,bz)||1;
    return { kx:(bx/bl)*kb, kz:(bz/bl)*kb, ky:up };
  };
  // car heading -Z (dfz=-1), enemy dead ahead -> flung straight ahead (-Z), magnitude = kb
  const f = fling(0,-1, 0,0, 0,-2, 20, 6);
  assert(Math.abs(f.kx) < 1e-9, 'a head-on hit flings straight ahead (no sideways)');
  assert(Math.abs(Math.hypot(f.kx,f.kz) - 20) < 1e-9, 'the horizontal knockback equals the magnitude');
  eq(f.ky, 6, 'the pop-up is the vertical magnitude');
  // an off-centre enemy (to the right) gets a sideways component
  const g = fling(0,-1, 0,0, 3,-1, 20, 6);
  assert(g.kx > 0, 'an enemy off to the side is thrown sideways too');
}

done('build 797: vehicle rams launch actors (fling + tumble), not just damage');
