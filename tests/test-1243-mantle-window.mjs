// build 1243: the mantle grabs the right ledges — reported from play with screenshots, two symptoms,
// two mechanisms: (1) a KNEE-HIGH box triggered a full hang (MANTLE_MIN was STEP+0.05 = 0.65 — the
// character knelt on the box gripping air); a hang is for ledges above head height, below that you
// just jump on — MANTLE_MIN is now 1.55. (2) A perfect chest-plus box beside a TALLER one refused to
// grab: the UNCEILINGED surfaceTopAt read the neighbour's top, rise came back over MANTLE_MAX for the
// whole jump — 1233's exact bug class, alive in mantleLedge. Both probes now ceiling at the reach
// window. Plus: the hang height clamps so feet never go through the floor on low-window ledges.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the real mantleLedge over real geometry
const scene = new THREE.Scene();
const boxes = [];
const mkBox = (x, z, sx, sz, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz)); m.position.set(x, h / 2, z); m.updateMatrixWorld(true); scene.add(m); boxes.push(m); return m; };
mkBox(0, -10, 4, 4, 2.4);      // the MEDIUM box — chest-plus, the perfect pull-up
mkBox(0, -14, 4, 4, 5.0);      // the TALLER box directly behind it (the masking neighbour)
mkBox(20, -10, 4, 4, 0.9);     // a knee-high box

const env = {
  THREE,
  _downRay: new THREE.Raycaster(), _downDir: new THREE.Vector3(0, -1, 0), _downOrigin: new THREE.Vector3(),
  _surfCull: () => boxes, _cgQuery: () => [], _cgSurf: 0,
  dynamicProps: [], _vehicleMeshes: [], heldProp: null,
  terrainHeightAt: () => 0,
  STEP: 0.6, MANTLE_MIN: null, MANTLE_MAX: null,   // read from source below
  clearAt: () => true, ceilingAt: () => Infinity, effPlayerHeight: () => 1.9, PLAYER_HEIGHT: 1.9,
};
const MIN = +src.match(/const MANTLE_MIN = ([0-9.]+), MANTLE_MAX = ([0-9.]+)/)[1];
const MAX = +src.match(/const MANTLE_MIN = ([0-9.]+), MANTLE_MAX = ([0-9.]+)/)[2];
env.MANTLE_MIN = MIN; env.MANTLE_MAX = MAX;
const fns = new Function(...Object.keys(env),
  extractFunction('surfaceTopAt') + '\n' + extractFunction('mantleLedge') + '\nreturn { mantleLedge, surfaceTopAt };'
)(...Object.values(env));

{ // symptom 2 replayed: the medium box in front of a taller one
  // probe point just inside the medium box's near face (z=-8), player mid-jump with feet at 0.6
  const grab = fns.mantleLedge(0, -8.2, 0.6);
  near(grab, 2.4, 0.01, 'the medium box GRABS mid-jump even with a 5 m box directly behind it — the ceilinged probe reads THIS ledge, not the neighbour\'s roof');
  // the same geometry through an UNceilinged read, to prove that was the mask:
  near(fns.surfaceTopAt(0, -12.2), 5.0, 0.01, '(the unceilinged read at the boundary really does see the tall box — the masking was real)');
}
{ // from the ground the medium box is out of reach; rising into the window grabs it
  eq(fns.mantleLedge(0, -8.2, 0), null, 'feet on the ground: 2.4 is beyond MANTLE_MAX — no grab yet');
  near(fns.mantleLedge(0, -8.2, 0.5), 2.4, 0.01, '...half a metre into the jump the rise enters the window and it grabs');
}
{ // symptom 1 replayed: the knee-high box never hangs
  eq(fns.mantleLedge(20, -8.2, 0), null, 'a 0.9 m box does NOT hang (rise 0.9 < MANTLE_MIN 1.55) — you just jump onto it; the kneel-on-top air-grip is gone');
  assert(MIN >= 1.5, 'MANTLE_MIN is above head-ish height — a hang means the ledge is genuinely over you');
  eq(MAX, 2.05, 'MANTLE_MAX unchanged — tall walls still refuse');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/surfaceTopAt\(fx, fz, undefined, undefined, feetY \+ MANTLE_MAX \+ 0\.25\)/.test(src),
    'mantleLedge probes with the reach-window ceiling (1233\'s rule, applied to the function 1233 missed)');
  assert(/surfaceTopAt\(player\.pos\.x\+_gFwd\.x\*_d, player\.pos\.z\+_gFwd\.z\*_d, undefined, undefined, _lt \+ 0\.5\)/.test(src),   // build 1290: _gFwd is the direction the character is GOING (in side-scroll `forward` is the zero vector)
    'the wall-face scan ceilings too — it must find THIS ledge\'s wall, not a taller neighbour\'s');
  assert(/const _hy=Math\.max\(_lt \+ EYE - LEDGE_REACH, _gy \+ EYE - 0\.12\);/.test(src),   // build 1289: the reach term is the player's own, not the drawn body's
    'the hang height clamps at the ground — a low-window ledge stands the body at the wall base, arms up, instead of burying the feet');
}

done('build 1243: the mantle grabs the right ledges — the real mantleLedge driven over real boxes: a 2.4 m ledge grabs mid-jump despite a 5 m box directly behind it (with the unceilinged read proven to see the masker), ground-level is out of reach until the jump enters the window, a knee-high box never hangs again, and the hang height can no longer put feet through the floor');
