import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 640: ledge mantle — jump/fall toward a chest/head-high ledge while pushing forward and you grab + pull up
// onto it. mantleLedge(fx,fz,feetY) is the reusable probe; the movement loop runs the hang->pull-up.

// --- tunables: a mantle-able ledge is TALLER than an auto-step but within reach ---
assert(/const MANTLE_MIN = STEP \+ 0\.05, MANTLE_MAX = 2\.05, MANTLE_DUR = 0\.42;/.test(src), 'MANTLE_MIN = STEP+0.05 (taller than an auto-step, so plain steps do not trigger a climb)');
const MIN = 0.6 + 0.05;   // STEP + 0.05

// --- wiring in the movement loop (build 644: grab now HANGS, then pull-up or drop) ---
assert(/if\(!_ledge && _jPressed && player\.onGround/.test(src), 'a fresh jump is suppressed on the frame a ledge is grabbed');
assert(/const _lt = mantleLedge\(_fx, _fz, _fy\);/.test(src), 'movement probes for a ledge in front');
assert(/wish\.dot\(forward\) > 0\.5/.test(src), 'only grabs when actually pushing forward (input-agnostic: keys or stick)');
assert(/_ledge = \{ ph:'hang'/.test(src), 'grabbing a ledge starts in the HANG phase');
assert(/player\.pos\.y = _ledge\.fy0 \+ \(_ledge\.ty-_ledge\.fy0\)\*_up;/.test(src), 'the pull-up phase rises then sweeps forward onto the top');

// --- executable: the probe accepts a real ledge, rejects too-low / too-tall / no-headroom / no-stand ---
const probe = new Function('TOP','CAN_STAND','CEIL', `
  const STEP=0.6, PLAYER_HEIGHT=1.85;
  function surfaceTopAt(){ return TOP; }
  function clearAt(){ return CAN_STAND; }
  function ceilingAt(){ return CEIL; }
  function effPlayerHeight(){ return PLAYER_HEIGHT; }
  const MANTLE_MIN = ${MIN}, MANTLE_MAX = 2.05;
  ${extractFunction('mantleLedge')}
  return mantleLedge(0, 0, 0);   // feet at y=0
`);
eq(probe(1.2, true, Infinity), 1.2, 'a 1.2m ledge with room -> mantle-able (returns the ledge top)');
eq(probe(0.4, true, Infinity), null, 'a 0.4m step is too low -> no mantle (you just walk up)');
eq(probe(2.6, true, Infinity), null, 'a 2.6m wall is too tall -> no mantle');
eq(probe(1.2, false, Infinity), null, 'no standable spot on top -> no mantle');
eq(probe(1.2, true, 1.2 + 1.0), null, 'a low ceiling above the ledge -> no mantle (no headroom)');

done('ledge mantle: pull up onto chest/head-high ledges + objects (build 640)');
