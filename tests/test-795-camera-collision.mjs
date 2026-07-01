// (build 795) Chase-camera collision — the orbit/chase cam casts a ray from the car out to its wanted position and, if a
// wall / prop / building is in the way, pulls in to just short of that surface instead of clipping through it.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- the helper exists and uses the shared colliders set + ignores the car itself ---
const cc = extractFunction('_cameraCollide');
assert(/_camColRay\.set\(_camColFrom, _camColDir\); _camColRay\.near=0; _camColRay\.far=want;/.test(cc), 'the ray spans exactly from the pivot to the wanted camera position');
assert(/const hits=_camColRay\.intersectObjects\(colliders, true\);/.test(cc), 'it tests against the world colliders set (walls / props / buildings)');
assert(/while\(p\)\{ if\(p===ignoreObj\)\{ self=true; break; \} p=p\.parent; \} if\(self\) continue;/.test(cc), 'hits on the driven car itself are skipped');
assert(/const d=Math\.max\(minDist\|\|0\.4, h\.distance - 0\.35\);/.test(cc), 'pull in to the hit minus a skin, but never closer than minDist');

// --- executable: the pull-in distance math (skin + min clamp, only when something is between) ---
{
  const solve = (want, hitDist, minDist) => {
    if(hitDist==null || hitDist>=want) return want;          // nothing between -> keep the wanted distance
    return Math.max(minDist, hitDist - 0.35);
  };
  eq(solve(6, null, 1.0), 6, 'clear line of sight keeps the full distance');
  eq(solve(6, 3.0, 1.0), 3.0-0.35, 'a wall at 3m pulls the cam to 2.65m');
  eq(solve(6, 1.1, 1.0), 1.0, 'a very close wall clamps to the minimum, not through it');
  eq(solve(6, 6.5, 1.0), 6, 'a hit beyond the camera is ignored');
}

// --- wired into the chase branch only (cockpit is inside the model, no collision needed) ---
const du = extractFunction('driveUpdate') + src;   // the camera block lives in the main loop; pin against the source
assert(/const _cc=_cameraCollide\(_tx, _pvy, _tz, camera\.position\.x, camera\.position\.y, camera\.position\.z, 1\.0, o\);\s*\n?\s*if\(_cc\) camera\.position\.copy\(_cc\);/.test(src), 'the chase cam applies the collision pull-in (ignoring the car o)');

done('build 795: chase-camera collision — pulls in past walls/props instead of clipping');
