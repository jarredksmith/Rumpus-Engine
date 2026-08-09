// build 1451 — one walk of the prop list instead of five.
//
// `checkProximity` runs every frame in every mode and walked `propModels` FIVE separate times — anim,
// xanim, npc, interact and vehicle — each re-reading every prop's `userData` to test one rare flag, plus a
// `propModels.concat(_gridCars)` allocating an array every frame (build 1168's class). On the 959-prop
// gauntlet-scale fixture that is ~4,800 iterations a frame to answer "is there anything to press E on",
// and the answer is almost always no.
//
// The ANSWER must not change — including the priority order and every tie-break — which is what this test
// is for. It reconstructs the pre-1451 five-walk form from the shipped text and drives both against the
// same worlds, so the equivalence is proven rather than asserted (builds 1434/1435/1437's pattern).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

/* ---- EXECUTED: the shared distance helper ----------------------------------------------------------- */
const dist = (ud, o, p) => new Function('UD', 'O', 'P', `
  ${extractFunction('_interDist', src)}
  return _interDist(O, UD, P[0], P[1], P[2]);
`)(ud, o, p);

{
  const box = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } };
  eq(dist({ box }, { position: { x: 0, y: 0, z: 0 } }, [0, 1, 0]), 0, 'inside the box is distance zero');
  eq(dist({ box }, { position: { x: 0, y: 0, z: 0 } }, [3, 1, 0]), 2, 'beside it is the gap to the face');
  // 3D, so a door one storey up does not prompt from the floor below — this is what makes it a footprint
  // distance rather than a floorplan one
  eq(dist({ box }, { position: { x: 0, y: 0, z: 0 } }, [0, 7, 0]), 5, 'above it counts the height');
  near(dist({}, { position: { x: 3, y: 4, z: 0 } }, [0, 0, 0]), 5, 1e-9,
    'a prop with no box yet falls back to its origin, rather than reading undefined');
}

/* ---- the equivalence: the new walk against a reconstruction of the old five ------------------------- */
// The five walks are gone from the source, so the OLD form is rebuilt here from the same predicates and
// radii the shipped code carries — lifted where possible, and the radii read out of the shipped block so a
// retune cannot make this test quietly measure a different engine.
const RADII = (() => {
  const m = /let _bAnim=null, _dAnim=([\d.]+), _bXa=null, _dXa=([\d.]+), _bNpc=null, _dNpc=([\d.]+), _bUse=null, _dUse=([\d.]+);/.exec(src);
  assert(m, 'read the four interact radii out of the shipped block');
  return { anim: +m[1], xa: +m[2], npc: +m[3], use: +m[4] };
})();
eq(RADII.anim, 2.2, 'anim radius'); eq(RADII.xa, 2.6, 'xanim radius');
eq(RADII.npc, 2.8, 'npc radius'); eq(RADII.use, 2.4, 'interact radius');

const OLD = (props, p) => {
  const D = (o) => dist(o.userData, o, p);
  let best = null, bd = RADII.anim;
  for (const o of props) {
    if (!o || (o.userData.animTrigger || (o.userData.animMode === 'trigger' ? 'interact' : 'auto')) !== 'interact'
      || !(o.userData.animActions && o.userData.animActions.length)) continue;
    const d = D(o); if (d < bd) { bd = d; best = o; }
  }
  if (best) return { type: 'anim', obj: best };
  best = null; bd = RADII.xa;
  for (const o of props) {
    const a = o && o.userData && o.userData.xa; if (!a || !a.on || a.trig !== 'interact') continue;
    if (a.mode === 'once' && a.dest) continue;
    const d = D(o); if (d < bd) { bd = d; best = o; }
  }
  if (best) return { type: 'xanim', obj: best };
  best = null; bd = RADII.npc;
  for (const o of props) {
    const dl = o && o.userData && o.userData.dialogue; if (!dl || !dl.length) continue;
    const d = D(o); if (d < bd) { bd = d; best = o; }
  }
  if (best) return { type: 'npc', obj: best };
  best = null; bd = RADII.use;
  for (const o of props) {
    if (!o || !o.userData || !o.userData.interact) continue;
    const d = D(o); if (d < bd) { bd = d; best = o; }
  }
  if (best) return { type: 'use', obj: best };
  return null;
};

