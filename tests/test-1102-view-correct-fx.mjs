// build 1102: gunfire FX finally match the camera view.
//
// Three FPS leftovers surfaced in top-down/side (and chase) play:
//  - the local muzzle flash was a CAMERA-attached light + a viewmodel flipbook — from a
//    bird's-eye camera that lit the arena from the sky;
//  - netFire broadcast origin=player.pos with the CAMERA's direction — in top-down that is
//    straight down, so everyone else saw your tracers firing into the ground;
//  - recoil kicked player.pitch, which isn't the aim in cursor views — it silently corrupted
//    the stored pitch for later first-person play. Grenades in chase view also spawned at the
//    camera (behind/above the character) instead of leaving the character's hands.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// flash: world-space at the character's barrel in third-person/top/side; viewmodel flash in FPS
assert(/if\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\) muzzleFlashAt\(muzzleWorld\);/.test(src),
  'non-FPS shots flash at the real muzzle, in the world');
assert(/else \{ muzzle\.intensity = 6; flashMat\.opacity = 1;/.test(src),
  'first person keeps its camera light + viewmodel flipbook');

// network: origin is the muzzle, direction is the actual aim (cursor target in twin-stick)
assert(/if\(_vmA\) _fd\.copy\(_vmTgt\)\.sub\(_vmOrig\)\.normalize\(\); else camera\.getWorldDirection\(_fd\);\n    netFire\(muzzleWorld, _fd\); \}/.test(src),
  'netFire broadcasts the muzzle origin and the true aim direction');
assert(!/netFire\(player\.pos, _fd\)/.test(src), 'the old player.pos + camera-gaze broadcast is gone');

// recoil: first-person only
assert(/if\(activeViewMode\(\)==='fps'\)\{\n    recoil = Math\.min\(recoil/.test(src),
  'recoil + pitch kick only apply when the pitch IS the aim');

// rockets: same flash split, same pitch gate
assert(/if\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\)\{ const _mp=new THREE\.Vector3\(\); if\(typeof tpMuzzleWorld==='function'\) tpMuzzleWorld\(_mp\); else _mp\.copy\(o\); muzzleFlashAt\(_mp\); \}/.test(src),
  'rocket launches flash at the character too');
assert(/addShake\(0\.22\); if\(activeViewMode\(\)==='fps'\) player\.pitch \+= 0\.02;/.test(src),
  'rocket pitch kick is FPS-only');

// grenades: chase view throws leave the character's hands
assert(/if\(typeof tpActive==='function' && tpActive\(\)\) origin\.set\(player\.pos\.x, player\.pos\.y\+0\.4, player\.pos\.z\)\.addScaledVector\(dir, 0\.8\);/.test(src),
  'a chase-view grenade spawns at the character, not behind the camera');

done('build 1102: flashes, tracers, recoil and grenades respect the camera view');
