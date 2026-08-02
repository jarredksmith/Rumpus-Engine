import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// LOS history: build 432/449 tested at body height; build 474 switched off the poisoned insideSolid; build 477
// replaced per-sample clearAt (16 raycasts/check, which tanked the FPS) with ONE direct mesh raycast — cheaper
// AND immune to the over-occupied voxelizer boxes because it tests real triangles. A short per-bot cache means
// it isn't even run every frame.

const los = extractFunction('_botLOS');
assert(/function _botLOS\(ex,ez,tx,tz,eyeY\)\{/.test(los), 'LOS accepts the shooter eye/floor height');
assert(/_losRay\.intersectObjects\(colliders, true\)/.test(los), 'LOS is a single raycast against the collider meshes');
assert(/_losRay\.far=dist-0\.3;/.test(los), 'the ray stops just short of the target (no self-hit)');
assert(/const oy=\(eyeY!=null\?eyeY:0\)\+1\.3;/.test(los), 'sightline cast at chest height');
assert(!/!clearAt\(x,z/.test(los) && !/insideSolid\(/.test(los), 'no per-sample clearAt/insideSolid CALLS (that was the FPS killer)');

// caching + reuse: perception computes LOS ~10x/s; the fire gate reuses it (no second raycast per shot)
const ub = extractFunction('updateBots');
assert(/if\(b\._losT<=0 && _losBudget>0\)\{ _losBudget--; b\._los = !!\(tgt && _botLOS\(b\.pos\.x,b\.pos\.z, tgt\.pos\.x,tgt\.pos\.z, b\.pos\.y\)\); b\._losT=0\.1\+Math\.random\(\)\*0\.05; \}/.test(ub), 'LOS cached ~10x/s per bot AND capped per frame by _losBudget (build 547)');
assert(/const hasLOS = b\._los && !!tgt;/.test(ub), 'perception reads the cached LOS');
assert(/if\(fdist<_bRange && hasLOS\)\{/.test(ub), 'fire gate reuses the cached LOS (one raycast, not two)');   // build 1297: _bRange is D.range for a gun, the weapon's reach for a melee weapon
assert((src.match(/_botLOS\(b\.pos\.x,b\.pos\.z, tgt\.pos\.x,tgt\.pos\.z, b\.pos\.y\)/g)||[]).length===1, 'only ONE _botLOS call site now (the cached perception)');

// movement is NOT region-gated (unchanged from 449)
assert(!/const wasIn = _inRegion\(b\.pos\.x, b\.pos\.z\);/.test(ub), 'movement does not track region membership');
assert(/The arena walls \+ props are the only movement boundary/.test(ub), 'comment documents the spawn-only intent');

// --- executable: the raycast LOS contract (hit before target => blocked) ---
function los2d(ex,ez,tx,tz, wallX){   // a wall plane at x=wallX; ray blocked if it crosses it before the target
  const dist=Math.hypot(tx-ex,tz-ez); if(dist<1e-3) return true;
  if((ex<wallX)===(tx<wallX)) return true;            // both on same side -> wall not between them
  const t=(wallX-ex)/(tx-ex);                          // param where the ray crosses the wall plane
  return !(t>0 && t*dist < dist-0.3);                  // crossing before (target - 0.3) => blocked
}
assert(los2d(0,0, 5,0, 2)===false, 'wall between shooter and target blocks LOS');
assert(los2d(0,0, 1.5,0, 2)===true, 'wall past the target does not block');
assert(los2d(3,0, 5,0, 2)===true, 'both past the wall -> clear');
done();
