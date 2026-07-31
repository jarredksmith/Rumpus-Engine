// build 1244: the mantle probe reaches the wall — PROBED IN THE LIVE GAME headless (real KCC mover,
// spawned boxes, synthesized input, a frame tap on the grab gate): the gate entered, the player was
// airborne at grab heights, and mantleLedge returned NULL on every frame of every jump. The single
// probe 0.55 ahead of the player's CENTRE never cleared the KCC's capsule standoff (radius 0.8), so
// it sampled the open ground at the player's feet — which is why 1239's pose fix and 1243's window
// and ceiling fixes all changed nothing in play: the probe never landed on the box at all. The grab
// now scans outward to arm's reach (0.45/0.7/0.95/1.2) and the first grabbable top wins; the same
// live probe re-run on this build recorded hang -> pull chains up 7.7 m of stock architecture.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the standoff geometry, replayed
const scene = new THREE.Scene();
const boxes = [];
const mkBox = (x, z, sx, sz, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz)); m.position.set(x, h / 2, z); m.updateMatrixWorld(true); scene.add(m); boxes.push(m); return m; };
mkBox(0, -10, 3, 3, 1.9);   // near face at z = -8.5

const MIN = +src.match(/const MANTLE_MIN = ([0-9.]+), MANTLE_MAX = ([0-9.]+)/)[1];
const MAX = +src.match(/const MANTLE_MIN = ([0-9.]+), MANTLE_MAX = ([0-9.]+)/)[2];
const env = {
  THREE,
  _downRay: new THREE.Raycaster(), _downDir: new THREE.Vector3(0, -1, 0), _downOrigin: new THREE.Vector3(),
  _surfCull: () => boxes, _cgQuery: () => [], _cgSurf: 0,
  dynamicProps: [], _vehicleMeshes: [], heldProp: null,
  terrainHeightAt: () => 0,
  STEP: 0.6, MANTLE_MIN: MIN, MANTLE_MAX: MAX,
  clearAt: () => true, ceilingAt: () => Infinity, effPlayerHeight: () => 1.9, PLAYER_HEIGHT: 1.9,
};
const fns = new Function(...Object.keys(env),
  extractFunction('surfaceTopAt') + '\n' + extractFunction('mantleLedge') + '\nreturn { mantleLedge };'
)(...Object.values(env));

{ // the player's centre held 0.8 off the face (z = -7.7): where does each probe distance land?
  const pz = -7.7, feet = 0.2;   // mid-hop, ledge top 1.9 -> rise 1.7, inside the window
  eq(fns.mantleLedge(0, pz - 0.55, feet), null,
    'the OLD single probe (0.55 ahead) lands 0.25 SHORT of the face — open ground, null: the exact live-probe finding, and why every earlier tuning change felt identical');
  near(fns.mantleLedge(0, pz - 0.95, feet), 1.9, 0.01,
    'the scan\'s 0.95 probe lands 0.15 INSIDE the box and grabs');
  near(fns.mantleLedge(0, pz - 1.2, feet), 1.9, 0.01, '...and 1.2 (full arm\'s reach) too');
}
{ // the scan semantics, executed as the grab now runs them
  const scan = (px, pz, feet) => {
    let lt = null, pd = 0.55;
    for (const sd of [0.45, 0.7, 0.95, 1.2]) { lt = fns.mantleLedge(px, pz - sd, feet); if (lt != null) { pd = sd; break; } }
    return { lt, pd };
  };
  const r = scan(0, -7.7, 0.2);
  near(r.lt, 1.9, 0.01, 'the scan finds the ledge from the KCC standoff');
  eq(r.pd, 0.95, '...at the first distance that reaches it');
  eq(scan(0, -3, 0.2).lt, null, 'standing well away from any wall still grabs nothing — the reach is an arm, not a grappling hook');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/for\(const _sd of \[0\.45, 0\.7, 0\.95, 1\.2\]\)\{ _lt = mantleLedge\(player\.pos\.x \+ forward\.x\*_sd, player\.pos\.z \+ forward\.z\*_sd, _fy\); if\(_lt != null\)\{ _pd = _sd; break; \} \}/.test(src),
    'the grab scans outward; first grabbable top wins');
  assert(/const _fx = player\.pos\.x \+ forward\.x\*_pd, _fz = player\.pos\.z \+ forward\.z\*_pd;/.test(src),
    '...and the hang/pull anchor derives from the distance that actually FOUND the ledge');
}

done('build 1244: the mantle probe reaches the wall — the standoff geometry replayed over real boxes proves the old 0.55 probe fell 0.25 short of a face the KCC holds you 0.8 from (null forever, masking every earlier fix), the shipped scan grabs at 0.95 with the anchor derived from the found distance, far-from-wall still grabs nothing, and the live headless re-probe recorded hang-pull chains in the real game');
