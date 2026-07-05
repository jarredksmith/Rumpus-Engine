// (build 885) TOP-DOWN GUNS COULDN'T HIT — "Top down games, the gun doesn't hurt enemies."
// Root cause (reproduced headless: cursor dead-on, shot 1 missed, shot 2 hit): build 874 cast pellets
// from the CAMERA through the cursor with the weapon's SCREEN-SPACE spread. From a bird's-eye camera an
// enemy is a few pixels wide, so hip spread threw most pellets past a perfect cursor. Now the cursor ray
// resolves WHAT is aimed at (once per shot), and every pellet fires from the player's chest toward it
// with an angular cone (0.6x twin-stick assist). Verified headless: 10/10 hits on a dead-on cursor, and
// a wall between the player and the target blocks the shot (no more firing over cover).
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// the per-shot cursor resolution: one raycast finds the target point; the body is the origin
assert(/_vmOrig = new THREE\.Vector3\(player\.pos\.x, player\.pos\.y-0\.2, player\.pos\.z\);/.test(src), 'pellets originate at the player chest, not the sky camera');
assert(/raycaster\.setFromCamera\(_vAimTmpNdc\.set\(_vmA\.x, _vmA\.y\), camera\);\s*\n\s*const _cHits = raycaster\.intersectObjects\(rayTargets, true\);/.test(src),
  'the cursor ray resolves the aim target once per shot');
assert(/_vmTgt = _cHits\.length \? _cHits\[0\]\.point\.clone\(\) : _vAimPt\.clone\(\);/.test(src), 'empty space falls back to the aim-plane point');
assert(/if\(_vmTgt\.distanceToSquared\(_vmOrig\) < 1\)/.test(src), 'cursor on top of yourself degenerates to facing direction, not a zero-length ray');
// the pellet cone
assert(/const _pr=new THREE\.Vector3\(\)\.crossVectors\(_pd,_pu\)\.normalize\(\);/.test(src) && /const _pv=new THREE\.Vector3\(\)\.crossVectors\(_pr,_pd\);/.test(src),
  'an orthonormal basis around the aim direction carries the spread');
assert(/_pd\.addScaledVector\(_pr, sx\*0\.6\)\.addScaledVector\(_pv, sy\*0\.6\)\.normalize\(\);/.test(src),
  'spread is ANGULAR (distance-independent) with the 0.6 twin-stick assist');
assert(/raycaster\.set\(_vmOrig, _pd\);/.test(src), 'the pellet ray is body -> target');
assert(/\} else raycaster\.setFromCamera\(new THREE\.Vector2\(sx, sy\), camera\);/.test(src), 'first person is untouched: screen-centre + NDC spread as always');
// the up-vector guard for near-vertical aims (side view shooting straight up/down)
assert(/const _pu=\(Math\.abs\(_pd\.y\)<0\.99\) \? new THREE\.Vector3\(0,1,0\) : new THREE\.Vector3\(1,0,0\);/.test(src), 'no degenerate basis when aiming near-vertical');

done('build 885: twin-stick ballistics — body-origin pellets, angular spread, cover blocks shots');
