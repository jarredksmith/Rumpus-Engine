// build 1427: an explosive's FUSE survives a save.
//
// Build 629 moved the Fuse out of On-fire and into the Explosive block — its own entry says so: "the Fuse
// lives with Explosive now (NOT gated behind On-fire)" — and every runtime reader agrees, all three asking
// `explosive && fireFuse > 0` with no mention of `onFire`.
//
// The SERIALIZER was never moved with it. `ffuse` was written inside `if(onFire)` and read inside
// `if(p.fire)`. So a creator who ticks Explosive and sets a Fuse — the authoring the editor lays out for
// them — saves a barrel that detonates INSTANTLY instead of catching light and giving them time to run.
// Build 629's headline feature, lost on the way to disk, since build 629.
//
// Found by `tools/probe/physics-booth-level.mjs`: the physics booth authored, saved, reloaded, then played.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the round trip, executed
// propEntry has a long dependency list and applyPropDynState a shorter one, so the SERIALIZER half is
// executed as a SLICE of the real function — from the on-fire line through the end of the explosive block
// — bounded by named anchors, both asserted. A character or line budget goes stale the moment a comment
// lands inside (builds 1149, 1341, 1426); this cannot.
const _pe = extractFunction('propEntry');
// Three single statements, each taken by its OWN anchor to end-of-line and each asserted. A contiguous
// slice from the first to the last crosses a block boundary and does not brace-balance — which is how the
// first draft of this rig failed. A character or line budget would be worse still (builds 1149, 1341, 1426).
const _stmt = (needle) => {
  const i = _pe.indexOf(needle);
  assert(i > 0, 'propEntry still contains: ' + needle);
  return _pe.slice(i, _pe.indexOf('\n', i));
};
const _WRITE = [
  _stmt('if(o.userData.onFire){'),
  _stmt('if(o.userData.fireFuse!=null'),
  _stmt('if(o.userData.explosive){'),
].join('\n');

const roundTrip = (ud) => {
  const o = { userData: Object.assign({}, ud) };
  const e = {};
  new Function('o', 'e', 'String', 'Number', _WRITE)(o, e, String, Number);
  const back = { userData: {} };
  new Function('obj', 'p', 'setPropDynamic', 'String', 'Number',
    'const _pntMark=()=>{};\n' + extractFunction('applyPropDynState') + '; applyPropDynState(obj, p);')(
    back, Object.assign({ dyn: ud.phys !== null ? 1 : 0, sht: ud.shootable ? 1 : 0 }, e),
    (b) => { b.userData.phys = {}; }, String, Number);
  return { wire: e, back: back.userData };
};

{ // THE REPORT: Explosive + Fuse, which is exactly what the editor lays out
  const r = roundTrip({ explosive: true, blastRadius: 9, blastDmg: 85, impactVel: 14, fireFuse: 2.5 });
  eq(r.wire.ffuse, 2.5, 'the fuse is WRITTEN without On-fire being ticked');
  eq(r.back.fireFuse, 2.5, '...and read back');
  assert(!r.back.onFire, '...without the prop catching fire on load, which would be a different bug');
  eq(r.back.explosive, true, 'and the rest of the explosive settings come with it');
  eq(r.back.blastRadius, 9); eq(r.back.blastDmg, 85); eq(r.back.impactVel, 14);
}
{ // the ON-FIRE path is unchanged, and a level saved BEFORE this build still loads
  const r = roundTrip({ onFire: true, fireDps: 20, fireFuse: 4 });
  eq(r.wire.fire, 1, 'a burning prop still writes its fire flag');
  eq(r.wire.fdps, 20, '...and its damage rate');
  eq(r.wire.ffuse, 4, '...and its fuse');
  eq(r.back.onFire, true, 'and all three come back');
  eq(r.back.fireDps, 20); eq(r.back.fireFuse, 4);
  // a pre-1427 FILE is `{fire:1, ffuse:N}` — the same shape, so old saves are byte-compatible
  const old = { dyn: 1, fire: 1, fdps: 12, ffuse: 3 };
  const back = { userData: {} };
  new Function('obj', 'p', 'setPropDynamic', 'String', 'Number',
    'const _pntMark=()=>{};\n' + extractFunction('applyPropDynState') + '; applyPropDynState(obj, p);')(
    back, old, (b) => { b.userData.phys = {}; }, String, Number);
  eq(back.userData.fireFuse, 3, 'a level saved BEFORE this build loads its fuse exactly as it always did');
  eq(back.userData.onFire, true, '...and still catches fire');
}
{ // only-when-set, so nothing that never used a fuse grows a key
  const r = roundTrip({ explosive: true });
  assert(!('ffuse' in r.wire), 'an explosive with no fuse writes no key at all');
  const z = roundTrip({ explosive: true, fireFuse: 0 });
  assert(!('ffuse' in z.wire), '...and neither does one with a fuse of 0, which means "instant"');
}
{ // a STATIC shootable barrel is explosive too (build 1390), and its fuse must travel the same way
  const r = roundTrip({ phys: null, shootable: true, explosive: true, fireFuse: 1.5 });
  eq(r.wire.ffuse, 1.5, 'a bolted-down explosive keeps its fuse on the wire');
  eq(r.back.fireFuse, 1.5, '...and off it — the read is in the DAMAGEABLE tier, not the body tier');
}

