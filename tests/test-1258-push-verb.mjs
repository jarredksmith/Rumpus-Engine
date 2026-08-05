import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1258: the graph gets FORCE. It could query the world and command enemies but had no way to
// apply an impulse — so a ball could be teleported to a goal and never kicked toward one. `push`
// shoves tagged dynamic props AWAY from the same place field every other verb uses (no place = up),
// with strength expressed as a VELOCITY CHANGE so a crate and a barrel answer a number the same way.

// Drive the real branch out of _applyWorldAction with stub props and a fake Rapier body.
function rig(opts = {}) {
  const wa = extractFunction('_applyWorldAction');
  const branch = wa.slice(wa.indexOf("if(s.do==='pushprop'){"), wa.indexOf("if(s.do==='spawnprop'){"));
  const props = (opts.props || []).map(p => ({
    position: { x: p.x, y: p.y || 0, z: p.z },
    userData: {
      tag: p.tag, _shattered: !!p.shattered, mass: p.mass == null ? 1 : p.mass,
      phys: p.static ? null : { body: {
        impulses: [], woke: 0,
        mass: () => (p.mass == null ? 1 : p.mass),
        wakeUp(){ this.woke++; },
        applyImpulse(v){ this.impulses.push(v); },
      } },
    },
  }));
  const fn = new Function('propModels', '_lgPlaceAt', '_lgNum', 'Math',
    `return function(s){ ${branch} };`)(props, () => opts.at || null,
      (v) => (v === '' || v == null ? 0 : (isNaN(parseFloat(v)) ? 0 : parseFloat(v))),
      Object.assign(Object.create(Math), { random: () => opts.rand == null ? 0 : opts.rand }));
  return { fn, props, body: (i) => props[i].userData.phys && props[i].userData.phys.body };
}
const at = (x, z) => ({ x, y: 0, z });

