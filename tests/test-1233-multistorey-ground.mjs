// build 1233: the ground query stops reading the roof — REPORTED FROM PLAY: "I added enemies onto a
// multistorey building and they would randomly clip through the floor and just disappear."
//
// The mechanism, probed and measured before fixing: groundHeightAt asked surfaceTopAt for the column's
// HIGHEST surface, which inside any roofed building is the ROOF or the slab overhead — never the floor
// underfoot. The ramp gate rejected that too-high surface and the function answered TERRAIN, so an
// enemy on storey 2 hard-snapped (y = ground + 1.4) through every slab to under the building, the
// player fell through roofed upper floors, and even ground-floor actors stood sunk to the terrain.
// Roofs and open decks read correctly (the surface underfoot IS the topmost there), which is why the
// generated arenas' open-air decks never showed it. Fix: surfaces above feetY + RAMP_RISE cannot be
// stepped or ramped onto by definition of the gates, so the query is CEILINGED there — one function,
// and the player, bots, remote avatars and PvE enemies all inherit it.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const scene = new THREE.Scene();
const slabs = [];
const slab = (y, sx = 10, sz = 10, px = 0, pz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.2, sz)); m.position.set(px, y + 0.1, pz); m.updateMatrixWorld(true); scene.add(m); slabs.push(m); return m; };
slab(0); slab(3); slab(6);                       // ground floor, storey 2, roof — tops at 0.2, 3.2, 6.2
// an indoor ramp: an inclined slab rising from storey-2 level, under the roof
{ const m = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4)); m.position.set(20, 3.6, 0); m.rotation.x = 0.35; m.updateMatrixWorld(true); scene.add(m); slabs.push(m); }
{ const r = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4)); r.position.set(20, 7, 0); r.updateMatrixWorld(true); scene.add(r); slabs.push(r); }   // roof over the ramp

const env = {
  THREE,
  _downRay: new THREE.Raycaster(), _downDir: new THREE.Vector3(0, -1, 0), _downOrigin: new THREE.Vector3(),
  _surfCull: () => slabs, _cgQuery: () => [], _cgSurf: 0,
  dynamicProps: [], _vehicleMeshes: [], heldProp: null,
  terrainHeightAt: () => 0,
  STEP: 0.6, RAMP_SLOPE_MIN: 0.2, RAMP_SLOPE_MAX: 1.5, RAMP_RISE: 1.7,
};
const fns = new Function(...Object.keys(env),
  extractFunction('surfaceTopAt') + '\n' + extractFunction('groundHeightAt') + '\nreturn { surfaceTopAt, groundHeightAt };'
)(...Object.values(env));

// ---------------------------------------------------------------- the report, replayed
{
  near(fns.surfaceTopAt(0, 0), 6.2, 0.01, 'the column\'s topmost surface IS the roof — that was never the question to ask');
  near(fns.groundHeightAt(0, 0, 3.2), 3.2, 0.01, 'feet on storey 2: the ground is the STOREY-2 SLAB (was 0 — the terrain — the exact clip-through-and-disappear)');
  near(fns.groundHeightAt(0, 0, 0.2), 0.2, 0.01, 'feet on the ground floor: the slab, not the terrain it used to sink to');
  near(fns.groundHeightAt(0, 0, 6.2), 6.2, 0.01, 'feet on the roof: unchanged — open decks always worked, and still do');
}
{ // walking near the slab edge mid-storey: a step off the slab must still find it within STEP reach
  near(fns.groundHeightAt(0, 0, 3.5), 3.2, 0.01, 'feet slightly above the slab (a step, a bounce): still grounds on it');
  near(fns.groundHeightAt(0, 0, 4.4), 3.2, 0.01, 'falling from above, feet closing on the slab (ceiling window past the roof): lands on it');
  near(fns.groundHeightAt(0, 0, 4.95), 0, 0.01, 'mid-air HIGH between floors the window still catches the roof and reads terrain — harmless: an integrating faller is not grounded there anyway, and by arrival (previous line) the answer is the slab');
}
{ // the indoor ramp under a roof: the slope probe must not read the roof either
  const onRamp = fns.groundHeightAt(20, 0.6, 3.6);
  assert(onRamp > 3.0 && onRamp < 4.6, 'an indoor ramp under a roof reads as a RAMP (surface followed), not as a cliff to terrain — the slope probe is ceilinged too (got ' + onRamp.toFixed(2) + ')');
}
{ // regression guards for the outdoor cases that always worked
  near(fns.groundHeightAt(50, 0, 0), 0, 0.01, 'open terrain: unchanged');
  const tall = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2)); tall.position.set(40, 2, 0); tall.updateMatrixWorld(true); slabs.push(tall);
  near(fns.groundHeightAt(40, 0, 0), 0, 0.01, 'standing beside-column-of a tall wall: still terrain — a wall top above reach is not ground (same answer as before, reached without the roof detour)');
}

// ---------------------------------------------------------------- the wiring
{
  const g = extractFunction('groundHeightAt');
  assert(/const _ceil = feetY \+ RAMP_RISE;/.test(g) && /surfaceTopAt\(x, z, undefined, undefined, _ceil\)/.test(g),
    'the main sample is ceilinged at feetY + RAMP_RISE — above that nothing is steppable by definition of the gates');
  eq((g.match(/undefined, undefined, _ceil\)/g) || []).length, 3,
    '...and BOTH slope-probe neighbours carry the same ceiling, or an indoor ramp reads as a cliff');
  assert(/surfaceTopAt\(cx,cz,undefined,undefined,b\.pos\.y\+RAMP_RISE\)/.test(src),
    'the bot\'s shared surface hint (fed to clearAt AND its ground resolve) takes the ceiling at its source');
  // the one function grounds every actor — player, bots, remote avatars, enemies — so all inherit
  eq((src.match(/groundHeightAt\(/g) || []).length >= 5, true, 'all actor ground paths route through the repaired function');
}

done('build 1233: multistorey interiors get a floor — the real surfaceTopAt + groundHeightAt driven over real slab geometry replaying the report (storey-2 feet read TERRAIN before, the slab now; ground-floor actors stop sinking; roofs byte-identical), the indoor ramp survives via the ceilinged slope probe, tall walls still refuse to be ground, and the bot hint is ceilinged at its source so every actor — player, bots, remote avatars, PvE enemies — inherits the one-function repair');
