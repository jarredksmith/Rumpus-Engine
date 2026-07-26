// (build 799) The on-foot third-person camera clipped through walls and props. Its old collision was a NON-recursive ray
// straight back from the pivot — it missed props whose geometry sits in child meshes, and it ignored the over-the-shoulder
// side/height offset (the camera actually sits beside that ray). It now reuses _cameraCollide, which casts recursively to
// the REAL offset camera position, so nested prop/model meshes count and an OTS camera can't punch through geometry.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const tp = extractFunction('tpCameraPushback');

// the full offset camera position is computed first, then collided
// build 1086: computed by _tpFrame, then taken here for the damping + collision passes
assert(/let camx = _f\.x, camy = _f\.y, camz = _f\.z;/.test(tp) &&
  /_TPF\.x = pivot\.x - fx\*dist \+ rx\*side;/.test(extractFunction('_tpFrame')),
  'the OTS camera position (side + height + distance) is computed');
assert(/_cameraCollide\(px, py, pz, camx, camy, camz, TP_MIN, \(typeof _ownAvatar!=='undefined'\?_ownAvatar:null\)\)/.test(tp), 'it collides pivot -> real camera position, ignoring the player\'s own body');
assert(/if\(_cc\)\{ camx=_cc\.x; camy=_cc\.y; camz=_cc\.z; \}/.test(tp), 'a blocked camera is pulled in to the surface');

// the shared helper casts RECURSIVELY (so nested prop/model geometry is caught — the old ray used false)
const cc = extractFunction('_cameraCollide');
assert(/intersectObjects\(colliders, true\)/.test(cc), 'the collision ray is recursive (nested prop/model meshes count)');

// the old non-recursive straight-back ray is gone
assert(!/_tpCaster\.intersectObjects\(colliders, false\)/.test(tp), 'the old non-recursive straight-back ray is removed');

done('build 799: third-person camera collision — recursive, full-offset, no more clipping through props');