// ---------------------------------------------------------------- the runtime always agreed
{
  // Three readers, none of which mentions onFire. The file was the only thing that disagreed, which is why
  // this was invisible in play until something was saved and reopened.
  const n = (src.match(/explosive && \(\+o(?:bj)?\.userData\.fireFuse\|\|0\)>0/g) || []).length;
  assert(n >= 3, 'every runtime reader asks explosive && fireFuse > 0 (' + n + ' sites)');
  const dp = extractFunction('damageProp');
  assert(/_brk && obj\.userData\.explosive && \(\+obj\.userData\.fireFuse\|\|0\)>0/.test(dp),
    'including the shot that LIGHTS it, which is build 629’s whole feature');
  assert(!/onFire/.test(dp), '...and it never asks whether the prop was already on fire');
}
{ // and the editor authors it there
  const i = src.indexOf("mkSlider('Fuse'");
  assert(i > 0, 'the Fuse slider exists');
  const before = src.slice(Math.max(0, i - 2600), i);
  assert(/if\(sel\.userData\.explosive\)\{/.test(before),
    'and it is inside the EXPLOSIVE block — which is what the serializer now agrees with');
}

// ---------------------------------------------------------------- the shape of the fix
{
  const pe = extractFunction('propEntry');
  assert(/if\(o\.userData\.fireFuse!=null && \+o\.userData\.fireFuse>0\) e\.ffuse=\+o\.userData\.fireFuse;/.test(pe),
    'the fuse is written on its own terms');
  assert(/if\(o\.userData\.onFire\)\{ e\.fire=1; if\(o\.userData\.fireDps!=null\) e\.fdps=o\.userData\.fireDps; \}/.test(pe),
    '...and the on-fire block no longer owns it');
  const iF = pe.indexOf('e.ffuse'), iE = pe.indexOf('e.exp=1');
  assert(iF > 0 && iE > iF, 'it sits beside the explosive settings it belongs to');
  const ap = extractFunction('applyPropDynState');
  assert(/if\(p\.ffuse!=null\) obj\.userData\.fireFuse=\+p\.ffuse;/.test(ap), 'and is read on its own terms');
  assert(!/if\(p\.fire\)\{[^}]*ffuse/.test(ap), '...outside the p.fire gate that used to hide it');
  const gate = ap.indexOf('if(!p.dyn && !p.sht) return;'), read = ap.indexOf('p.ffuse');
  assert(gate > 0 && read > gate,
    'in the DAMAGEABLE tier (build 1398), because an explosive can be a bolted-down target as well as a body');
}

done('build 1427: a fuse authored under Explosive survives the save, which it had not since build 629');
