// build 1398 — REPORTED FROM PLAY: "marking a prop as a target that is breakable doesn't save with the
// level. When I re-open or refresh, I can't break the prop and have to go back and tick the box again."
//
// The flag SAVED correctly. It was never READ BACK. `applyPropDynState` opened with
//
//     if(!p || !p.dyn) return;
//
// and build 1390 put the static-target restore INSIDE it — below a gate a static target can never pass,
// because a static target has `sht:1` and no `dyn`. So `propEntry` wrote `sht`, `hp` and `bst`, the file
// carried them, and the loader returned at its first line.
//
// THE WRITE SIDE WAS ALREADY SPLIT AND THE READ SIDE NEVER WAS. `propEntry` has three tiers — `par` at the
// top level, a `phys` block for the BODY, and a `phys || shootable` block for being DAMAGEABLE. This had one
// gate covering all three.
//
// And build 1390's own test asserted BOTH ENDS of that wire as source text — `e.sht=1` in the serializer and
// `p.sht` in the applier — and passed, while nothing in between worked. That is build 1277's defect, in the
// test I wrote to prevent it. So this file round-trips through the REAL serializeLevel/restoreLevel.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------- the three tiers, executed ----
// Driven with the real function body, so the gate is tested rather than described.
{
  const fn = extractFunction('applyPropDynState');
  const run = (p) => {
    const ud = {};
    const obj = { userData: ud, position: { x:0, y:0, z:0 } };
    const called = [];
    new Function('obj', 'p', 'setPropDynamic', '_pntMark', 'DEBRIS_SIZE_FRAC',
      fn + '\napplyPropDynState(obj, p);')
      (obj, p, () => { called.push('dyn'); ud.phys = {}; }, () => called.push('pnt'), 0.5);
    return { ud, called };
  };

  { // THE REPORT: a static target, exactly as the editor writes it
    const r = run({ sht: 1, hp: 40, bst: 'puff' });
    eq(r.ud.shootable, true, 'a static target gets its flag back — the whole bug');
    eq(r.ud.maxHp, 40, '...and its health');
    eq(r.ud.hp, 40);
    eq(r.ud.breakStyle, 'puff', '...and its break style');
    eq(r.ud.breakable, true, '...and is breakable');
    eq(r.called.indexOf('dyn'), -1, 'without being turned into a physics body, which is the point of it');
  }
  { // the control: a dynamic prop is unchanged in every field
    const r = run({ dyn: true, mass: 7, ng: 1, glbl: 'Lift', grng: 3, fire: 1, fdps: 9, hp: 55, bst: 'puff' });
    assert(r.called.includes('dyn'), 'a dynamic prop still becomes one');
    eq(r.ud.mass, 7, '...with its mass'); eq(r.ud.noGrab, true, '...its grab flags');
    eq(r.ud.grabLabel, 'Lift'); eq(r.ud.grabRange, 3);
    eq(r.ud.onFire, true, '...its fire'); eq(r.ud.fireDps, 9);
    eq(r.ud.maxHp, 55, '...and its damage state, exactly as before this build');
  }
  { // AND A SECOND LIVE BUG NOBODY REPORTED: `p.par` is read here and nowhere else
    const r = run({ par: '770001' });
    eq(r.ud.parNid, '770001',
      'a STATIC prop restores its parent. Build 1309 deliberately put `e.par` at the TOP LEVEL of the ' +
      'serializer because "a static crate on a lift is the commonest case of all" — and its only reader ' +
      'sat behind the dynamic gate the whole time, so that case has never worked');
    assert(r.called.includes('pnt'), '...and marks the resolver, since props load async');
  }
  { // an ordinary static prop must gain NOTHING — this must not make every wall in every level breakable
    const r = run({});
    eq(r.ud.shootable, undefined, 'a plain prop is not shootable');
    eq(r.ud.breakable, undefined, '...nor breakable — build 1390 measured that `breakable:true` alone on a ' +
      'static prop still refuses damage, but writing it on every prop in every level is noise at best');
    eq(r.ud.maxHp, undefined, '...and carries no health');
    eq(r.called.length, 0, '...and nothing was called for it at all');
  }
  { // the body-only fields stay body-only: a static target must not silently gain mass or grabbing
    const r = run({ sht: 1, mass: 9, ng: 1, fire: 1 });
    eq(r.ud.mass, undefined, 'mass is about having a BODY');
    eq(r.ud.noGrab, undefined, '...so is grabbing');
    eq(r.ud.onFire, undefined, '...and so is burning');
    eq(r.ud.shootable, true, 'while the damage state still applies');
  }
  { // brk:false is honoured for a target too
    const r = run({ sht: 1, brk: false });
    eq(r.ud.breakable, false, 'an explicit breakable:false still refuses everything — the creator saying no');
    eq(r.ud.maxHp, undefined, '...and no health is written under it');
  }
  { // the impact sounds (1305/1314) reach a target, which they never did either
    const r = run({ sht: 1, hsn: 'https://x/clang.mp3', bsn: 'https://x/smash.mp3' });
    eq(r.ud.hitSnd, 'https://x/clang.mp3', 'a target\'s own impact sound restores...');
    eq(r.ud.breakSnd, 'https://x/smash.mp3', '...and its break sound');
  }
  eq(run(null).called.length, 0, 'a null entry is a clean no-op');
}

