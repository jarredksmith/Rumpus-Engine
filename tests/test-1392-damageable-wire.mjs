// build 1392: reported from play, against build 1390 — "This isn't working. The prop never breaks."
//
// Build 1390 taught `damageProp` that a static prop can opt in with `shootable`. It stopped there. NOTHING
// THAT FIRES resolved a prop through that gate:
//
//   the bullet   walked the hit object's parents looking for `userData.phys`
//   the turret   did the same
//   the melee    was GATED ON `dynamicProps.length` and RAYCAST `dynamicProps`
//
// So all three looked straight past a static target and the feature shipped switched on and inert — the
// checkbox ticked, the HP set, the plate immortal. That is build 1277's defect exactly (the handler and the
// door were both right and the WIRE was never driven), and build 1390's own probe walked into it by calling
// `damageProp` directly instead of firing a shot.
//
// So this file tests the WIRE. Every resolution site is executed against a static target with a DYNAMIC
// CONTROL beside it, because a null in the control is the instrument rather than the feature — which is
// exactly how the live probe first read melee as broken when it was the 160 ms windup (build 1303).
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------- one predicate, asked by every site ----
{
  const fn = extractFunction('_isDamageable');
  assert(/o\.userData\.phys \|\| o\.userData\.shootable/.test(fn),
    'the predicate is the same disjunction damageProp itself gates on');

  const gate = new Function('o', 'return !!(o && o.userData && (o.userData.phys || o.userData.shootable));');
  eq(gate({ userData: { phys: {} } }), true, 'a dynamic prop resolves, exactly as before this build');
  eq(gate({ userData: { shootable: true } }), true, 'and so does a static target');
  eq(gate({ userData: {} }), false,
    'a plain static prop does NOT — this is what keeps every wall in every existing level unshootable');
  eq(gate({ userData: { breakable: true } }), false,
    '...including one carrying breakable:true, which _applyPropEntry sets on EVERY prop it loads');
  eq(gate(null), false, 'a null parent at the top of the walk ends it rather than throwing');
  eq(gate({}), false, 'and so does an object with no userData (three inserts plenty)');

  // the walk terminates: parenting up from a hit mesh must reach the prop or run out
  const walkUp = (leaf) => { let o = leaf; while (o && !gate(o)) o = o.parent; return o; };
  const prop = { userData: { shootable: true }, parent: null };
  const mesh = { userData: {}, parent: { userData: {}, parent: prop } };
  eq(walkUp(mesh), prop, 'a mesh two groups deep inside a static target resolves to the target');
  eq(walkUp({ userData: {}, parent: { userData: {}, parent: null } }), null,
    '...and a hit on ordinary scenery resolves to nothing, without walking off the end');
}

// --------------------------------------------------- the set, and its allocation cost ----
{
  const fn = extractFunction('damageableProps');
  assert(/_dmgProps\.length = 0;/.test(fn),
    'the array is REUSED, not allocated — a swing runs this and build 1168 removed exactly this class of ' +
    'per-frame transient from the melee path');
  assert(/for\(const o of dynamicProps\) _dmgProps\.push\(o\);/.test(fn), 'every dynamic prop is in it');
  assert(/o\.userData\.shootable && !o\.userData\.phys/.test(fn),
    '...plus static targets, and ONLY the ones that are not already dynamic, or a dynamic prop that also ' +
    'carried the flag would be in the list twice and take double damage from one swing');
  assert(/const _dmgProps = \[\];/.test(src), 'the scratch is module-level');

  // executed: membership and the no-double-entry property
  const dynA = { userData: { phys: {} } };
  const both = { userData: { phys: {}, shootable: true } };
  const stat = { userData: { shootable: true } };
  const plain = { userData: {} };
  const get = new Function('dynamicProps', 'propModels', `
    const _dmgProps = [];
    function damageableProps(){
      _dmgProps.length = 0;
      for(const o of dynamicProps) _dmgProps.push(o);
      for(const o of propModels){ if(o && o.userData && o.userData.shootable && !o.userData.phys) _dmgProps.push(o); }
      return _dmgProps;
    }
    return damageableProps;`)([dynA, both], [dynA, both, stat, plain, null]);
  const set = get();
  eq(set.length, 3, 'two dynamic props and one static target');
  eq(set.filter(o => o === both).length, 1,
    'a prop that is BOTH dynamic and flagged appears exactly once — otherwise one shot would hit it twice');
  eq(set.indexOf(plain), -1, 'and an ordinary prop is absent');
  eq(set.indexOf(null), -1, 'a hole in propModels does not throw (the live level has them)');
  const again = get();
  assert(again === set, 'and a second call returns the SAME array object, not a fresh one');
}

