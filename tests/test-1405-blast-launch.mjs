// build 1405 — an explosion launches what it damages.
//
// Found by sweeping the PHYSICS booth (tools/probe/physics-booth.mjs), the third of the three the gauntlet
// is scoped around and the only one with no end-to-end coverage. Thirteen of fourteen things worked. The
// fourteenth: `explodeAt`'s dynamic-prop loop called `damageProp` and NOTHING else, so an explosion beside a
// stack of crates knocked their health down and left every one of them standing exactly where it was —
// while the ENEMY loop three lines above it has thrown actors since build 636.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------- no second impulse writer ----
// `pushDynamic` is what a SHOT uses and build 1258's push verb is the other one. They have deliberately
// DIFFERENT semantics, and picking the right one is the whole design decision here.
{
  eq((src.match(/function pushDynamic\(/g) || []).length, 1, 'the shot impulse is written once...');
  eq((src.match(/body\.applyImpulse\(\{ x:dx\*amt\*m/g) || []).length, 1,
    '...and build 1258\'s push verb, which multiplies by MASS so an authored "20" moves a crate and a ' +
    'barrel the same amount, is untouched');
  const shove = extractFunction('_blastShoveProp');
  assert(/pushDynamic\(o, _blastDir,/.test(shove),
    'a blast routes through the SHOT\'s function, not the verb\'s: a blast is a physical event rather than ' +
    'an authored amount, so a heavy crate should take it better — which the verb\'s mass multiply would undo');
  assert(!/applyImpulse/.test(shove), '...and adds no third impulse writer of its own');
}

// ------------------------------------------------------- the shove, executed ----
{
  const calls = [];
  const run = new Function('THREE', 'worldCfg', 'pushDynamic', 'calls',
    extractFunction('_blastShoveProp').replace('const _blastDir', 'var _blastDir') + '\n' +
    'var _blastDir = new THREE.Vector3();\nreturn _blastShoveProp;');
  const V3 = function (x, y, z) { this.set(x || 0, y || 0, z || 0); };
  V3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
  V3.prototype.lengthSq = function () { return this.x * this.x + this.y * this.y + this.z * this.z; };
  V3.prototype.normalize = function () {
    const l = Math.sqrt(this.lengthSq()) || 1; this.x /= l; this.y /= l; this.z /= l; return this;
  };
  const shove = run({ Vector3: V3 }, { launchPower: 1 },
    (o, dir, s) => calls.push({ dir: { x: +dir.x.toFixed(4), y: +dir.y.toFixed(4), z: +dir.z.toFixed(4) }, s: +s.toFixed(3) }),
    calls);

  const prop = (x, y, z) => ({ position: { x, y, z } });
  const at = (x, y, z) => ({ x, y, z });

  calls.length = 0;
  shove(prop(5, 0, 0), at(0, 0, 0), 7, 1);
  eq(calls.length, 1, 'a prop inside the blast is shoved');
  eq(calls[0].dir.x, 1, '...directly away from the centre');
  eq(calls[0].dir.y, 0); eq(calls[0].dir.z, 0);
  near(calls[0].s, 8 + 7 * 1.2, 1e-6,
    'at full falloff the strength is the actor launch\'s own (8 + R*1.2), so the ONE launchPower slider a ' +
    'creator already tunes for enemies moves both');

  calls.length = 0;
  shove(prop(5, 0, 0), at(0, 0, 0), 7, 0.25);
  near(calls[0].s, (8 + 7 * 1.2) * 0.25, 1e-6, 'and it scales with the falloff');

  // THE VERTICAL TERM IS GEOMETRIC — this is what makes a charge under a crate lift it
  calls.length = 0;
  shove(prop(0, 3, 0), at(0, 0, 0), 6, 1);
  eq(calls[0].dir.y, 1, 'a blast BELOW a prop throws it straight up');
  calls.length = 0;
  shove(prop(0, -3, 0), at(0, 0, 0), 6, 1);
  eq(calls[0].dir.y, -1, '...and one above slams it down, rather than a constant that can only ever lift');
  calls.length = 0;
  shove(prop(3, 3, 0), at(0, 0, 0), 6, 1);
  near(calls[0].dir.x, Math.SQRT1_2, 1e-3, 'a diagonal is normalised...');
  near(calls[0].dir.y, Math.SQRT1_2, 1e-3, '...so the strength means the same thing in every direction');

  // launchPower rides along
  {
    const c2 = [];
    const s2 = run({ Vector3: V3 }, { launchPower: 2 }, (o, d, s) => c2.push(+s.toFixed(3)), c2);
    s2(prop(5, 0, 0), at(0, 0, 0), 7, 1);
    near(c2[0], (8 + 7 * 1.2) * 2, 1e-6, 'the level\'s launchPower scales it, exactly as it scales an actor');
  }

  // dead centre cannot produce a NaN direction
  calls.length = 0;
  shove(prop(0, 0, 0), at(0, 0, 0), 6, 1);
  eq(calls.length, 0, 'a prop exactly at the centre is skipped rather than normalised to NaN');
}

// ------------------------------------------------------- the loop's decision, executed ----
{
  const loop = (() => {
    const fn = (extractFunction('explodeAt') + extractFunction('_blastProps'));
    const i = fn.indexOf('for(const o of dynamicProps.slice()){');
    return fn.slice(i, fn.indexOf('\n  }', i) + 4);
  })();
  assert(/_blastShoveProp/.test(loop), 'the loop is the one that shoves');

  const run = (props, opts) => {
    const damaged = [], shoved = [];
    new Function('dynamicProps', 'pos', 'R', 'dmg', 'byId', 'damageProp', '_blastShoveProp',
      loop)(props, { x: 0, y: 0, z: 0 }, 10, 100, null,
      (o, d) => { damaged.push({ tag: o.userData.tag, d: +d.toFixed(1) }); return !!(opts && opts.breaks); },
      (o) => shoved.push(o.userData.tag));
    return { damaged: damaged.map(x => x.tag), amounts: damaged, shoved };
  };
  /* the loop asks the PROP for the distance (o.position.distanceTo(pos)), which is three's own method — the
     first draft put distanceTo on the blast point instead and threw. */
  const P = (tag, x, ud) => ({
    position: { x, y: 0, z: 0, distanceTo: (p) => Math.hypot(x - p.x, 0 - p.y, 0 - p.z) },
    userData: Object.assign({ tag, phys: {} }, ud) });

  {
    const r = run([P('near', 2), P('far', 5), P('outside', 40)]);
    eq(r.damaged.join(), 'near,far', 'everything inside the radius is damaged');
    eq(r.shoved.join(), 'near,far', '...and everything inside it is thrown');
    eq(r.amounts[0].d, 80, 'with the same falloff the damage always had');
    eq(r.amounts[1].d, 50);
  }
  {
    // a prop the blast DESTROYS is not shoved: its body is gone and its debris is its own system, and this
    // is the order every other damage site here uses — `if(!damageProp(...)) pushDynamic(...)`
    const r = run([P('doomed', 2)], { breaks: true });
    eq(r.damaged.join(), 'doomed', 'a prop that shatters still takes the damage...');
    eq(r.shoved.length, 0, '...and is not shoved afterwards');
  }
  {
    // `breakable:false` means "cannot be damaged", not "is not made of matter" — and build 1421 narrowed
    // it once more, to "cannot be DESTROYED". So the loop no longer routes around damageProp at all: the
    // blast REGISTERS on an unbreakable prop (its flash, its hit sound and its `damaged` signal) and
    // damageProp itself is the single place that refuses to break it. THIS build's subject — that an
    // unbreakable prop still goes flying — is unchanged and asserted below.
    const r = run([P('bunker', 2, { breakable: false }), P('crate', 3)]);
    eq(r.damaged.join(), 'bunker,crate', 'the blast reaches an unbreakable prop (build 1421)...');
    eq(r.shoved.join(), 'bunker,crate', '...and it STILL goes flying, which the pre-1405 loop skipped entirely');
  }
  {
    const r = run([P('gone', 2, { _shattered: true }), P('static', 3, { phys: null })]);
    eq(r.damaged.length, 0, 'already-shattered and static props are skipped...');
    eq(r.shoved.length, 0, '...by both halves');
  }
  {
    const r = run([P('centre', 0)]);
    eq(r.damaged.length + r.shoved.length, 0,
      'and a prop exactly at the blast point is skipped at the loop\'s own d>0.01 gate, as it always was');
  }
}

// Measured live (tools/probe/physics-booth.mjs at build 1405, and A/B'd against the pre-1405 loop pasted
// back into the same tree so the difference is attributable to this change and nothing else):
//
//   BEFORE   the crate takes 32 damage and moves 0.00 m
//   AFTER    2.68 m, hp 1000 -> 969
//   mass     a 25x heavier crate 4 m away moves 0.00 and takes 15 damage — the shot's raw-impulse
//            semantics doing exactly what they should, and the reason a blast does NOT use the push verb
//   unbreakable   moved 0.92 m with its health untouched
//
// The booth reads 14/14. Four of its own checks were instrument faults first, and every one read as a
// broken feature: the booth was built at 700 to be "far from the stock level" and fell out of the world,
// because the ground plane stops at +-ARENA; a box primitive is BASE-at-origin, so a crate resting ON the
// ground is y = 0 and the assertion `y > 0` called a correct landing a failure; the trigger field is `ptag`
// and a plain `tag` sanitizes to blank, which silently means ANY prop; and the goal check asserted an
// outcome without reporting whether the ball had actually LEFT the zone, which reads identically to the
// edge not re-arming.
done('build 1405: an explosion launches what it damages — and what it cannot damage');