// the shipped walk, sliced out and driven with a stub world
const BLOCK = (() => {
  const a = src.indexOf('  let _bAnim=null, _dAnim=');
  const b = src.indexOf("  if(!nearTarget){   // build 616:", a);
  assert(a > 0 && b > a, 'found the one-walk block between its own anchors');
  return src.slice(a, b);
})();
const NEW = (props, p, opts = {}) => new Function('PROPS', 'P', 'OPTS', `
  const player = { pos: { x: P[0], y: P[1], z: P[2] } };
  const propModels = PROPS;
  const turretModels = OPTS.turrets || [];
  const _gridCars = OPTS.gridCars || [];
  const _remoteDrivenNids = OPTS.driven || {};
  const drivingCar = !!OPTS.drivingCar, mountedTurret = !!OPTS.mountedTurret;
  const THREE = { Box3: function(){ this.min={x:0,y:0,z:0}; this.max={x:0,y:0,z:0};
    this.setFromObject = function(o){ const b=o.userData.vbox; this.min=b.min; this.max=b.max; return this; };
    this.isEmpty = function(){ return false; }; } };
  let nearTarget = null;
  ${extractFunction('_interDist', src)}
  ${BLOCK}
  return nearTarget;
`)(props, p, opts);

const mk = (x, z, ud) => ({ position: { x, y: 0, z }, userData: Object.assign({ box: {
  min: { x: x - 0.5, y: 0, z: z - 0.5 }, max: { x: x + 0.5, y: 1, z: z + 0.5 } } }, ud) });

const ANIM = { animTrigger: 'interact', animActions: [{}] };
const XA = { xa: { on: true, trig: 'interact' } };
const NPC = { dialogue: ['hello'] };
const USE = { interact: true };

/* one world per interesting shape, both forms driven against each of them */
const WORLDS = [
  ['empty', []],
  ['one anim in range', [mk(1, 0, ANIM)]],
  ['one anim out of range', [mk(9, 0, ANIM)]],
  ['anim and xanim, xanim closer — anim still wins on PRIORITY', [mk(2, 0, ANIM), mk(0.2, 0, XA)]],
  ['xanim and npc', [mk(1, 0, XA), mk(0.5, 0, NPC)]],
  ['npc and interact', [mk(1, 0, NPC), mk(0.5, 0, USE)]],
  ['interact only', [mk(1, 0, USE)]],
  ['two anims — the closer wins', [mk(2, 0, ANIM), mk(0.5, 0, ANIM)]],
  ['two anims at equal distance — the FIRST wins (strict <)', [mk(1, 0, ANIM), mk(-1, 0, ANIM)]],
  ['a spent Once mechanism does not prompt', [mk(1, 0, { xa: { on: true, trig: 'interact', mode: 'once', dest: 1 } })]],
  ['an auto-anim prop does not prompt', [mk(1, 0, { animTrigger: 'auto', animActions: [{}] })]],
  ['an anim prop with no actions does not prompt', [mk(1, 0, { animTrigger: 'interact', animActions: [] })]],
  ['an empty dialogue does not prompt', [mk(1, 0, { dialogue: [] })]],
  ['null holes in the list', [null, mk(1, 0, USE), null]],
  ['a prop with no box', [{ position: { x: 1, y: 0, z: 0 }, userData: Object.assign({}, USE) }]],
  ['everything at once', [mk(2.1, 0, ANIM), mk(0.1, 0, XA), mk(0.2, 0, NPC), mk(0.3, 0, USE)]],
  ['xanim just inside its wider radius, anim just outside its narrower one',
    [mk(2.4, 0, ANIM), mk(2.4, 0, XA)]],
];

for (const [name, props] of WORLDS) {
  for (const p of [[0, 0, 0], [0, 1, 0], [5, 0, 5]]) {
    const a = OLD(props, p), b = NEW(props, p);
    const at = (r) => r ? r.type + '@' + props.indexOf(r.obj) : 'none';
    eq(at(b), at(a), name + ' at (' + p + '): one walk agrees with five');
  }
}

