import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 535: the turret editor tab gets the same Poly Pizza / Sketchfab model search as the gun, scoped to
// the shared turret model (sets turretModelUrl + rebuilds every turret).
assert(/renderModelSearch\(tpsHost,/.test(src), 'turret tab mounts the shared model-search widget');
assert(/turretModelUrl=m\.glb; rebuildTurretVisuals\(\)/.test(src), 'picking a model sets the shared turret URL and rebuilds the turrets');
done();