// ------------------------------------------------- the loader MIRRORS the serializer ----
// The defect was an asymmetry, so the guard is the symmetry.
{
  const ap = extractFunction('applyPropDynState');
  const pe = extractFunction('propEntry');
  assert(/if\(p\.par\)/.test(ap) && ap.indexOf('if(p.par)') < ap.indexOf('if(p.dyn){'),
    'tier 1 (par) is read before the body gate, matching propEntry writing it at the top level');
  assert(/if\(o\.userData\.parNid\) e\.par/.test(pe) && pe.indexOf('e.par') < pe.indexOf('if(o.userData.phys){'),
    '...which is where the serializer writes it');
  assert(/if\(!p\.dyn && !p\.sht\) return;/.test(ap),
    'tier 3 is gated on dyn OR shootable...');
  assert(/if\(o\.userData\.phys \|\| o\.userData\.shootable\)\{/.test(pe),
    '...which is exactly the condition the serializer writes it under');
  assert(!/if\(!p \|\| !p\.dyn\) return;/.test(ap), 'and the single gate that swallowed all three is gone');

  // every field the damage tier writes must be readable for a target, not just a body
  for (const f of ['p.sht', 'p.hsn', 'p.bsn', 'p.brk', 'p.hp', 'p.bst', 'p.fc', 'p.exp'])
    assert(ap.indexOf(f) > ap.indexOf('if(!p.dyn && !p.sht) return;') || f === 'p.sht',
      f + ' is inside the damage tier');
}

// Probed live (tools/probe/target-roundtrip.mjs) through the REAL serializeLevel -> restoreLevel, then by
// SHOOTING the prop that came back — because "the flag is in the file" and "the target is breakable after a
// reload" turned out to be different facts, and build 1390's probe only ever checked the first:
//
//   written           { sht:1, hp:40, bst:'puff', hsn:set }          (the serializer was always right)
//   after restore     shootable true, breakable true, maxHp 40, hp 40, breakStyle puff, hitSnd restored,
//                     and IN damageableProps()
//   shoot it          40 -> 25 -> 10 -> shattered                    <- the report's own test
//   carried prop      parNid '770001' restored                       <- build 1309's unreported half
//   dynamic control   dyn/mass 7/noGrab/maxHp 55/puff/onFire/fireDps 9 — every field as before
//   plain static prop breakable undefined, maxHp undefined, NOT damageable
//
// One instrument fault: the probe first wrote `nid = nid || 770001` and the props already had one, so the
// assignment was a no-op and every search reported PROP MISSING — which reads exactly like the restore
// dropping the prop rather than like a probe that looked for the wrong id.
done('build 1398: a target that saves, and a static prop that can ride a lift');