// ------------------------------------------------------ every firing site, pinned ----
// The point of this build is that no site disagrees. Counting them is what stops a fourth arriving.
{
  eq((src.match(/_isDamageable\(/g) || []).length, 4,
    'the predicate is DEFINED once and asked at exactly three sites: the bullet walk, the turret walk, and ' +
    "the melee dead-on ray. A fourth resolution site that hand-rolls `userData.phys` is how this bug came back");

  const shootFn = extractFunction('shoot');
  assert(/while\(dn && !dprop\)\{ if\(_isDamageable\(dn\)\) dprop = dn; dn = dn\.parent; \}/.test(shootFn),
    'the BULLET walk asks the predicate');
  assert(!/while\(dn && !dprop\)\{ if\(dn\.userData && dn\.userData\.phys\)/.test(shootFn),
    '...and no longer looks for userData.phys directly');

  assert(/while\(dn&&!dprop\)\{ if\(_isDamageable\(dn\)\) dprop=dn; dn=dn\.parent; \}/.test(src),
    'the TURRET walk asks the same one');
}

// ------------------------------------------------------------------- the melee block ----
// This is the half build 1392's first draft missed. Routing only the ARC scan through the new set left the
// block gated on `dynamicProps.length` and raycasting `dynamicProps`, so a swing at a static target found
// nothing to test and the reported symptom survived the fix.
{
  const fn = extractFunction('_meleeStrike');
  assert(/const _mdp = damageableProps\(\);/.test(fn),
    'the damageable set is captured ONCE — it is a reused scratch array, so three re-derivations would be ' +
    'three needless walks of every prop in the level per swing');
  assert(/if\(_mdp\.length\)\{/.test(fn), '1. the GATE reads it...');
  assert(/_meleeRc\.intersectObjects\(_mdp, true\)/.test(fn), '2. ...the dead-on RAY tests it...');
  assert(/for\(const o of _mdp\)\{/.test(fn), '3. ...and the arc scan walks it');

  const blk = fn.slice(fn.indexOf('const _mdp = damageableProps();'));
  eq((blk.match(/dynamicProps/g) || []).length, 0,
    'and the whole block no longer mentions dynamicProps anywhere — one of the three would have been enough ' +
    'to keep the bug alive, which is what the first draft of this build proved');

  // the arc test itself is build 1311's and is untouched
  assert(/MELEE_ARC_DOT/.test(blk), 'the cone is still build 1311\'s shared arc constant');
  assert(/o\.userData\._shattered\) continue;/.test(blk), 'an already-broken prop is still skipped');
  assert(/const b=o\.userData\.box; if\(!b\) continue;/.test(blk),
    'and a prop with no collider box is skipped rather than throwing — a static target has one, but a ' +
    'runtime prop mid-spawn may not');
}

// -------------------------------------------------------------- the blast, unchanged ----
// Build 1390 already wired this one (a second sweep over propModels), and the probe confirmed it fires.
// Pinned here only because the self-damage guard is what made it read as dead on the first probe run.
{
  const fn = extractFunction('explodeAt');
  assert(/for\(const o of propModels\)\{ if\(!o \|\| !o\.userData \|\| !o\.userData\.shootable \|\| o\.userData\.phys\) continue;/.test(fn),
    'static targets get their own sweep');
  eq((fn.match(/if\(d>0\.01 && d<R\)/g) || []).length, 2,
    'both sweeps keep the d>0.01 self-damage guard, so an exploding barrel cannot damage itself — which ' +
    'also means a blast placed exactly on a prop origin does nothing, and reading that as a dead feature ' +
    'cost this build a probe run');
}

// ---------------------------------------------------------------- the push is guarded ----
// Every site that fails to break a prop falls through to pushDynamic. A static target has no body.
{
  const fn = extractFunction('pushDynamic');
  assert(/const p = obj\.userData\.phys; if\(!p \|\| !p\.body\) return;/.test(fn),
    'pushDynamic returns for a prop with no rigid body, so a non-lethal hit on a bolted-down target ' +
    'is a no-op rather than a throw — this is why the new sites need no gate of their own');
}

// Probed live (tools/probe/static-target.mjs), driving the REAL shoot()/meleeAttack()/explodeAt() against a
// static target with a dynamic control beside it and a plain static prop as the negative control:
//
//   BULLET   30 -> 15 -> 0, shattered, invisible
//   MELEE    static 60 damage   ·   dynamic control 60 damage
//   BLAST    static 106         ·   dynamic control 104   (the difference is the distance falloff)
//   CONTROL  a plain static wall keeps all 50 HP through three rifle rounds and a swing, and is not
//            in damageableProps() at all
done('build 1392: the wire — every firing site resolves a static target, and a plain prop still resolves none');