{ // away from a place: direction is horizontal, normalised, with the upward kick riding along
  const r = rig({ props: [{ tag: 'ball', x: 3, z: 0 }], at: at(0, 0) });
  r.fn({ do: 'pushprop', target: 'ball', at: 'me', amt: '10' });
  const imp = r.body(0).impulses[0];
  assert(imp, 'the prop was pushed');
  near(imp.x, 10, 1e-9, 'straight along +X, at full strength (the direction is normalised, not scaled by distance)');
  near(imp.z, 0, 1e-9);
  near(imp.y, 4, 1e-9, 'and an upward component of 0.4x so it tumbles instead of sliding');
  eq(r.body(0).woke, 1, 'the body is woken first — a settled body ignores an impulse');
}
{ // distance must not change the shove: 3m and 300m away get the same push
  const near1 = rig({ props: [{ tag: 't', x: 3, z: 0 }], at: at(0, 0) });
  const far = rig({ props: [{ tag: 't', x: 300, z: 0 }], at: at(0, 0) });
  near1.fn({ do: 'pushprop', target: 't', at: 'me', amt: '10' });
  far.fn({ do: 'pushprop', target: 't', at: 'me', amt: '10' });
  near(near1.body(0).impulses[0].x, far.body(0).impulses[0].x, 1e-9, 'the same strength at any distance');
}
{ // no place = straight up (the launcher default)
  const r = rig({ props: [{ tag: 'b', x: 5, z: 5 }], at: null });
  r.fn({ do: 'pushprop', target: 'b', at: '', amt: '10' });
  const imp = r.body(0).impulses[0];
  near(imp.x, 0, 1e-9); near(imp.z, 0, 1e-9, 'no horizontal component with no origin');
  near(imp.y, 4, 1e-9, 'only the lift');
}
{ // dead centre on the origin: any direction beats a NaN
  const r = rig({ props: [{ tag: 'b', x: 0, z: 0 }], at: at(0, 0), rand: 0 });
  r.fn({ do: 'pushprop', target: 'b', at: 'me', amt: '10' });
  const imp = r.body(0).impulses[0];
  assert(isFinite(imp.x) && isFinite(imp.z), 'a prop sitting exactly on the origin still gets a finite push');
  near(Math.hypot(imp.x, imp.z), 10, 1e-6, '...at full strength, in a random direction');
}
{ // strength is a VELOCITY change: mass scales the impulse so a number means one thing
  const light = rig({ props: [{ tag: 't', x: 1, z: 0, mass: 1 }], at: at(0, 0) });
  const heavy = rig({ props: [{ tag: 't', x: 1, z: 0, mass: 8 }], at: at(0, 0) });
  light.fn({ do: 'pushprop', target: 't', at: 'me', amt: '10' });
  heavy.fn({ do: 'pushprop', target: 't', at: 'me', amt: '10' });
  eq(heavy.body(0).impulses[0].x / light.body(0).impulses[0].x, 8,
    'the impulse scales with mass — so both props change velocity by the same amount (authorable, not a weight-slider guessing game)');
}
{ // selection + guards
  const r = rig({ props: [
    { tag: 'ball', x: 1, z: 0 }, { tag: 'other', x: 1, z: 0 },
    { tag: 'ball', x: 2, z: 0, shattered: true }, { tag: 'ball', x: 3, z: 0, static: true },
    { tag: 'ball', x: 4, z: 0 },
  ], at: at(0, 0) });
  r.fn({ do: 'pushprop', target: 'ball', at: 'me', amt: '5' });
  eq(r.body(0).impulses.length, 1, 'a tagged dynamic prop is pushed');
  eq(r.body(1).impulses.length, 0, 'a differently-tagged prop is not');
  eq(r.body(2).impulses.length, 0, 'a shattered prop is not');
  eq(r.props[3].userData.phys, null, 'a static prop has no body to push (skipped without throwing)');
  eq(r.body(4).impulses.length, 1, 'every matching prop is pushed, not just the first');
}
{ // amount: default, clamp, and zero
  const d = rig({ props: [{ tag: 't', x: 1, z: 0 }], at: at(0, 0) });
  d.fn({ do: 'pushprop', target: 't', at: 'me', amt: '' });
  near(d.body(0).impulses[0].x, 20, 1e-9, 'a blank amount uses the documented default of 20');
  const hi = rig({ props: [{ tag: 't', x: 1, z: 0 }], at: at(0, 0) });
  hi.fn({ do: 'pushprop', target: 't', at: 'me', amt: '9999' });
  near(hi.body(0).impulses[0].x, 100, 1e-9, 'a hostile amount is clamped');
  const z = rig({ props: [{ tag: 't', x: 1, z: 0 }], at: at(0, 0) });
  z.fn({ do: 'pushprop', target: 't', at: 'me', amt: '0' });
  eq(z.body(0).impulses.length, 0, 'strength 0 does nothing at all');
  const noTag = rig({ props: [{ tag: 't', x: 1, z: 0 }], at: at(0, 0) });
  noTag.fn({ do: 'pushprop', target: '  ', at: 'me', amt: '10' });
  eq(noTag.body(0).impulses.length, 0, 'a blank tag pushes nothing (never everything)');
}

// --- wiring pins ------------------------------------------------------------------------------------
assert(/\['pushprop','Push props'\]/.test(src), 'the verb is offered in the Do-action dropdown');
assert(/'moveprop','delprop','resetprop','pushprop'\]\]/.test(src), 'the tag field appears for it');
assert(/'moveprop','spawnprop','pushprop'/.test(src), 'so does the place field (the origin it pushes away from)');
assert(/ifv:\['verb',\['damage','heal','pushprop'\]\]/.test(src), 'and the amount field (shared with damage/heal)');
assert(/'moveprop','delprop','pushprop','resetprop'\]\);/.test(src), 'a missing tag is reported like every other tag verb (_LG_TAG_VERBS)');
{
  const wa = extractFunction('_applyWorldAction');
  const branch = wa.slice(wa.indexOf("if(s.do==='pushprop'){"), wa.indexOf("if(s.do==='spawnprop'){"));
  assert(!/_wactSend/.test(branch),
    'NO network message: the host applies the impulse and the dynamic-prop snapshot already carries the motion — unlike the STATE verbs, which need _wactSend because show/hide/move are not physics');
  assert(/body\.wakeUp && body\.wakeUp\(\)/.test(branch), 'and the body is woken, or a settled prop swallows the shove');
}

done('build 1258: the push verb — direction, distance-independence, the up kick, the NaN guard, mass-as-velocity, tag/shattered/static selection, defaults and clamps all executed; no new net message by design');
