// (build 891) GRENADES THREW FROM A FIRST-PERSON PERSPECTIVE in top-down / side view — the throw used
// the CAMERA's position + forward vector, so from a bird's-eye camera the grenade spawned ~28m up in
// the sky and slammed straight down at the player's feet. Now (like build 885 gunfire) the throw starts
// at the player's chest and solves the ballistic arc (g=30, matching updateGrenades) that lands ON the
// cursor, range-capped by GRENADE.throwForce. Verified headless: top-down lob at a 13m cursor spawns at
// the chest (not the sky camera) and blasts ~cursor (+ the natural bounce-roll); a 58m cursor lands at
// the ~29m cap; side-view velocity stays in the play plane (zero out-of-plane component); FPS unchanged.
import { gameSource, extractFunction, assert, near, done } from './harness.mjs';

const src = gameSource();
const fn = extractFunction('throwGrenade', src);

// ---- view-aware branch: chest origin + cursor target ----
assert(/if\(typeof activeViewMode==='function' && activeViewMode\(\)!=='fps'\)\{/.test(fn), 'branches on the live view mode');
assert(/origin = new THREE\.Vector3\(player\.pos\.x, player\.pos\.y-0\.2, player\.pos\.z\);/.test(fn), 'lob originates at the player chest, not the sky camera');
assert(/raycaster\.setFromCamera\(_vAimTmpNdc\.set\(_vAimNdc\.x, _vAimNdc\.y\), camera\);/.test(fn), 'the cursor ray resolves the landing target');
assert(/const tgt = _hits\.length \? _hits\[0\]\.point\.clone\(\) : _vAimPt\.clone\(\);/.test(fn), 'empty space falls back to the aim-plane point (same as gunfire)');
assert(/if\(tgt\.distanceToSquared\(origin\) < 1\)/.test(fn), 'cursor on top of yourself lobs where you face, not a zero-length arc');

// ---- ballistic solve, range-capped ----
assert(/const maxR = Math\.max\(6, \(\+GRENADE\.throwForce\|\|26\)\*1\.1\);/.test(fn), 'reach still scales with the throwForce tuning dial');
assert(/const dy = \(d0>maxR\) \? 0 : \(tgt\.y-origin\.y\);/.test(fn), 'an out-of-range cursor lands short at your own height, not a far target\'s');
assert(/const apex = Math\.max\(0, dy\) \+ 2\.2 \+ d\*0\.10;/.test(fn), 'arc clears low cover; longer lobs fly higher');
assert(/const vy = Math\.sqrt\(60\*apex\);/.test(fn), 'v² = 2·g·apex with g = 30');
assert(/const t {2}= vy\/30 \+ Math\.sqrt\(Math\.max\(0\.01, 2\*\(apex-dy\)\/30\)\);/.test(fn), 'flight time = rise + fall');
assert(/vel = new THREE\.Vector3\(dx\/t, vy, dz\/t\);/.test(fn), 'horizontal speed = distance / flight time (the lob LANDS on the cursor)');
// g must match the integrator or the lob misses — pin the same constant in updateGrenades
assert(/g\.fuse -= dt; g\.vel\.y -= 30\*dt;/.test(src), 'the solve gravity (30) matches updateGrenades');

// ---- the formula really lands on the target: integrate y(t) analytically for a few arcs ----
for(const [d, dy] of [[13.4, -1.3], [5, 0], [20, 3], [8, -6]]){
  const apex = Math.max(0, dy) + 2.2 + d*0.10;
  const vy = Math.sqrt(60*apex);
  const t = vy/30 + Math.sqrt(Math.max(0.01, 2*(apex-dy)/30));
  near(vy*t - 15*t*t, dy, 1e-9, `arc (d=${d}, dy=${dy}) lands at the target height`);
  const vh = d/t;
  assert(vh > 0 && isFinite(vh), 'horizontal speed is finite and positive');
}

// ---- first person untouched ----
assert(/\} else \{\s*\n\s*origin = new THREE\.Vector3\(\); camera\.getWorldPosition\(origin\);/.test(fn), 'fps still throws from the camera');
assert(/vel = dir\.multiplyScalar\(GRENADE\.throwForce\); vel\.y \+= 5; \/\/ arc/.test(fn), '...with the classic +5 arc');

done('build 891: grenades lob from the body onto the cursor in top-down / side view');
