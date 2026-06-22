import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 537: the mount camera is lifted above the model's top so a large GLB can't seat the player inside
// the mesh. The model's scale-1 bounding box is captured on load; turretEyeWorld clamps the eye height up.
assert(/g\.userData\._modelBox=\{ maxY:_bx\.max\.y\/_s2/.test(src), 'buildTurret records the model bbox (scale-1) on load');
assert(/let ey=e\[1\]; const bb=g\.userData\._modelBox; if\(bb && isFinite\(bb\.maxY\)\) ey=Math\.max\(ey, bb\.maxY\+0\.45\)/.test(src), 'turretEyeWorld lifts the eye above the model top');
// the clamp: a tall model pushes the camera above its top; an already-high authored eye is left alone
const clampEye = (eY, maxY) => Math.max(eY, maxY + 0.45);
eq(clampEye(1.45, 5.0), 5.45, 'tall model (top 5) -> camera lifted to 5.45, clear of the mesh');
eq(clampEye(3.0, 0.5), 3.0, 'authored eye already above the model top is preserved');
done();