/* ---- the turret still outranks the vehicle, and driving/mounted still gate ------------------------- */
{
  const car = mk(0.5, 0, { vehicle: { enterDist: 3 } });
  car.userData.vbox = { min: { x: 0, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  const turret = { position: { x: 1, y: 0, z: 0 } };
  eq(NEW([car], [0, 0, 0]).type, 'vehicle', 'a car in reach prompts');
  eq(NEW([car], [0, 0, 0], { turrets: [turret] }).type, 'turret',
    '...but a turret in reach outranks it, exactly as the sequential form did');
  eq(NEW([car], [0, 0, 0], { drivingCar: true }), null, 'already driving: no car prompt');
  // the turret branch is gated on !mountedTurret, so with one already manned it is skipped and the CAR
  // wins — which is what the pre-1451 sequential form did too. Derived from the branch, not guessed:
  // my first expectation here was null and the engine was right.
  eq(NEW([car], [0, 0, 0], { turrets: [turret], mountedTurret: true }).type, 'vehicle',
    'already on a turret: the turret branch is skipped, so the car in reach prompts instead');
  eq(NEW([car], [30, 0, 0]), null, 'out of enterDist: nothing');
  const owned = mk(0.5, 0, { vehicle: {}, nid: 'n1' });
  owned.userData.vbox = car.userData.vbox;
  eq(NEW([owned], [0, 0, 0], { driven: { n1: 7 } }), null, 'a car someone else is driving does not prompt');
}
{
  // build 893's grid clones are enterable, and they are reached WITHOUT concat now
  const clone = mk(0.5, 0, { vehicle: { enterDist: 3 } });
  clone.userData.vbox = { min: { x: 0, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  eq(NEW([], [0, 0, 0], { gridCars: [clone] }).type, 'vehicle', 'a grid clone still prompts');
  assert(!/propModels\.concat\(/.test(BLOCK),
    '...and it is reached without allocating a concatenated array every frame (build 1168)');
}

/* ---- the walk itself: once, and allocation-free -------------------------------------------------- */
{
  eq((BLOCK.match(/for\(const o of propModels\)/g) || []).length, 0, 'the four sequential prop walks are gone');
  eq((BLOCK.match(/for\(let _i=0/g) || []).length, 1, '...replaced by exactly one indexed pass');
  // an arrow function inside the loop would allocate once per prop per frame — the very cost build 1168
  // removed from this loop's neighbours, and the shape my first draft had
  const body = BLOCK.slice(BLOCK.indexOf('for(let _i=0'));
  assert(!/=>/.test(body.slice(0, body.indexOf('  }\n  /* the SAME priority'))),
    'and the loop body allocates no closure per prop');
  assert(/let d = 0, dOK = false;/.test(BLOCK), 'the shared distance is a flag, not a closure');
  eq((BLOCK.match(/_interDist\(o, ud/g) || []).length, 4,
    'all four categories share the one distance, computed at most once per prop');
}
{
  // the priority order is stated once, after the walk, in the order the five walks ran
  const tail = BLOCK.slice(BLOCK.indexOf('the SAME priority order'));
  const order = ['anim', 'xanim', 'npc', 'use', 'turret', 'vehicle'];
  let at = -1;
  for (const t of order) {
    const i = tail.indexOf("type:'" + t + "'");
    assert(i > at, t + ' is picked after ' + (order[order.indexOf(t) - 1] || 'the walk'));
    at = i;
  }
}

/* ---- and the frame loop still asks for it ----------------------------------------------------------- */
assert(/checkProximity\(\);\s+\/\/ runs in all modes/.test(src), 'still called once per frame');
assert(/function checkProximity\(\)\{\s*\n\s*if\(shopOpen\) return;/.test(src),
  '...and still returns immediately with the shop open');

done('build 1451: checkProximity walks the prop list ONCE instead of five times, with the footprint ' +
     'distance computed at most once per prop, no per-frame concat and no per-prop closure — and the ' +
     'answer is proven identical to the five-walk form across 17 worlds x 3 player positions');
